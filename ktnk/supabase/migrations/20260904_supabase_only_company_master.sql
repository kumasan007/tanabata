-- 既存のcompany_masterをSupabase専用実装向けに更新する。
-- 会社データは保持し、空欄と重複だけを整理する。

create extension if not exists pgcrypto;

create table if not exists public.company_master (
  id uuid primary key default gen_random_uuid(),
  primary_company text not null,
  secondary_company text,
  sort_order integer not null default 0
);

alter table public.company_master
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists sort_order integer not null default 0;

update public.company_master
set id = gen_random_uuid()
where id is null;

alter table public.company_master
  alter column id set default gen_random_uuid(),
  alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_master'::regclass
      and contype = 'p'
  ) then
    alter table public.company_master
      add constraint company_master_pkey primary key (id);
  end if;
end
$$;

update public.company_master
set secondary_company = null
where btrim(coalesce(secondary_company, '')) = '';

delete from public.company_master duplicate
using public.company_master keeper
where duplicate.ctid > keeper.ctid
  and duplicate.primary_company = keeper.primary_company
  and duplicate.secondary_company is not distinct from keeper.secondary_company;

create index if not exists company_master_primary_idx
  on public.company_master (primary_company);

create unique index if not exists company_master_company_unique_idx
  on public.company_master (primary_company, coalesce(secondary_company, ''));

do $$
begin
  if (select count(*) > 1 and count(distinct sort_order) = 1 from public.company_master) then
    with ordered as (
      select id, row_number() over (order by primary_company, secondary_company nulls first, id) - 1 as position
      from public.company_master
    )
    update public.company_master company
    set sort_order = ordered.position
    from ordered
    where company.id = ordered.id;
  end if;
end
$$;

alter table public.company_master enable row level security;

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on public.company_master to anon, authenticated, service_role;
grant select, insert, update, delete on public.schedule_groups to anon, authenticated, service_role;
grant select, insert, update, delete on public.schedule_subcompanies to anon, authenticated, service_role;

drop policy if exists company_master_app_all on public.company_master;
create policy company_master_app_all
on public.company_master for all to anon, authenticated
using (true) with check (true);

drop policy if exists schedule_groups_app_all on public.schedule_groups;
create policy schedule_groups_app_all
on public.schedule_groups for all to anon, authenticated
using (true) with check (true);

drop policy if exists schedule_subcompanies_app_all on public.schedule_subcompanies;
create policy schedule_subcompanies_app_all
on public.schedule_subcompanies for all to anon, authenticated
using (true) with check (true);

notify pgrst, 'reload schema';
