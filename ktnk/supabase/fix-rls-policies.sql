-- ktnk RLS修正SQL
-- DBをNext.js API routesのservice roleからだけ操作できるようにします。

grant usage on schema public to anon, authenticated, service_role;

revoke all on public.company_master from anon, authenticated;
revoke all on public.schedule_groups from anon, authenticated;
revoke all on public.schedule_subcompanies from anon, authenticated;

grant select, insert, update, delete on public.company_master to service_role;
grant select, insert, update, delete on public.schedule_groups to service_role;
grant select, insert, update, delete on public.schedule_subcompanies to service_role;

alter table public.company_master enable row level security;
alter table public.schedule_groups enable row level security;
alter table public.schedule_subcompanies enable row level security;

drop policy if exists company_master_app_all on public.company_master;
drop policy if exists schedule_groups_app_all on public.schedule_groups;
drop policy if exists schedule_subcompanies_app_all on public.schedule_subcompanies;

notify pgrst, 'reload schema';
