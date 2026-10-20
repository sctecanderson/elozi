begin;

-- ============================================================================
-- 1. ADICIONA subscription_invoices À PUBLICAÇÃO supabase_realtime
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'subscription_invoices'
  ) then
    alter publication supabase_realtime add table public.subscription_invoices;
  end if;
end $$;

commit;
