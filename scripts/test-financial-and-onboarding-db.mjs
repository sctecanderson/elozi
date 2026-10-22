import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PGLITE_MODULE_PATH =
  process.env.PGLITE_MODULE ||
  'C:\\Users\\Anderson\\.gemini\\antigravity\\brain\\6ec224d7-f161-44c2-b5ff-d8efb9ccff14\\scratch\\test-env\\node_modules\\@electric-sql\\pglite\\dist\\index.js';

const { PGlite } = await import(`file:///${PGLITE_MODULE_PATH.replace(/\\/g, '/')}`);

console.log('--- Iniciando Banco PostgreSQL Local (PGlite) para Validacao do Bloco 24 ---');
const db = new PGlite();

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create publication supabase_realtime;
  create schema auth;

  create table auth.users (
    id uuid primary key,
    email text,
    email_confirmed_at timestamptz default now(),
    is_anonymous boolean default false
  );

  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;

  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  $$;

  create table public.restaurants (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    subtitle text,
    phone text,
    active boolean not null default true,
    subscription_plan text not null default 'starter',
    monthly_price_cents integer not null default 14900,
    max_tables integer not null default 10,
    subscription_started_at timestamptz,
    subscription_expires_at timestamptz,
    billing_cycle_days integer not null default 30,
    created_at timestamptz not null default now()
  );

  create table public.restaurant_members (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('admin', 'waiter')),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    unique (restaurant_id, user_id)
  );

  create table public.platform_admins (
    user_id uuid primary key references auth.users(id) on delete cascade
  );

  create function public.is_platform_admin() returns boolean language sql stable as $$
    select exists (select 1 from public.platform_admins where user_id = auth.uid());
  $$;

  create table public.restaurant_tables (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    table_number integer not null,
    label text not null,
    active boolean not null default true,
    is_active boolean not null default true,
    unique (restaurant_id, table_number)
  );

  create table public.menu_categories (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    catalog_key text,
    name text not null,
    slug text not null,
    sort_order integer not null default 0,
    active boolean not null default true,
    unique (restaurant_id, slug)
  );

  create table public.menu_products (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    category_id uuid not null references public.menu_categories(id) on delete cascade,
    catalog_key text,
    slug text not null,
    name text not null,
    short_description text not null default '',
    description text not null default '',
    price_in_cents integer not null check (price_in_cents >= 0),
    available boolean not null default true,
    featured boolean not null default false,
    sort_order integer not null default 0,
    prep_time_min_minutes integer,
    prep_time_max_minutes integer,
    preparation_station text not null default 'kitchen',
    unique (restaurant_id, slug)
  );

  create table public.table_tabs (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    table_id uuid not null references public.restaurant_tables(id) on delete cascade,
    tab_number integer not null default 1,
    customer_name text,
    status text not null default 'open' check (status in ('open', 'closed')),
    opened_at timestamptz not null default now(),
    closed_at timestamptz,
    closed_by_member_id uuid references public.restaurant_members(id)
  );

  create table public.table_tab_items (
    id uuid primary key default gen_random_uuid(),
    table_tab_id uuid not null references public.table_tabs(id) on delete cascade,
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    product_id uuid references public.menu_products(id) on delete set null,
    product_name text not null,
    unit_price_in_cents integer not null,
    quantity integer not null check (quantity > 0),
    line_total_in_cents bigint generated always as (unit_price_in_cents::bigint * quantity::bigint) stored,
    status text not null default 'active' check (status in ('active', 'cancelled')),
    cancelled_at timestamptz,
    created_at timestamptz not null default now()
  );
`);

// Aplica a migration do Bloco 24
const migrationSql = fs.readFileSync(
  path.resolve('supabase/migrations/20261016080000_financial_reports_and_onboarding.sql'),
  'utf8'
);
await db.exec(migrationSql);
console.log('[OK] Migration 20261016080000_financial_reports_and_onboarding.sql aplicada.');

// Cria usuario de teste e autentica via request.jwt.claim.sub
const testUserId = '11111111-2222-3333-4444-555555555555';
await db.exec(`
  insert into auth.users (id, email) values ('${testUserId}', 'owner@bellanapoli.com.br');
  select set_config('request.jwt.claim.sub', '${testUserId}', false);
