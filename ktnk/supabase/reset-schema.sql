-- ktnk 作業予定入力システム 初期化SQL
-- Supabase SQL Editorで実行すると、既存データを削除して必要なテーブルを作り直します。

drop trigger if exists schedule_groups_set_updated_at on public.schedule_groups;
drop table if exists public.schedule_subcompanies;
drop table if exists public.schedule_groups;
drop function if exists public.set_updated_at();

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
    select 1 from pg_constraint
    where conrelid = 'public.company_master'::regclass and contype = 'p'
  ) then
    alter table public.company_master add constraint company_master_pkey primary key (id);
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

create index if not exists company_master_primary_idx on public.company_master (primary_company);
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

create table public.schedule_groups (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  status text not null check (status in ('work', 'no_work')),
  primary_company text not null,
  primary_count integer check (primary_count is null or primary_count >= 0),
  work_area text,
  work_content text,
  next_visit_date date,
  next_primary_count integer check (next_primary_count is null or next_primary_count >= 0),
  next_work_area text,
  next_work_content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_groups_work_date_primary_company_key unique (work_date, primary_company)
);

create table public.schedule_subcompanies (
  id uuid primary key default gen_random_uuid(),
  schedule_group_id uuid not null references public.schedule_groups(id) on delete cascade,
  kind text not null check (kind in ('current', 'next_visit')),
  secondary_company text,
  worker_count integer check (worker_count is null or worker_count >= 0),
  sort_order integer not null default 0
);

create index schedule_groups_work_date_idx
  on public.schedule_groups (work_date);

create index schedule_groups_primary_company_idx
  on public.schedule_groups (primary_company);

create index schedule_groups_status_idx
  on public.schedule_groups (status);

create index schedule_subcompanies_group_id_idx
  on public.schedule_subcompanies (schedule_group_id);

create index schedule_subcompanies_secondary_company_idx
  on public.schedule_subcompanies (secondary_company);

alter table public.company_master enable row level security;
alter table public.schedule_groups enable row level security;
alter table public.schedule_subcompanies enable row level security;

grant usage on schema public to anon, authenticated, service_role;

revoke all on public.company_master from anon, authenticated;
revoke all on public.schedule_groups from anon, authenticated;
revoke all on public.schedule_subcompanies from anon, authenticated;

grant select, insert, update, delete on public.company_master to service_role;
grant select, insert, update, delete on public.schedule_groups to service_role;
grant select, insert, update, delete on public.schedule_subcompanies to service_role;

drop policy if exists company_master_app_all on public.company_master;

-- このアプリはNext.js API routesを入口とし、DBはservice roleだけが操作します。

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger schedule_groups_set_updated_at
before update on public.schedule_groups
for each row
execute function public.set_updated_at();

notify pgrst, 'reload schema';
