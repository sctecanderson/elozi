begin;

-- ============================================================================
-- BLOCO 24: RELATÓRIO FINANCEIRO DE FECHAMENTO DE TURNO E AUTO-CADASTRO SAAS
-- ============================================================================

-- 1. Índice auxiliar para acelerar relatórios financeiros por período de fechamento
create index if not exists table_tabs_restaurant_closed_at_idx
  on public.table_tabs (restaurant_id, closed_at)
  where status = 'closed';

-- 2. RPC: public.get_restaurant_financial_report
create or replace function public.get_restaurant_financial_report(
  p_restaurant_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_is_authorized boolean := false;
  v_gross_revenue_cents bigint := 0;
  v_estimated_service_fee_cents bigint := 0;
  v_closed_tabs_count integer := 0;
  v_average_ticket_cents bigint := 0;
  v_cancelled_items_count integer := 0;
  v_cancelled_amount_cents bigint := 0;
  v_top_products jsonb := '[]'::jsonb;
  v_daily_breakdown jsonb := '[]'::jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Autenticação necessária para consultar o relatório financeiro.';
  end if;

  if p_restaurant_id is null or p_start_date is null or p_end_date is null then
    raise exception using errcode = '22023', message = 'Informe o restaurante e o intervalo de datas.';
  end if;

  if p_end_date < p_start_date then
    raise exception using errcode = '22023', message = 'A data final não pode ser anterior à data inicial.';
  end if;

  -- Validar se é admin ativo do restaurante ou platform admin
  select exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = p_restaurant_id
      and rm.user_id = v_uid
      and rm.role = 'admin'
      and rm.active = true
  ) or public.is_platform_admin()
  into v_is_authorized;

  if not coalesce(v_is_authorized, false) then
    raise exception using errcode = '42501', message = 'Acesso restrito ao administrador do estabelecimento.';
  end if;

  -- Total de comandas encerradas no período
  select count(*)::integer
  into v_closed_tabs_count
  from public.table_tabs t
  where t.restaurant_id = p_restaurant_id
    and t.status = 'closed'
    and t.closed_at >= p_start_date
    and t.closed_at <= p_end_date;

  -- Soma do faturamento bruto (itens ativos de comandas encerradas no período)
  select coalesce(sum(ti.line_total_in_cents), 0)::bigint
  into v_gross_revenue_cents
  from public.table_tabs t
  join public.table_tab_items ti
    on ti.table_tab_id = t.id
   and ti.restaurant_id = t.restaurant_id
  where t.restaurant_id = p_restaurant_id
    and t.status = 'closed'
    and t.closed_at >= p_start_date
    and t.closed_at <= p_end_date
    and ti.status != 'cancelled';

  -- Taxa de serviço estimada (10%) e Ticket Médio
  v_estimated_service_fee_cents := round(v_gross_revenue_cents * 0.10)::bigint;

  if v_closed_tabs_count > 0 then
    v_average_ticket_cents := round(v_gross_revenue_cents::numeric / v_closed_tabs_count)::bigint;
  else
    v_average_ticket_cents := 0;
  end if;

  -- Auditoria de itens cancelados/estornados no período
  select
    coalesce(sum(ti.quantity), 0)::integer,
    coalesce(sum(ti.line_total_in_cents), 0)::bigint
  into
    v_cancelled_items_count,
    v_cancelled_amount_cents
  from public.table_tab_items ti
  where ti.restaurant_id = p_restaurant_id
    and ti.status = 'cancelled'
    and coalesce(ti.cancelled_at, ti.created_at) >= p_start_date
    and coalesce(ti.cancelled_at, ti.created_at) <= p_end_date;

  -- Top 5 produtos mais vendidos em comandas encerradas no período
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_name', top_rows.product_name,
        'quantity_sold', top_rows.quantity_sold,
        'total_revenue_cents', top_rows.total_revenue_cents
      )
    ),
    '[]'::jsonb
  )
  into v_top_products
  from (
    select
      ti.product_name,
      sum(ti.quantity)::integer as quantity_sold,
      sum(ti.line_total_in_cents)::bigint as total_revenue_cents
    from public.table_tabs t
    join public.table_tab_items ti
      on ti.table_tab_id = t.id
     and ti.restaurant_id = t.restaurant_id
    where t.restaurant_id = p_restaurant_id
      and t.status = 'closed'
      and t.closed_at >= p_start_date
      and t.closed_at <= p_end_date
      and ti.status != 'cancelled'
    group by ti.product_name
    order by total_revenue_cents desc, quantity_sold desc, ti.product_name asc
    limit 5
  ) as top_rows;

  -- Evolução diária (agrupado por data de encerramento)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', daily_rows.day_str,
        'revenue_cents', daily_rows.revenue_cents,
        'tabs_count', daily_rows.tabs_count
      )
      order by daily_rows.day_str asc
    ),
    '[]'::jsonb
  )
  into v_daily_breakdown
  from (
    select
      to_char(t.closed_at at time zone 'UTC', 'YYYY-MM-DD') as day_str,
      count(distinct t.id)::integer as tabs_count,
      coalesce(
        sum(case when ti.status != 'cancelled' then ti.line_total_in_cents else 0 end),
        0
      )::bigint as revenue_cents
    from public.table_tabs t
    left join public.table_tab_items ti
      on ti.table_tab_id = t.id
     and ti.restaurant_id = t.restaurant_id
    where t.restaurant_id = p_restaurant_id
      and t.status = 'closed'
      and t.closed_at >= p_start_date
      and t.closed_at <= p_end_date
    group by to_char(t.closed_at at time zone 'UTC', 'YYYY-MM-DD')
  ) as daily_rows;

  return jsonb_build_object(
    'gross_revenue_cents', v_gross_revenue_cents,
    'estimated_service_fee_cents', v_estimated_service_fee_cents,
    'closed_tabs_count', v_closed_tabs_count,
    'average_ticket_cents', v_average_ticket_cents,
    'cancelled_items_count', v_cancelled_items_count,
    'cancelled_amount_cents', v_cancelled_amount_cents,
    'top_products', v_top_products,
    'daily_breakdown', v_daily_breakdown
  );
