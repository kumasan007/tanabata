create extension if not exists pgcrypto;

create table if not exists public.company_master (
  id uuid primary key default gen_random_uuid(),
  primary_company text not null,
  secondary_company text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_master_primary_idx
  on public.company_master (primary_company);

create index if not exists company_master_sort_idx
  on public.company_master (sort_order);

create table if not exists public.schedule_groups (
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

create table if not exists public.schedule_subcompanies (
  id uuid primary key default gen_random_uuid(),
  schedule_group_id uuid not null references public.schedule_groups(id) on delete cascade,
  kind text not null check (kind in ('current', 'next_visit')),
  secondary_company text,
  worker_count integer check (worker_count is null or worker_count >= 0),
  sort_order integer not null default 0
);

create index if not exists schedule_groups_work_date_idx
  on public.schedule_groups (work_date);

create index if not exists schedule_groups_primary_company_idx
  on public.schedule_groups (primary_company);

create index if not exists schedule_groups_status_idx
  on public.schedule_groups (status);

create index if not exists schedule_subcompanies_group_id_idx
  on public.schedule_subcompanies (schedule_group_id);

create index if not exists schedule_subcompanies_secondary_company_idx
  on public.schedule_subcompanies (secondary_company);

alter table public.company_master enable row level security;
alter table public.schedule_groups enable row level security;
alter table public.schedule_subcompanies enable row level security;

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on public.company_master to anon, authenticated, service_role;
grant select, insert, update, delete on public.schedule_groups to anon, authenticated, service_role;
grant select, insert, update, delete on public.schedule_subcompanies to anon, authenticated, service_role;

-- Company master is managed from the admin dashboard and kept in Supabase.
drop policy if exists company_master_app_all on public.company_master;
create policy company_master_app_all
on public.company_master
for all
to anon, authenticated, service_role
using (true)
with check (true);

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

-- This app uses Next.js API routes as the entry point.
-- The database policy is intentionally simple because the worker form is public.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_master_set_updated_at on public.company_master;
create trigger company_master_set_updated_at
before update on public.company_master
for each row
execute function public.set_updated_at();

drop trigger if exists schedule_groups_set_updated_at on public.schedule_groups;
create trigger schedule_groups_set_updated_at
before update on public.schedule_groups
for each row
execute function public.set_updated_at();

notify pgrst, 'reload schema';
