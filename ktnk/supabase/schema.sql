create extension if not exists pgcrypto;

create table if not exists public.company_master (
  id uuid primary key default gen_random_uuid(),
  primary_company text not null,
  secondary_company text,
  primary_trade_roles text[] not null default '{}'::text[],
  sort_order integer not null default 0
);

-- 旧スキーマで作成済みのテーブルも、このファイルの再実行で更新する。
alter table public.company_master
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists primary_trade_roles text[] not null default '{}'::text[],
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

create table if not exists public.schedule_groups (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  primary_company text not null,
  primary_count integer check (primary_count is null or primary_count >= 0),
  work_area text,
  work_content text,
  aerial_work_vehicle_count integer check (aerial_work_vehicle_count is null or aerial_work_vehicle_count >= 0),
  aerial_work_vehicle_floor text,
  uses_fire boolean not null default false,
  uses_tachiuma boolean not null default false,
  tachiuma_notes text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_groups_work_date_primary_company_key unique (work_date, primary_company)
);

create table if not exists public.schedule_subcompanies (
  id uuid primary key default gen_random_uuid(),
  schedule_group_id uuid not null references public.schedule_groups(id) on delete cascade,
  secondary_company text,
  worker_count integer check (worker_count is null or worker_count >= 0),
  sort_order integer not null default 0
);

create table if not exists public.schedule_aerial_work_vehicles (
  id uuid primary key default gen_random_uuid(),
  schedule_group_id uuid not null references public.schedule_groups(id) on delete cascade,
  work_area text not null check (btrim(work_area) <> ''),
  vehicle_count integer not null check (vehicle_count > 0),
  sort_order integer not null default 0
);

alter table public.schedule_groups add column if not exists notes text;
alter table public.schedule_groups add column if not exists aerial_work_vehicle_count integer
  check (aerial_work_vehicle_count is null or aerial_work_vehicle_count >= 0);
alter table public.schedule_groups add column if not exists aerial_work_vehicle_floor text;
alter table public.schedule_groups add column if not exists uses_fire boolean not null default false;
alter table public.schedule_groups add column if not exists uses_tachiuma boolean not null default false;
alter table public.schedule_groups add column if not exists tachiuma_notes text;

