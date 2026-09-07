-- 既存の入力データ行を残し、現在のアプリが必要とするスキーマへ更新する。
-- アプリで使わなくなった旧列・旧制約は削除する。
-- Supabase SQL Editor でファイル全体を1回実行する。再実行しても問題ない構成。

begin;

create extension if not exists pgcrypto;

create table if not exists public.company_master (
  id uuid primary key default gen_random_uuid(),
  primary_company text not null,
  secondary_company text,
  primary_trade_roles text[] not null default '{}'::text[],
  sort_order integer not null default 0
);

alter table public.company_master
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists primary_company text,
  add column if not exists secondary_company text,
  add column if not exists primary_trade_roles text[] default '{}'::text[],
  add column if not exists sort_order integer default 0;

update public.company_master set id = gen_random_uuid() where id is null;
update public.company_master set primary_trade_roles = '{}'::text[] where primary_trade_roles is null;
update public.company_master set sort_order = 0 where sort_order is null;

alter table public.company_master
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column primary_company set not null,
  alter column primary_trade_roles set default '{}'::text[],
  alter column primary_trade_roles set not null,
  alter column sort_order set default 0,
  alter column sort_order set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.company_master'::regclass and contype = 'p'
  ) then
    alter table public.company_master
      add constraint company_master_pkey primary key (id);
  end if;
end
$$;

-- 重複行は勝手に削除しない。重複がある場合は全変更をロールバックして対象を通知する。
do $$
begin
  if exists (
    select 1
    from public.company_master
    group by primary_company, coalesce(secondary_company, '')
    having count(*) > 1
  ) then
    raise exception
      'company_master に同じ一次会社・二次会社の重複があります。データを削除せず中断しました。';
  end if;
end
$$;

create unique index if not exists company_master_company_unique_idx
  on public.company_master (primary_company, coalesce(secondary_company, ''));
create index if not exists company_master_primary_idx
  on public.company_master (primary_company);

create table if not exists public.schedule_groups (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  status text not null,
  primary_company text not null,
  primary_count integer,
  work_area text,
  work_content text,
  next_visit_date date,
  next_primary_count integer,
  next_work_area text,
  next_work_content text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedule_groups
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists work_date date,
  add column if not exists status text,
  add column if not exists primary_company text,
  add column if not exists primary_count integer,
  add column if not exists work_area text,
  add column if not exists work_content text,
  add column if not exists next_visit_date date,
  add column if not exists next_primary_count integer,
  add column if not exists next_work_area text,
  add column if not exists next_work_content text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.schedule_groups set id = gen_random_uuid() where id is null;
update public.schedule_groups set created_at = now() where created_at is null;
update public.schedule_groups set updated_at = now() where updated_at is null;

alter table public.schedule_groups
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column work_date set not null,
  alter column status set not null,
  alter column primary_company set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedule_groups'::regclass and contype = 'p'
  ) then
    alter table public.schedule_groups
      add constraint schedule_groups_pkey primary key (id);
  end if;

  if exists (
    select 1
    from public.schedule_groups
    group by work_date, primary_company
    having count(*) > 1
  ) then
    raise exception
      'schedule_groups に同じ作業日・一次会社の重複があります。データを削除せず中断しました。';
  end if;
end
$$;

create unique index if not exists schedule_groups_work_date_primary_company_idx
  on public.schedule_groups (work_date, primary_company);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedule_groups'::regclass
      and conname = 'schedule_groups_status_check'
  ) then
    alter table public.schedule_groups
      add constraint schedule_groups_status_check
      check (status in ('work', 'no_work')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedule_groups'::regclass
      and conname = 'schedule_groups_primary_count_check'
  ) then
    alter table public.schedule_groups
      add constraint schedule_groups_primary_count_check
      check (primary_count is null or primary_count >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedule_groups'::regclass
      and conname = 'schedule_groups_next_primary_count_check'
  ) then
    alter table public.schedule_groups
      add constraint schedule_groups_next_primary_count_check
      check (next_primary_count is null or next_primary_count >= 0) not valid;
  end if;
end
$$;

create table if not exists public.schedule_subcompanies (
  id uuid primary key default gen_random_uuid(),
  schedule_group_id uuid not null,
  kind text not null,
  secondary_company text,
  worker_count integer,
  sort_order integer not null default 0
);

alter table public.schedule_subcompanies
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists schedule_group_id uuid,
  add column if not exists kind text,
  add column if not exists secondary_company text,
  add column if not exists worker_count integer,
  add column if not exists sort_order integer default 0;

update public.schedule_subcompanies set id = gen_random_uuid() where id is null;
update public.schedule_subcompanies set sort_order = 0 where sort_order is null;