`);

// 1. Testa register_trial_restaurant_onboarding
const onboardingRes = await db.query(
  `select public.register_trial_restaurant_onboarding($1, $2, $3) as data`,
  ['Pizzaria Bella Napoli', 'pizzaria-bella-napoli', '(11) 98888-7777']
);

const onboardingData = onboardingRes.rows[0].data;
assert.ok(onboardingData.restaurant_id, 'Deve retornar restaurant_id');
assert.equal(onboardingData.slug, 'pizzaria-bella-napoli');

const restaurantId = onboardingData.restaurant_id;

// Verifica restaurante com 7 dias de Trial no plano Pro
const restCheck = await db.query(
  `select name, subscription_plan, max_tables, billing_cycle_days,
          extract(epoch from (subscription_expires_at - subscription_started_at)) / 86400 as trial_days
   from public.restaurants where id = $1`,
  [restaurantId]
);
assert.equal(restCheck.rows[0].name, 'Pizzaria Bella Napoli');
assert.equal(restCheck.rows[0].subscription_plan, 'pro');
assert.equal(restCheck.rows[0].max_tables, 15);
assert.equal(restCheck.rows[0].billing_cycle_days, 7);
assert.ok(
  Math.abs(Number(restCheck.rows[0].trial_days) - 7) < 0.05,
  'Trial deve ser de exatamente 7 dias'
);

// Verifica vinculo de admin
const memberCheck = await db.query(
  `select role, active from public.restaurant_members where restaurant_id = $1 and user_id = $2`,
  [restaurantId, testUserId]
);
assert.equal(memberCheck.rows.length, 1);
assert.equal(memberCheck.rows[0].role, 'admin');
assert.equal(memberCheck.rows[0].active, true);

// Verifica seed de 3 mesas, 3 categorias e 5 produtos
const tablesCount = await db.query(
  `select count(*)::int as cnt from public.restaurant_tables where restaurant_id = $1`,
  [restaurantId]
);
assert.equal(tablesCount.rows[0].cnt, 3, 'Deve criar 3 mesas iniciais');

const categoriesCount = await db.query(
  `select count(*)::int as cnt from public.menu_categories where restaurant_id = $1`,
  [restaurantId]
);
assert.equal(categoriesCount.rows[0].cnt, 3, 'Deve criar 3 categorias iniciais');

const productsCount = await db.query(
  `select count(*)::int as cnt from public.menu_products where restaurant_id = $1`,
  [restaurantId]
);
assert.equal(productsCount.rows[0].cnt, 5, 'Deve criar 5 produtos demonstrativos');
console.log('[OK] register_trial_restaurant_onboarding criou Trial 7 dias, admin, 3 mesas, 3 categorias e 5 produtos.');

// Verifica rejeicao de slug duplicado
let duplicateRejected = false;
try {
  await db.query(
    `select public.register_trial_restaurant_onboarding($1, $2, $3)`,
    ['Outro Restaurante', 'pizzaria-bella-napoli', null]
  );
} catch (err) {
  duplicateRejected = err.message.includes('Este endereço (slug) já está em uso');
}
assert.equal(duplicateRejected, true, 'Deve rejeitar slug duplicado com mensagem amigavel');
console.log('[OK] Slug duplicado rejeitado com sucesso.');

// 2. Testa get_restaurant_financial_report
const tableRow = await db.query(
  `select id from public.restaurant_tables where restaurant_id = $1 order by table_number limit 1`,
  [restaurantId]
);
const tableId = tableRow.rows[0].id;

// Cria 2 comandas fechadas e 1 comanda aberta (comanda aberta nao entra no fechamento)
const tabsInsert = await db.query(
  `insert into public.table_tabs (restaurant_id, table_id, tab_number, status, opened_at, closed_at)
   values
     ($1, $2, 1, 'closed', now() - interval '2 hours', now() - interval '1 hour'),
     ($1, $2, 2, 'closed', now() - interval '3 hours', now() - interval '30 minutes'),
     ($1, $2, 3, 'open', now() - interval '20 minutes', null)
   returning id, status`,
  [restaurantId, tableId]
);

const closedTab1 = tabsInsert.rows[0].id;
const closedTab2 = tabsInsert.rows[1].id;
const openTab3 = tabsInsert.rows[2].id;

// Insere itens:
// Comanda 1 (fechada):
// - 2x Hamburguer Artesanal Duplo (3890 * 2 = 7780) [active]
// - 1x Refrigerante Lata 350ml (750 * 1 = 750) [cancelled] -> deve ir para auditoria de cancelados, NAO para gross_revenue
// Comanda 2 (fechada):
// - 1x File a Parmegiana (6490 * 1 = 6490) [active]
// - 2x Suco Natural 500ml (1200 * 2 = 2400) [active]
// Comanda 3 (aberta):
// - 1x Batata Rustica da Casa (3490 * 1 = 3490) [active] -> comanda aberta nao entra no gross_revenue de comandas fechadas
// - 1x Batata Rustica da Casa (3490 * 1 = 3490) [cancelled] -> item cancelado no periodo entra na auditoria de cancelamentos

await db.query(
  `insert into public.table_tab_items (table_tab_id, restaurant_id, product_name, unit_price_in_cents, quantity, status, created_at)
   values
     ($1, $4, 'Hambúrguer Artesanal Duplo', 3890, 2, 'active', now() - interval '90 minutes'),
     ($1, $4, 'Refrigerante Lata 350ml', 750, 1, 'cancelled', now() - interval '80 minutes'),
     ($2, $4, 'Filé à Parmegiana', 6490, 1, 'active', now() - interval '60 minutes'),
     ($2, $4, 'Suco Natural 500ml', 1200, 2, 'active', now() - interval '50 minutes'),
     ($3, $4, 'Batata Rústica da Casa', 3490, 1, 'active', now() - interval '10 minutes'),
     ($3, $4, 'Batata Rústica da Casa', 3490, 1, 'cancelled', now() - interval '5 minutes')`,
  [closedTab1, closedTab2, openTab3, restaurantId]
);

// Receita bruta esperada (somente comandas fechadas e itens ativos):
// 7780 + 6490 + 2400 = 16670 centavos (R$ 166,70)
// Taxa de servico estimada (10%): round(16670 * 0.10) = 1667 centavos
// Comandas fechadas: 2
// Ticket medio: round(16670 / 2) = 8335 centavos
// Cancelados no periodo: 2 itens (750 + 3490 = 4240 centavos)

const reportRes = await db.query(
  `select public.get_restaurant_financial_report($1, now() - interval '1 day', now() + interval '1 hour') as report`,
  [restaurantId]
);

const report = reportRes.rows[0].report;
assert.equal(report.gross_revenue_cents, 16670, 'Faturamento bruto deve somar apenas itens ativos de comandas fechadas');
assert.equal(report.estimated_service_fee_cents, 1667, 'Taxa de servico estimada deve ser 10% do faturamento bruto');
assert.equal(report.closed_tabs_count, 2, 'Deve contabilizar exatamente 2 comandas fechadas');
assert.equal(report.average_ticket_cents, 8335, 'Ticket medio deve ser gross_revenue / closed_tabs_count');
assert.equal(report.cancelled_items_count, 2, 'Deve contabilizar os 2 itens cancelados no periodo');
assert.equal(report.cancelled_amount_cents, 4240, 'Deve somar o valor estornado dos itens cancelados (750 + 3490)');
assert.equal(report.top_products.length, 3, 'Top produtos deve listar os 3 produtos vendidos nas comandas fechadas');
assert.equal(report.top_products[0].product_name, 'Hambúrguer Artesanal Duplo');
assert.equal(report.top_products[0].quantity_sold, 2);
assert.equal(report.top_products[0].total_revenue_cents, 7780);
assert.equal(report.daily_breakdown.length, 1, 'Daily breakdown deve consolidar o dia atual');
assert.equal(report.daily_breakdown[0].revenue_cents, 16670);

console.log('[OK] get_restaurant_financial_report validado com sucesso:', JSON.stringify(report));
console.log('--- TODOS OS TESTES DO BLOCO 24 PASSARAM COM SUCESSO ---');
