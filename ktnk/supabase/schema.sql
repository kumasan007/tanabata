create extension if not exists pgcrypto;

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
  unique (work_date, primary_company)
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

create index if not exists schedule_subcompanies_group_id_idx
  on public.schedule_subcompanies (schedule_group_id);

alter table public.schedule_groups enable row level security;
alter table public.schedule_subcompanies enable row level security;

-- Browser clients should not access schedules directly.
-- Next.js API routes use SUPABASE_SERVICE_ROLE_KEY on the server side.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists schedule_groups_set_updated_at on public.schedule_groups;
create trigger schedule_groups_set_updated_at
before update on public.schedule_groups
for each row
execute function public.set_updated_at();