alter table public.schedule_subcompanies
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column schedule_group_id set not null,
  alter column kind set not null,
  alter column sort_order set default 0,
  alter column sort_order set not null;

-- 旧統合SQLが追加した重複外部キーを除去し、PostgRESTが関係を一意に判定できるようにする。
alter table public.schedule_subcompanies
  drop constraint if exists schedule_subcompanies_group_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedule_subcompanies'::regclass and contype = 'p'
  ) then
    alter table public.schedule_subcompanies
      add constraint schedule_subcompanies_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedule_subcompanies'::regclass
      and conname = 'schedule_subcompanies_schedule_group_id_fkey'
  ) then
    alter table public.schedule_subcompanies
      add constraint schedule_subcompanies_schedule_group_id_fkey
      foreign key (schedule_group_id) references public.schedule_groups(id)
      on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedule_subcompanies'::regclass
      and conname = 'schedule_subcompanies_kind_check'
  ) then
    alter table public.schedule_subcompanies
      add constraint schedule_subcompanies_kind_check
      check (kind in ('current', 'next_visit')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedule_subcompanies'::regclass
      and conname = 'schedule_subcompanies_worker_count_check'
  ) then
    alter table public.schedule_subcompanies
      add constraint schedule_subcompanies_worker_count_check
      check (worker_count is null or worker_count >= 0) not valid;
  end if;
end
$$;

create table if not exists public.new_entrant_records (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  primary_company text not null,
  secondary_company text not null,
  person_count integer not null,
  person_names text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.new_entrant_records
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists entry_date date,
  add column if not exists primary_company text,
  add column if not exists secondary_company text,
  add column if not exists person_count integer,
  add column if not exists person_names text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.new_entrant_records set id = gen_random_uuid() where id is null;
update public.new_entrant_records set created_at = now() where created_at is null;
update public.new_entrant_records set updated_at = now() where updated_at is null;

alter table public.new_entrant_records
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column entry_date set not null,
  alter column primary_company set not null,
  alter column secondary_company set not null,
  alter column person_count set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.new_entrant_records
  drop constraint if exists new_entrant_records_has_entry_check;

alter table public.new_entrant_records
  drop column if exists is_new_company;

alter table public.new_entrant_records
  drop constraint if exists new_entrant_records_person_count_check;

alter table public.new_entrant_records
  add constraint new_entrant_records_person_count_check
  check (person_count > 0) not valid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.new_entrant_records'::regclass and contype = 'p'
  ) then
    alter table public.new_entrant_records
      add constraint new_entrant_records_pkey primary key (id);
  end if;

  if exists (
    select 1
    from public.new_entrant_records
    group by entry_date, primary_company, secondary_company
    having count(*) > 1
  ) then
    raise exception
      'new_entrant_records に同じ入場日・一次会社・二次会社の重複があります。データを削除せず中断しました。';
  end if;
end
$$;

create unique index if not exists new_entrant_records_date_company_idx
  on public.new_entrant_records (entry_date, primary_company, secondary_company);

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
create index if not exists new_entrant_records_entry_date_idx
  on public.new_entrant_records (entry_date);

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
for each row execute function public.set_updated_at();

drop trigger if exists new_entrant_records_set_updated_at on public.new_entrant_records;
create trigger new_entrant_records_set_updated_at
before update on public.new_entrant_records
for each row execute function public.set_updated_at();

alter table public.company_master enable row level security;
alter table public.schedule_groups enable row level security;
alter table public.schedule_subcompanies enable row level security;
alter table public.new_entrant_records enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.company_master
  to anon, authenticated, service_role;
grant select, insert, update, delete on public.schedule_groups
  to anon, authenticated, service_role;
grant select, insert, update, delete on public.schedule_subcompanies
  to anon, authenticated, service_role;
grant select, insert, update, delete on public.new_entrant_records
  to anon, authenticated, service_role;

drop policy if exists company_master_app_all on public.company_master;
create policy company_master_app_all on public.company_master
for all to anon, authenticated using (true) with check (true);

drop policy if exists schedule_groups_app_all on public.schedule_groups;
create policy schedule_groups_app_all on public.schedule_groups
for all to anon, authenticated using (true) with check (true);

drop policy if exists schedule_subcompanies_app_all on public.schedule_subcompanies;
create policy schedule_subcompanies_app_all on public.schedule_subcompanies
for all to anon, authenticated using (true) with check (true);

drop policy if exists new_entrant_records_app_all on public.new_entrant_records;
create policy new_entrant_records_app_all on public.new_entrant_records
for all to anon, authenticated using (true) with check (true);

notify pgrst, 'reload schema';

commit;