create table if not exists public.new_entrant_records (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  primary_company text not null,
  secondary_company text not null,
  person_count integer not null check (person_count > 0),
  person_names text not null check (btrim(person_names) <> ''),
  nationality_status text
    check (nationality_status in ('japanese_only', 'includes_foreign')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists schedule_groups_work_date_idx
  on public.schedule_groups (work_date);

create index if not exists schedule_groups_primary_company_idx
  on public.schedule_groups (primary_company);

create index if not exists schedule_groups_primary_date_idx
  on public.schedule_groups (primary_company, work_date);

create index if not exists schedule_subcompanies_group_id_idx
  on public.schedule_subcompanies (schedule_group_id);

create index if not exists schedule_subcompanies_secondary_company_idx
  on public.schedule_subcompanies (secondary_company);

create index if not exists schedule_aerial_work_vehicles_group_idx
  on public.schedule_aerial_work_vehicles (schedule_group_id, sort_order);

create index if not exists new_entrant_records_primary_date_idx
  on public.new_entrant_records (primary_company, entry_date);

create index if not exists new_entrant_records_company_date_idx
  on public.new_entrant_records (entry_date, primary_company, secondary_company);

alter table public.company_master enable row level security;
alter table public.schedule_groups enable row level security;
alter table public.schedule_subcompanies enable row level security;
alter table public.schedule_aerial_work_vehicles enable row level security;
alter table public.new_entrant_records enable row level security;

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on public.company_master to anon, authenticated, service_role;
grant select, insert, update, delete on public.schedule_groups to anon, authenticated, service_role;
grant select, insert, update, delete on public.schedule_subcompanies to anon, authenticated, service_role;
grant select, insert, update, delete on public.schedule_aerial_work_vehicles to anon, authenticated, service_role;
grant select, insert, update, delete on public.new_entrant_records to anon, authenticated, service_role;

-- Next.js API routesはservice roleとanonキーのどちらでも利用できる。
drop policy if exists company_master_app_all on public.company_master;
create policy company_master_app_all
on public.company_master
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists schedule_groups_app_all on public.schedule_groups;
create policy schedule_groups_app_all
on public.schedule_groups
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists schedule_subcompanies_app_all on public.schedule_subcompanies;
create policy schedule_subcompanies_app_all
on public.schedule_subcompanies
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists schedule_aerial_work_vehicles_app_all on public.schedule_aerial_work_vehicles;
create policy schedule_aerial_work_vehicles_app_all on public.schedule_aerial_work_vehicles
for all to anon, authenticated using (true) with check (true);

drop policy if exists new_entrant_records_app_all on public.new_entrant_records;
create policy new_entrant_records_app_all on public.new_entrant_records
for all to anon, authenticated using (true) with check (true);

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

drop trigger if exists new_entrant_records_set_updated_at on public.new_entrant_records;
create trigger new_entrant_records_set_updated_at before update on public.new_entrant_records
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';


-- 親予定・二次会社・高所作業車を一つのトランザクションで保存する。
-- SECURITY INVOKER: 既存のテーブル権限・RLSを維持する。
create or replace function public.save_schedule_atomically(
  p_groups jsonb,
  p_subcompanies jsonb,
  p_vehicles jsonb,
  p_overwrite boolean default false,
  p_skip_existing boolean default false,
  p_expected_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  primary_name text;
  work_day date;
  group_id uuid;
  conflicts date[];
  saved_dates date[] := '{}'::date[];
  saved_ids uuid[] := '{}'::uuid[];
begin
  if jsonb_typeof(p_groups) is distinct from 'array'
    or jsonb_array_length(p_groups) not between 1 and 180
    or jsonb_typeof(p_subcompanies) is distinct from 'array'
    or jsonb_typeof(p_vehicles) is distinct from 'array' then
    raise exception 'Invalid schedule payload';
  end if;
  primary_name := p_groups->0->>'primary_company';
  if coalesce(btrim(primary_name), '') = ''
    or exists (select 1 from jsonb_array_elements(p_groups) g where g->>'primary_company' is distinct from primary_name)
    or (select count(distinct g->>'work_date') from jsonb_array_elements(p_groups) g) <> jsonb_array_length(p_groups) then
    raise exception 'Invalid schedule company or dates';
  end if;

  -- 複数日でも同じ順にロックする。確認と書き込みの間の同時送信を直列化。
  for work_day in
    select (g->>'work_date')::date from jsonb_array_elements(p_groups) g order by 1
  loop
    if work_day is null or extract(dow from work_day) = 0 then
      raise exception 'Invalid work date';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(primary_name || ':' || work_day::text, 0));
  end loop;

  perform 1 from public.schedule_groups
    where primary_company = primary_name
      and work_date in (select (g->>'work_date')::date from jsonb_array_elements(p_groups) g)
    order by work_date for update;

  if p_expected_id is not null and (
    jsonb_array_length(p_groups) <> 1 or not exists (
      select 1 from public.schedule_groups
      where id = p_expected_id and primary_company = primary_name
        and work_date = (p_groups->0->>'work_date')::date
    )
  ) then
    raise exception using message = 'SCHEDULE_NOT_FOUND';
  end if;

  select array_agg(s.work_date order by s.work_date) into conflicts
  from public.schedule_groups s
  where s.primary_company = primary_name
    and s.work_date in (select (g->>'work_date')::date from jsonb_array_elements(p_groups) g);
  if not p_overwrite and conflicts is not null and (
    not p_skip_existing or cardinality(conflicts) = jsonb_array_length(p_groups)
  ) then
    raise exception using message = 'SCHEDULE_ALREADY_EXISTS', detail = to_jsonb(conflicts)::text;
  end if;

  for item in select g from jsonb_array_elements(p_groups) g order by g->>'work_date'
  loop
    work_day := (item->>'work_date')::date;
    if not p_overwrite and p_skip_existing and work_day = any(coalesce(conflicts, '{}'::date[])) then
      continue;
    end if;
    if (item->>'primary_count')::integer is null
      or (item->>'primary_count')::integer < 0
      or coalesce(btrim(item->>'work_area'), '') = ''
      or coalesce(btrim(item->>'work_content'), '') = ''
      or ((item->>'primary_count')::integer = 0 and coalesce((
        select sum((sub->>'worker_count')::integer) from jsonb_array_elements(p_subcompanies) sub
      ), 0) < 1) then
      raise exception 'Invalid schedule fields';
    end if;
    -- ロックを使わない直接insertとの競合でも、未確認の上書きをしない。
    insert into public.schedule_groups (
      work_date, primary_company, primary_count, work_area, work_content,
      aerial_work_vehicle_count, aerial_work_vehicle_floor, uses_fire, uses_tachiuma, tachiuma_notes, notes
    ) values (
      work_day, primary_name, (item->>'primary_count')::integer, item->>'work_area', item->>'work_content',
      (item->>'aerial_work_vehicle_count')::integer, item->>'aerial_work_vehicle_floor',
      (item->>'uses_fire')::boolean, (item->>'uses_tachiuma')::boolean,
      case when (item->>'uses_tachiuma')::boolean then item->>'tachiuma_notes' else null end, item->>'notes'
    ) on conflict (work_date, primary_company) do update set
      primary_count = excluded.primary_count, work_area = excluded.work_area, work_content = excluded.work_content,
      aerial_work_vehicle_count = excluded.aerial_work_vehicle_count,
      aerial_work_vehicle_floor = excluded.aerial_work_vehicle_floor, uses_fire = excluded.uses_fire,
      uses_tachiuma = excluded.uses_tachiuma, tachiuma_notes = excluded.tachiuma_notes, notes = excluded.notes
    where p_overwrite
    returning id into group_id;
    if not found then
      raise exception using message = 'SCHEDULE_ALREADY_EXISTS', detail = jsonb_build_array(work_day)::text;
    end if;

    delete from public.schedule_subcompanies where schedule_group_id = group_id;
    delete from public.schedule_aerial_work_vehicles where schedule_group_id = group_id;
    insert into public.schedule_subcompanies (schedule_group_id, secondary_company, worker_count, sort_order)
      select group_id, sub->>'secondary_company', (sub->>'worker_count')::integer, (ordinality - 1)::integer
      from jsonb_array_elements(p_subcompanies) with ordinality as entries(sub, ordinality);
    insert into public.schedule_aerial_work_vehicles (schedule_group_id, work_area, vehicle_count, sort_order)
      select group_id, vehicle->>'work_area', (vehicle->>'vehicle_count')::integer, (ordinality - 1)::integer
      from jsonb_array_elements(p_vehicles) with ordinality as entries(vehicle, ordinality);
    saved_dates := array_append(saved_dates, work_day);
    saved_ids := array_append(saved_ids, group_id);
  end loop;
  return jsonb_build_object('dates', to_jsonb(saved_dates), 'savedIds', to_jsonb(saved_ids));
end;
$$;

revoke all on function public.save_schedule_atomically(jsonb, jsonb, jsonb, boolean, boolean, uuid) from public;
grant execute on function public.save_schedule_atomically(jsonb, jsonb, jsonb, boolean, boolean, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- 一次会社・日付ごとに独立した作業終了報告
create table if not exists public.work_completion_reports (
  work_date date not null,
  primary_company text not null,
  reported_at timestamptz not null default now(),
  notes text not null default '' check (char_length(notes) <= 2000),
  primary key (work_date, primary_company)
);
alter table public.work_completion_reports enable row level security;
grant select, insert, update, delete on public.work_completion_reports to anon, authenticated, service_role;
drop policy if exists work_completion_reports_app_all on public.work_completion_reports;
create policy work_completion_reports_app_all on public.work_completion_reports
  for all to anon, authenticated using (true) with check (true);

-- Aggregate entrants in PostgreSQL while preserving caller RLS.
create or replace function public.get_calendar_entrant_summary(
  p_from date, p_to date, p_company text default ''
) returns table (
  entry_date date, primary_company text, secondary_company text, person_count bigint
) language plpgsql stable security invoker set search_path = public as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 365 then
    raise exception 'Invalid calendar date range';
  end if;
  return query
    select r.entry_date, r.primary_company, r.secondary_company, sum(r.person_count)::bigint
    from public.new_entrant_records r
    where r.entry_date between p_from and p_to
      and (coalesce(p_company, '') = '' or r.primary_company = p_company)
    group by r.entry_date, r.primary_company, r.secondary_company
    order by r.entry_date, r.primary_company, r.secondary_company;
end;
$$;
revoke all on function public.get_calendar_entrant_summary(date, date, text) from public;
grant execute on function public.get_calendar_entrant_summary(date, date, text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
