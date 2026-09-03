-- ktnk RLS修正SQL
-- 既存データを消さずに、アプリ/APIから予定を登録・取得できるようにします。

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on public.schedule_groups to anon, authenticated, service_role;
grant select, insert, update, delete on public.schedule_subcompanies to anon, authenticated, service_role;

alter table public.schedule_groups enable row level security;
alter table public.schedule_subcompanies enable row level security;

drop policy if exists schedule_groups_app_all on public.schedule_groups;
create policy schedule_groups_app_all
on public.schedule_groups
for all
to anon, authenticated, service_role
using (true)
with check (true);

drop policy if exists schedule_subcompanies_app_all on public.schedule_subcompanies;
create policy schedule_subcompanies_app_all
on public.schedule_subcompanies
for all
to anon, authenticated, service_role
using (true)
with check (true);

notify pgrst, 'reload schema';