end;
$$;

revoke all on function public.get_restaurant_financial_report(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_restaurant_financial_report(uuid, timestamptz, timestamptz) to authenticated;

-- 3. RPC Atômica: public.register_trial_restaurant_onboarding
create or replace function public.register_trial_restaurant_onboarding(
  p_restaurant_name text,
  p_slug text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_name text;
  v_slug text;
  v_phone text;
  v_restaurant_id uuid;
  v_cat_entradas_id uuid;
  v_cat_pratos_id uuid;
  v_cat_bebidas_id uuid;
  v_prod_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória para criar um restaurante.';
  end if;

  v_name := btrim(coalesce(p_restaurant_name, ''));
  v_slug := lower(btrim(coalesce(p_slug, '')));
  v_phone := btrim(coalesce(p_phone, ''));

  if char_length(v_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'Informe um nome válido para o restaurante (2 a 120 caracteres).';
  end if;

  if char_length(v_slug) not between 3 and 80 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'O endereço (slug) deve conter apenas letras minúsculas, números e hífens.';
  end if;

  if v_slug in ('plataforma', 'admin', 'api', 'auth', 'criar-conta', 'convite', 'redefinir-senha') then
    raise exception using errcode = '22023', message = 'Este endereço (slug) já está em uso por outro restaurante';
  end if;

  if exists (select 1 from public.restaurants r where r.slug = v_slug) then
    raise exception using errcode = '22023', message = 'Este endereço (slug) já está em uso por outro restaurante';
  end if;

  v_restaurant_id := gen_random_uuid();

  -- 1. Criar restaurante em Trial Pro de 7 dias com limite de 15 mesas
  insert into public.restaurants (
    id,
    name,
    slug,
    subtitle,
    phone,
    active,
    subscription_plan,
    monthly_price_cents,
    max_tables,
    subscription_started_at,
    subscription_expires_at,
    billing_cycle_days
  ) values (
    v_restaurant_id,
    v_name,
    v_slug,
    'Cardápio Digital & Pedidos',
    v_phone,
    true,
    'pro',
    14900,
    15,
    now(),
    now() + interval '7 days',
    7
  );

  -- 2. Vincular usuário autenticado como admin/owner ativo
  insert into public.restaurant_members (
    id,
    restaurant_id,
    user_id,
    role,
    active
  ) values (
    gen_random_uuid(),
    v_restaurant_id,
    v_uid,
    'admin',
    true
  );

  -- 3. Seed Automático: 3 Mesas iniciais (Mesa 01, Mesa 02, Mesa 03)
  insert into public.restaurant_tables (id, restaurant_id, table_number, label, active, is_active)
  values
    (gen_random_uuid(), v_restaurant_id, 1, 'Mesa 01', true, true),
    (gen_random_uuid(), v_restaurant_id, 2, 'Mesa 02', true, true),
    (gen_random_uuid(), v_restaurant_id, 3, 'Mesa 03', true, true);

  -- 4. Seed Automático: 3 Categorias de exemplo
  v_cat_entradas_id := gen_random_uuid();
  v_cat_pratos_id := gen_random_uuid();
  v_cat_bebidas_id := gen_random_uuid();

  insert into public.menu_categories (id, restaurant_id, catalog_key, name, slug, sort_order, active)
  values
    (v_cat_entradas_id, v_restaurant_id, v_cat_entradas_id::text, 'Entradas & Porções', 'entradas-e-porcoes', 1, true),
    (v_cat_pratos_id, v_restaurant_id, v_cat_pratos_id::text, 'Pratos Principais', 'pratos-principais', 2, true),
    (v_cat_bebidas_id, v_restaurant_id, v_cat_bebidas_id::text, 'Bebidas', 'bebidas', 3, true);

  -- 5. Seed Automático: 5 Produtos de exemplo realistas
  v_prod_id := gen_random_uuid();
  insert into public.menu_products (
    id, restaurant_id, category_id, catalog_key, slug, name,
    short_description, description, price_in_cents, available, featured,
    sort_order, prep_time_min_minutes, prep_time_max_minutes, preparation_station
  ) values (
    v_prod_id, v_restaurant_id, v_cat_entradas_id, v_prod_id::text, 'batata-rustica-da-casa',
    'Batata Rústica da Casa',
    'Porção crocante com alecrim, alho assado e maionese artesanal.',
    'Batatas selecionadas cortadas em gomos rústicos, temperadas com alecrim fresco, flor de sal e acompanhadas de maionese da casa.',
    3490, true, true, 1, 12, 18, 'kitchen'
  );

  v_prod_id := gen_random_uuid();
  insert into public.menu_products (
    id, restaurant_id, category_id, catalog_key, slug, name,
    short_description, description, price_in_cents, available, featured,
    sort_order, prep_time_min_minutes, prep_time_max_minutes, preparation_station
  ) values (
    v_prod_id, v_restaurant_id, v_cat_pratos_id, v_prod_id::text, 'hamburguer-artesanal-duplo',
    'Hambúrguer Artesanal Duplo',
    'Dois blends bovinos 160g, queijo cheddar inglês, bacon e pão brioche.',
    'Pão brioche selado na manteiga, dois hambúrgueres artesanais de costela, cheddar derretido, bacon crocante e molho especial.',
    4290, true, true, 1, 15, 25, 'kitchen'
  );

  v_prod_id := gen_random_uuid();
  insert into public.menu_products (
    id, restaurant_id, category_id, catalog_key, slug, name,
    short_description, description, price_in_cents, available, featured,
    sort_order, prep_time_min_minutes, prep_time_max_minutes, preparation_station
  ) values (
    v_prod_id, v_restaurant_id, v_cat_pratos_id, v_prod_id::text, 'file-a-parmegiana',
    'Filé à Parmegiana',
    'Filé mignon empanado com molho de tomates frescos, gratinado com muçarela.',
    'Clássico filé mignon empanado na hora, coberto com molho rústico de tomates italianos, queijo gratinado, arroz branco e fritas.',
    6890, true, true, 2, 20, 30, 'kitchen'
  );

  v_prod_id := gen_random_uuid();
  insert into public.menu_products (
    id, restaurant_id, category_id, catalog_key, slug, name,
    short_description, description, price_in_cents, available, featured,
    sort_order, prep_time_min_minutes, prep_time_max_minutes, preparation_station
  ) values (
    v_prod_id, v_restaurant_id, v_cat_bebidas_id, v_prod_id::text, 'refrigerante-lata-350ml',
    'Refrigerante Lata 350ml',
    'Lata 350ml servida trincando de gelada com copo e gelo.',
    'Opções disponíveis: Coca-Cola Original, Coca-Cola Sem Açúcar, Guaraná Antarctica original ou zero.',
    850, true, false, 1, 2, 5, 'bar'
  );

  v_prod_id := gen_random_uuid();
  insert into public.menu_products (
    id, restaurant_id, category_id, catalog_key, slug, name,
    short_description, description, price_in_cents, available, featured,
    sort_order, prep_time_min_minutes, prep_time_max_minutes, preparation_station
  ) values (
    v_prod_id, v_restaurant_id, v_cat_bebidas_id, v_prod_id::text, 'suco-natural-500ml',
    'Suco Natural 500ml',
    'Feito na hora com frutas frescas selecionadas (Laranja, Limão ou Abacaxi).',
    'Suco 100% natural preparado na hora, sem adição de conservantes. Servido em copo de 500ml.',
    1490, true, false, 2, 5, 8, 'bar'
  );

  return jsonb_build_object(
    'restaurant_id', v_restaurant_id,
    'slug', v_slug
  );
exception
  when unique_violation then
    raise exception using errcode = '22023', message = 'Este endereço (slug) já está em uso por outro restaurante';
end;
$$;

revoke all on function public.register_trial_restaurant_onboarding(text, text, text) from public, anon, authenticated;
grant execute on function public.register_trial_restaurant_onboarding(text, text, text) to authenticated;

commit;
