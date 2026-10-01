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
  uses_aerial_work_vehicle boolean not null default false,
  aerial_work_vehicle_notes text,
  uses_fire boolean not null default false,
  fire_area text,
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

alter table public.schedule_groups add column if not exists notes text;
alter table public.schedule_groups add column if not exists uses_aerial_work_vehicle boolean not null default false;
alter table public.schedule_groups add column if not exists aerial_work_vehicle_notes text;
alter table public.schedule_groups add column if not exists fire_area text;
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


create index if not exists schedule_groups_primary_date_idx
  on public.schedule_groups (primary_company, work_date);

create index if not exists schedule_subcompanies_group_id_idx
  on public.schedule_subcompanies (schedule_group_id);

create index if not exists schedule_subcompanies_secondary_company_idx
  on public.schedule_subcompanies (secondary_company);

create index if not exists new_entrant_records_primary_date_idx
  on public.new_entrant_records (primary_company, entry_date);

create index if not exists new_entrant_records_company_date_idx
  on public.new_entrant_records (entry_date, primary_company, secondary_company);

alter table public.company_master enable row level security;
alter table public.schedule_groups enable row level security;
alter table public.schedule_subcompanies enable row level security;
alter table public.new_entrant_records enable row level security;

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on public.company_master to anon, authenticated, service_role;
grant select, insert, update, delete on public.schedule_groups to anon, authenticated, service_role;
grant select, insert, update, delete on public.schedule_subcompanies to anon, authenticated, service_role;
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

drop policy if exists new_entrant_records_app_all on public.new_entrant_records;
create policy new_entrant_records_app_all on public.new_entrant_records
for all to anon, authenticated using (true) with check (true);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end $$;

drop trigger if exists schedule_groups_set_updated_at on public.schedule_groups;
create trigger schedule_groups_set_updated_at
before update on public.schedule_groups
for each row
execute function public.set_updated_at();

drop trigger if exists new_entrant_records_set_updated_at on public.new_entrant_records;
create trigger new_entrant_records_set_updated_at before update on public.new_entrant_records
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';


-- 親予定と二次会社を一つのトランザクションで保存する。
-- SECURITY INVOKER: 既存のテーブル権限・RLSを維持する。
create or replace function public.save_schedule_atomically(
  p_groups jsonb,
  p_subcompanies jsonb,
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
    or jsonb_typeof(p_subcompanies) is distinct from 'array' then
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
      or (coalesce((item->>'uses_aerial_work_vehicle')::boolean, false)
        and coalesce(btrim(item->>'aerial_work_vehicle_notes'), '') = '') then
      raise exception 'Invalid schedule fields';
    end if;
    -- ロックを使わない直接insertとの競合でも、未確認の上書きをしない。
    insert into public.schedule_groups (
      work_date, primary_company, primary_count, work_area, work_content,
      uses_aerial_work_vehicle, aerial_work_vehicle_notes, uses_fire, uses_tachiuma, tachiuma_notes, notes
    ) values (
      work_day, primary_name, (item->>'primary_count')::integer, item->>'work_area', item->>'work_content',
      coalesce((item->>'uses_aerial_work_vehicle')::boolean, false),
      case when coalesce((item->>'uses_aerial_work_vehicle')::boolean, false) then item->>'aerial_work_vehicle_notes' else null end,
      (item->>'uses_fire')::boolean, (item->>'uses_tachiuma')::boolean,
      case when (item->>'uses_tachiuma')::boolean then item->>'tachiuma_notes' else null end, item->>'notes'
    ) on conflict (work_date, primary_company) do update set
      primary_count = excluded.primary_count, work_area = excluded.work_area, work_content = excluded.work_content,
      uses_aerial_work_vehicle = excluded.uses_aerial_work_vehicle,
      aerial_work_vehicle_notes = excluded.aerial_work_vehicle_notes, uses_fire = excluded.uses_fire,
      uses_tachiuma = excluded.uses_tachiuma, tachiuma_notes = excluded.tachiuma_notes, notes = excluded.notes
    where p_overwrite
    returning id into group_id;
    if not found then
      raise exception using message = 'SCHEDULE_ALREADY_EXISTS', detail = jsonb_build_array(work_day)::text;
    end if;

    delete from public.schedule_subcompanies where schedule_group_id = group_id;
    insert into public.schedule_subcompanies (schedule_group_id, secondary_company, worker_count, sort_order)
      select group_id, sub->>'secondary_company', (sub->>'worker_count')::integer, (ordinality - 1)::integer
      from jsonb_array_elements(p_subcompanies) with ordinality as entries(sub, ordinality);
    saved_dates := array_append(saved_dates, work_day);
    saved_ids := array_append(saved_ids, group_id);
  end loop;
  return jsonb_build_object('dates', to_jsonb(saved_dates), 'savedIds', to_jsonb(saved_ids));
end;
$$;

revoke all on function public.save_schedule_atomically(jsonb, jsonb, boolean, boolean, uuid) from public;
grant execute on function public.save_schedule_atomically(jsonb, jsonb, boolean, boolean, uuid) to anon, authenticated, service_role;

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


-- Equipment floor requests
begin;

create table if not exists public.equipment_floor_master (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 30),
  sort_order integer not null default 0,
  constraint equipment_floor_master_name_key unique (name)
);

insert into public.equipment_floor_master (name, sort_order) values
  ('B2', 0), ('B1', 1), ('1F', 2), ('2F', 3), ('3F', 4)
on conflict (name) do nothing;

create table if not exists public.schedule_equipment_requests (
  id uuid primary key default gen_random_uuid(),
  schedule_group_id uuid not null references public.schedule_groups(id) on delete cascade,
  equipment_type text not null check (equipment_type in ('aerial_work_vehicle', 'tachiuma')),
  floor_id uuid not null references public.equipment_floor_master(id) on delete restrict,
  requested_count integer not null check (requested_count > 0 and requested_count <= 999),
  sort_order integer not null default 0,
  constraint schedule_equipment_requests_unique unique (schedule_group_id, equipment_type, floor_id)
);
create index if not exists schedule_equipment_requests_group_idx on public.schedule_equipment_requests(schedule_group_id, sort_order);

alter table public.equipment_floor_master enable row level security;
alter table public.schedule_equipment_requests enable row level security;
grant select on public.equipment_floor_master to anon, authenticated, service_role;
grant insert, update, delete on public.equipment_floor_master to service_role;
grant select, insert, update, delete on public.schedule_equipment_requests to anon, authenticated, service_role;
drop policy if exists equipment_floor_master_read on public.equipment_floor_master;
create policy equipment_floor_master_read on public.equipment_floor_master for select to anon, authenticated using (true);
drop policy if exists schedule_equipment_requests_app_all on public.schedule_equipment_requests;
create policy schedule_equipment_requests_app_all on public.schedule_equipment_requests for all to anon, authenticated using (true) with check (true);

-- Keep the existing five-argument implementation as the parent/subcompany writer.
-- This overload adds equipment rows in the same transaction.
create or replace function public.save_schedule_atomically(
  p_groups jsonb, p_subcompanies jsonb, p_equipment_requests jsonb,
  p_overwrite boolean default false, p_skip_existing boolean default false, p_expected_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare result jsonb; saved_id uuid; request_item jsonb; request_index integer; normalized_groups jsonb; aerial_text text; tachiuma_text text;
begin
  if jsonb_typeof(p_equipment_requests) is distinct from 'array' then raise exception 'Invalid equipment payload'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_equipment_requests) item
    left join public.equipment_floor_master floor on floor.id = (item->>'floor_id')::uuid
    where item->>'equipment_type' not in ('aerial_work_vehicle', 'tachiuma')
       or coalesce((item->>'requested_count')::integer, 0) not between 1 and 999
       or floor.id is null
  ) then raise exception 'Invalid equipment request'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_equipment_requests) item
    group by item->>'equipment_type', item->>'floor_id' having count(*) > 1
  ) then raise exception 'Duplicate equipment floor'; end if;

  select string_agg(floor.name || ' ' || (item->>'requested_count') || '台', '、' order by ordinality)
    into aerial_text from jsonb_array_elements(p_equipment_requests) with ordinality entries(item, ordinality)
    join public.equipment_floor_master floor on floor.id=(item->>'floor_id')::uuid where item->>'equipment_type'='aerial_work_vehicle';
  select string_agg(floor.name || ' ' || (item->>'requested_count') || '台', '、' order by ordinality)
    into tachiuma_text from jsonb_array_elements(p_equipment_requests) with ordinality entries(item, ordinality)
    join public.equipment_floor_master floor on floor.id=(item->>'floor_id')::uuid where item->>'equipment_type'='tachiuma';
  select jsonb_agg(item || jsonb_build_object(
    'aerial_work_vehicle_notes', case when coalesce((item->>'uses_aerial_work_vehicle')::boolean,false) then coalesce(aerial_text,item->>'aerial_work_vehicle_notes') else null end,
    'tachiuma_notes', case when coalesce((item->>'uses_tachiuma')::boolean,false) then coalesce(tachiuma_text,item->>'tachiuma_notes') else null end
  )) into normalized_groups from jsonb_array_elements(p_groups) item;
  result := public.save_schedule_atomically(normalized_groups, p_subcompanies, p_overwrite, p_skip_existing, p_expected_id);
  for saved_id in select value::uuid from jsonb_array_elements_text(result->'savedIds') loop
    delete from public.schedule_equipment_requests where schedule_group_id = saved_id;
    request_index := 0;
    for request_item in select value from jsonb_array_elements(p_equipment_requests) loop
      insert into public.schedule_equipment_requests(schedule_group_id, equipment_type, floor_id, requested_count, sort_order)
      values (saved_id, request_item->>'equipment_type', (request_item->>'floor_id')::uuid, (request_item->>'requested_count')::integer, request_index);
      request_index := request_index + 1;
    end loop;
  end loop;
  return result;
end
$$;
revoke all on function public.save_schedule_atomically(jsonb,jsonb,jsonb,boolean,boolean,uuid) from public;
grant execute on function public.save_schedule_atomically(jsonb,jsonb,jsonb,boolean,boolean,uuid) to anon, authenticated, service_role;

create or replace function public.create_data_backup(p_source text default 'manual')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare backup_id uuid; backup_payload jsonb; backup_counts jsonb;
begin
  if p_source not in ('automatic', 'manual') then raise exception 'Invalid backup source'; end if;
  backup_payload := jsonb_build_object(
    'company_master', coalesce((select jsonb_agg(to_jsonb(r)) from public.company_master r), '[]'::jsonb),
    'equipment_floor_master', coalesce((select jsonb_agg(to_jsonb(r)) from public.equipment_floor_master r), '[]'::jsonb),
    'schedule_groups', coalesce((select jsonb_agg(to_jsonb(r)) from public.schedule_groups r), '[]'::jsonb),
    'schedule_subcompanies', coalesce((select jsonb_agg(to_jsonb(r)) from public.schedule_subcompanies r), '[]'::jsonb),
    'schedule_equipment_requests', coalesce((select jsonb_agg(to_jsonb(r)) from public.schedule_equipment_requests r), '[]'::jsonb),
    'new_entrant_records', coalesce((select jsonb_agg(to_jsonb(r)) from public.new_entrant_records r), '[]'::jsonb),
    'work_completion_reports', coalesce((select jsonb_agg(to_jsonb(r)) from public.work_completion_reports r), '[]'::jsonb),
    'aerial_work_vehicles', coalesce((select jsonb_agg(to_jsonb(r)) from public.aerial_work_vehicles r), '[]'::jsonb),
    'tachiuma_floor_stocks', coalesce((select jsonb_agg(to_jsonb(r)) from public.tachiuma_floor_stocks r), '[]'::jsonb),
    'tachiuma_units', coalesce((select jsonb_agg(to_jsonb(r)) from public.tachiuma_units r), '[]'::jsonb),
    'equipment_movements', coalesce((select jsonb_agg(to_jsonb(r)) from public.equipment_movements r), '[]'::jsonb)
  );
  select jsonb_object_agg(key, jsonb_array_length(value)) into backup_counts from jsonb_each(backup_payload);
  insert into public.data_backups(source, schema_version, row_counts, payload) values(p_source, 6, backup_counts, backup_payload)
    on conflict (backup_date) where source = 'automatic' do update
      set created_at = now(), schema_version = 6, row_counts = excluded.row_counts, payload = excluded.payload
    returning id into backup_id;
  return backup_id;
end $$;

create or replace function public.restore_data_backup(p_backup_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare backup_payload jsonb; normalized_groups jsonb; restored_counts jsonb; target text; floor_row record; candidate text; suffix integer;
begin
  select payload into backup_payload from public.data_backups where id = p_backup_id;
  if backup_payload is null then raise exception 'Backup not found'; end if;
  foreach target in array array['company_master','schedule_groups','schedule_subcompanies','new_entrant_records'] loop
    if jsonb_typeof(backup_payload->target) is distinct from 'array' then raise exception 'Invalid backup: %', target; end if;
  end loop;
  foreach target in array array['equipment_floor_master','schedule_equipment_requests','work_completion_reports',
    'aerial_work_vehicles','tachiuma_floor_stocks','tachiuma_units','equipment_movements'] loop
    if backup_payload ? target and jsonb_typeof(backup_payload->target) is distinct from 'array' then raise exception 'Invalid backup: %', target; end if;
  end loop;
  perform pg_advisory_xact_lock(250925001);
  select coalesce(jsonb_agg((item - 'aerial_work_vehicle_count' - 'aerial_work_vehicle_floor') || jsonb_build_object(
    'updated_at', clock_timestamp(),
    'uses_aerial_work_vehicle', coalesce((item->>'uses_aerial_work_vehicle')::boolean, coalesce((item->>'aerial_work_vehicle_count')::integer,0)>0),
    'aerial_work_vehicle_notes', coalesce(item->>'aerial_work_vehicle_notes', item->>'aerial_work_vehicle_floor')
  )), '[]'::jsonb) into normalized_groups from jsonb_array_elements(backup_payload->'schedule_groups') item;
  backup_payload := jsonb_set(backup_payload, '{schedule_groups}', normalized_groups);
  select coalesce(jsonb_agg(item || jsonb_build_object('updated_at', clock_timestamp())), '[]'::jsonb)
    into normalized_groups from jsonb_array_elements(backup_payload->'new_entrant_records') item;
  backup_payload := jsonb_set(backup_payload, '{new_entrant_records}', normalized_groups);
  if backup_payload ? 'work_completion_reports' then
    select coalesce(jsonb_agg(item || jsonb_build_object('revision', greatest(coalesce((item->>'revision')::integer,1),coalesce((select revision from public.work_completion_reports where id=(item->>'id')::uuid),0))+1)), '[]'::jsonb)
      into normalized_groups from jsonb_array_elements(backup_payload->'work_completion_reports') item;
    backup_payload := jsonb_set(backup_payload, '{work_completion_reports}', normalized_groups);
  end if;
  perform set_config('app.skip_audit','on',true);
  -- Delete dependent equipment before floors. Missing legacy sections are preserved.
  foreach target in array array['equipment_movements','aerial_work_vehicles','tachiuma_floor_stocks','tachiuma_units','work_completion_reports'] loop
    if backup_payload ? target then execute format('delete from public.%I', target); end if;
  end loop;
  delete from public.schedule_equipment_requests;
  delete from public.schedule_subcompanies;
  delete from public.schedule_groups;
  delete from public.new_entrant_records;
  delete from public.company_master;
  if backup_payload ?& array['equipment_floor_master','aerial_work_vehicles','tachiuma_floor_stocks','tachiuma_units','equipment_movements'] then
    delete from public.equipment_floor_master;
  end if;
  -- Legacy backups preserve floors referenced by omitted equipment sections.
  -- Free conflicting names before restoring identities, including name swaps.
  if backup_payload ? 'equipment_floor_master' then
    for floor_row in select floor.id from public.equipment_floor_master floor
      join jsonb_array_elements(backup_payload->'equipment_floor_master') item on floor.id=(item->>'id')::uuid
      where floor.name is distinct from item->>'name' loop
      loop
        candidate := '_restore_' || substr(replace(gen_random_uuid()::text,'-',''),1,20);
        exit when not exists(select 1 from public.equipment_floor_master where name=candidate)
          and not exists(select 1 from jsonb_array_elements(backup_payload->'equipment_floor_master') item where item->>'name'=candidate);
      end loop;
      update public.equipment_floor_master set name=candidate where id=floor_row.id;
    end loop;
    for floor_row in select floor.id,floor.name from public.equipment_floor_master floor
      where not exists(select 1 from jsonb_array_elements(backup_payload->'equipment_floor_master') item where (item->>'id')::uuid=floor.id)
        and exists(select 1 from jsonb_array_elements(backup_payload->'equipment_floor_master') item where item->>'name'=floor.name) loop
      suffix:=0;
      loop
        candidate:=left(floor_row.name,15)||'（復元前'||case when suffix=0 then '' else suffix::text end||'）';
        exit when not exists(select 1 from public.equipment_floor_master where name=candidate)
          and not exists(select 1 from jsonb_array_elements(backup_payload->'equipment_floor_master') item where item->>'name'=candidate);
        suffix:=suffix+1;
      end loop;
      update public.equipment_floor_master set name=candidate where id=floor_row.id;
    end loop;
  end if;
  foreach target in array array['company_master','equipment_floor_master','schedule_groups','schedule_subcompanies',
    'schedule_equipment_requests','new_entrant_records','work_completion_reports','aerial_work_vehicles',
    'tachiuma_floor_stocks','tachiuma_units','equipment_movements'] loop
    if backup_payload ? target then
      if target = 'equipment_floor_master' then
        insert into public.equipment_floor_master select * from jsonb_populate_recordset(null::public.equipment_floor_master, backup_payload->target)
          on conflict(id) do update set name = excluded.name, sort_order = excluded.sort_order;
      else
        execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', target, target)
          using backup_payload->target;
      end if;
    end if;
  end loop;
  select jsonb_object_agg(key, jsonb_array_length(value)) into restored_counts from jsonb_each(backup_payload)
    where jsonb_typeof(value) = 'array';
  return restored_counts;
end $$;

notify pgrst, 'reload schema';
commit;


-- Equipment positions and transfers
begin;

create table if not exists public.aerial_work_vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_number text not null unique check (btrim(vehicle_number) <> '' and char_length(vehicle_number) <= 30),
  floor_id uuid not null references public.equipment_floor_master(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.tachiuma_floor_stocks (
  floor_id uuid primary key references public.equipment_floor_master(id) on delete restrict,
  quantity integer not null default 0 check (quantity between 0 and 9999),
  notes text check (notes is null or char_length(notes) <= 500),
  updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.tachiuma_units (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 50),
  notes text check (notes is null or char_length(notes) <= 500),
  floor_id uuid not null references public.equipment_floor_master(id) on delete restrict,
  sort_order integer not null default 0,
  updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.equipment_movements (
  id uuid primary key default gen_random_uuid(),
  equipment_type text not null check (equipment_type in ('aerial_work_vehicle','tachiuma')),
  action text not null,
  vehicle_id uuid references public.aerial_work_vehicles(id) on delete restrict,
  from_floor_id uuid references public.equipment_floor_master(id) on delete restrict,
  to_floor_id uuid not null references public.equipment_floor_master(id) on delete restrict,
  quantity integer not null,
  moved_at timestamptz not null default clock_timestamp()
);
alter table public.aerial_work_vehicles enable row level security;
alter table public.tachiuma_floor_stocks enable row level security;
alter table public.tachiuma_units enable row level security;
alter table public.equipment_movements enable row level security;
revoke all on public.aerial_work_vehicles, public.tachiuma_floor_stocks, public.equipment_movements from anon, authenticated;
grant all on public.aerial_work_vehicles, public.tachiuma_floor_stocks, public.equipment_movements to service_role;
revoke all on public.tachiuma_units from anon, authenticated;
grant all on public.tachiuma_units to service_role;

create or replace function public.update_equipment_position(
  p_action text, p_floor uuid, p_vehicle uuid default null, p_number text default null,
  p_from uuid default null, p_quantity integer default null, p_expected timestamptz default null
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.aerial_work_vehicles; s public.tachiuma_floor_stocks; previous_quantity integer;
begin
  -- Serialize these short operations so stock transfers cannot lose concurrent updates.
  perform pg_advisory_xact_lock(250925001);
  if not exists(select 1 from public.equipment_floor_master where id=p_floor) then raise exception 'フロアが存在しません。'; end if;
  if p_action='register_vehicle' then
    insert into public.aerial_work_vehicles(vehicle_number,floor_id) values(btrim(p_number),p_floor) returning * into v;
    insert into public.equipment_movements(equipment_type,action,vehicle_id,to_floor_id,quantity) values('aerial_work_vehicle',p_action,v.id,p_floor,1);
  elsif p_action='move_vehicle' then
    select * into v from public.aerial_work_vehicles where id=p_vehicle for update;
    if v.id is null or v.updated_at is distinct from p_expected then raise exception '配置が変更されています。更新して再度操作してください。'; end if;
    if v.floor_id=p_floor then return; end if;
    update public.aerial_work_vehicles set floor_id=p_floor,updated_at=clock_timestamp() where id=p_vehicle;
    insert into public.equipment_movements(equipment_type,action,vehicle_id,from_floor_id,to_floor_id,quantity) values('aerial_work_vehicle',p_action,v.id,v.floor_id,p_floor,1);
  elsif p_action='set_stock' then
    if p_quantity is null or p_quantity not between 0 and 9999 then raise exception '台数が正しくありません。'; end if;
    select * into s from public.tachiuma_floor_stocks where floor_id=p_floor for update;
    if s.updated_at is distinct from p_expected then raise exception '台数が変更されています。更新して再度操作してください。'; end if;
    previous_quantity := coalesce(s.quantity,0);
    insert into public.tachiuma_floor_stocks(floor_id,quantity) values(p_floor,p_quantity)
      on conflict(floor_id) do update set quantity=excluded.quantity,updated_at=clock_timestamp();
    insert into public.equipment_movements(equipment_type,action,to_floor_id,quantity) values('tachiuma',p_action,p_floor,p_quantity-previous_quantity);
  elsif p_action='move_stock' then
    if p_from is null or p_from=p_floor or p_quantity is null or p_quantity not between 1 and 9999 then raise exception '移動先と台数を確認してください。'; end if;
    select * into s from public.tachiuma_floor_stocks where floor_id=p_from for update;
    if s.floor_id is null or s.updated_at is distinct from p_expected then raise exception '台数が変更されています。更新して再度操作してください。'; end if;
    if s.quantity<p_quantity then raise exception '移動元の台数が不足しています。'; end if;
    update public.tachiuma_floor_stocks set quantity=quantity-p_quantity,updated_at=clock_timestamp() where floor_id=p_from;
    insert into public.tachiuma_floor_stocks(floor_id,quantity) values(p_floor,p_quantity)
      on conflict(floor_id) do update set quantity=tachiuma_floor_stocks.quantity+excluded.quantity,updated_at=clock_timestamp();
    insert into public.equipment_movements(equipment_type,action,from_floor_id,to_floor_id,quantity) values('tachiuma',p_action,p_from,p_floor,p_quantity);
  else raise exception '操作が正しくありません。';
  end if;
end $$;
revoke all on function public.update_equipment_position(text,uuid,uuid,text,uuid,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.update_equipment_position(text,uuid,uuid,text,uuid,integer,timestamptz) to service_role;

create or replace function public.save_tachiuma_stock(
  p_floor uuid, p_quantity integer, p_notes text, p_expected timestamptz
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare s public.tachiuma_floor_stocks; previous_quantity integer; clean_notes text := nullif(btrim(p_notes), '');
begin
  perform pg_advisory_xact_lock(250925001);
  if not exists(select 1 from public.equipment_floor_master where id=p_floor) then raise exception 'フロアが存在しません。'; end if;
  if p_quantity is null or p_quantity not between 0 and 9999 then raise exception '台数が正しくありません。'; end if;
  if clean_notes is not null and char_length(clean_notes)>500 then raise exception '備考は500文字以内で入力してください。'; end if;
  select * into s from public.tachiuma_floor_stocks where floor_id=p_floor for update;
  if s.updated_at is distinct from p_expected then raise exception '台数または備考が変更されています。更新して再度操作してください。'; end if;
  previous_quantity := coalesce(s.quantity,0);
  insert into public.tachiuma_floor_stocks(floor_id,quantity,notes) values(p_floor,p_quantity,clean_notes)
    on conflict(floor_id) do update set quantity=excluded.quantity,notes=excluded.notes,updated_at=clock_timestamp();
  insert into public.equipment_movements(equipment_type,action,to_floor_id,quantity) values('tachiuma','set_stock',p_floor,p_quantity-previous_quantity);
end $$;
revoke all on function public.save_tachiuma_stock(uuid,integer,text,timestamptz) from public, anon, authenticated;
grant execute on function public.save_tachiuma_stock(uuid,integer,text,timestamptz) to service_role;

create or replace function public.save_tachiuma_unit(p_unit uuid,p_name text,p_notes text,p_floor uuid,p_expected timestamptz)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare item public.tachiuma_units; saved_id uuid; clean_notes text:=nullif(btrim(p_notes),'');
begin
  if btrim(coalesce(p_name,''))='' or char_length(btrim(p_name))>50 then raise exception '名称を確認してください。'; end if;
  if char_length(coalesce(clean_notes,''))>500 then raise exception '備考は500文字以内で入力してください。'; end if;
  if not exists(select 1 from public.equipment_floor_master where id=p_floor) then raise exception 'フロアが存在しません。'; end if;
  if p_unit is null then insert into public.tachiuma_units(name,notes,floor_id,sort_order) values(btrim(p_name),clean_notes,p_floor,coalesce((select max(sort_order)+1 from public.tachiuma_units),0)) returning id into saved_id;
  else select * into item from public.tachiuma_units where id=p_unit for update; if item.id is null or item.updated_at is distinct from p_expected then raise exception '立ち馬情報が変更されています。更新して再度操作してください。'; end if; update public.tachiuma_units set name=btrim(p_name),notes=clean_notes,floor_id=p_floor,updated_at=clock_timestamp() where id=p_unit returning id into saved_id; end if;
  return saved_id;
end $$;
create or replace function public.delete_tachiuma_unit(p_unit uuid,p_expected timestamptz) returns void language plpgsql security invoker set search_path=public,pg_temp as $$ declare item public.tachiuma_units; begin select * into item from public.tachiuma_units where id=p_unit for update; if item.id is null or item.updated_at is distinct from p_expected then raise exception '立ち馬情報が変更されています。更新して再度操作してください。'; end if; delete from public.tachiuma_units where id=p_unit; end $$;
create or replace function public.reorder_tachiuma_units(p_ids uuid[])
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(250925001);
  lock table public.tachiuma_units in share row exclusive mode;
  if cardinality(p_ids) is distinct from (select count(*) from public.tachiuma_units)
    or cardinality(p_ids) is distinct from (select count(distinct id) from unnest(p_ids) item(id))
    or exists(select 1 from unnest(p_ids) item(id) where not exists(select 1 from public.tachiuma_units where id=item.id)) then
    raise exception '立ち馬一覧が変更されています。更新して再度操作してください。';
  end if;
  update public.tachiuma_units unit set sort_order=ordered.position,updated_at=clock_timestamp()
    from (select id,ordinality-1 position from unnest(p_ids) with ordinality item(id,ordinality)) ordered
    where unit.id=ordered.id and unit.sort_order is distinct from ordered.position;
end $$;
revoke all on function public.save_tachiuma_unit(uuid,text,text,uuid,timestamptz), public.delete_tachiuma_unit(uuid,timestamptz), public.reorder_tachiuma_units(uuid[]) from public,anon,authenticated;
grant execute on function public.save_tachiuma_unit(uuid,text,text,uuid,timestamptz), public.delete_tachiuma_unit(uuid,timestamptz), public.reorder_tachiuma_units(uuid[]) to service_role;


notify pgrst, 'reload schema';
commit;


-- Current vehicle company assignment
begin;

alter table public.aerial_work_vehicles add column if not exists assigned_company text;
alter table public.equipment_movements
  add column if not exists from_company text,
  add column if not exists to_company text;

-- Assignments describe current usage, independent of the selected calendar date.

notify pgrst, 'reload schema';
commit;


begin;

-- Preserve the vehicle number in history after removing the vehicle itself.
alter table public.equipment_movements add column if not exists vehicle_number text;
alter table public.equipment_movements drop constraint if exists equipment_movements_vehicle_id_fkey;
alter table public.equipment_movements add constraint equipment_movements_vehicle_id_fkey
  foreign key (vehicle_id) references public.aerial_work_vehicles(id) on delete set null;

create or replace function public.delete_equipment_vehicle(p_vehicle uuid, p_expected timestamptz)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.aerial_work_vehicles;
begin
  perform pg_advisory_xact_lock(250925001);
  select * into v from public.aerial_work_vehicles where id=p_vehicle for update;
  if v.id is null or v.updated_at is distinct from p_expected then
    raise exception '配置・割当が変更されています。更新して再度操作してください。';
  end if;
  update public.equipment_movements set vehicle_number=v.vehicle_number where vehicle_id=v.id;
  insert into public.equipment_movements(equipment_type,action,vehicle_id,vehicle_number,from_floor_id,to_floor_id,quantity,from_company)
    values('aerial_work_vehicle','delete_vehicle',v.id,v.vehicle_number,v.floor_id,v.floor_id,1,v.assigned_company);
  delete from public.aerial_work_vehicles where id=v.id;
end $$;
revoke all on function public.delete_equipment_vehicle(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.delete_equipment_vehicle(uuid,timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;

-- Vehicle management, notes, and ordering
alter table public.aerial_work_vehicles add column if not exists notes text, add column if not exists sort_order integer not null default 0;
alter table public.aerial_work_vehicles drop constraint if exists aerial_work_vehicles_notes_check;
alter table public.aerial_work_vehicles add constraint aerial_work_vehicles_notes_check check(notes is null or char_length(notes)<=500);
with ordered as(select id,row_number() over(order by sort_order,vehicle_number,id)-1 position from public.aerial_work_vehicles)
update public.aerial_work_vehicles v set sort_order=ordered.position from ordered where ordered.id=v.id;
create or replace function public.save_equipment_vehicle(p_vehicle uuid,p_number text,p_notes text,p_floor uuid,p_company text,p_expected timestamptz)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.aerial_work_vehicles;saved_id uuid;company_name text:=nullif(btrim(p_company),'');clean_notes text:=nullif(btrim(p_notes),'');
begin
 perform pg_advisory_xact_lock(250925001);
 if btrim(coalesce(p_number,''))='' or char_length(btrim(p_number))>30 then raise exception '号車番号を確認してください。';end if;
 if char_length(coalesce(clean_notes,''))>500 then raise exception '備考は500文字以内で入力してください。';end if;
 if not exists(select 1 from public.equipment_floor_master where id=p_floor) then raise exception 'フロアが存在しません。';end if;
 if company_name is not null and not exists(select 1 from public.schedule_groups where primary_company=company_name) then raise exception '会社が存在しません。更新して再度選択してください。';end if;
 if p_vehicle is null then
  insert into public.aerial_work_vehicles(vehicle_number,notes,floor_id,assigned_company,sort_order) values(btrim(p_number),clean_notes,p_floor,company_name,coalesce((select max(sort_order)+1 from public.aerial_work_vehicles),0)) returning id into saved_id;
  insert into public.equipment_movements(equipment_type,action,vehicle_id,vehicle_number,to_floor_id,quantity,to_company) values('aerial_work_vehicle','register_vehicle',saved_id,btrim(p_number),p_floor,1,company_name);
 else
  select * into v from public.aerial_work_vehicles where id=p_vehicle for update;
  if v.id is null or v.updated_at is distinct from p_expected then raise exception '号車情報が変更されています。更新して再度操作してください。';end if;
  update public.aerial_work_vehicles set vehicle_number=btrim(p_number),notes=clean_notes,floor_id=p_floor,assigned_company=company_name,updated_at=clock_timestamp() where id=p_vehicle returning id into saved_id;
  insert into public.equipment_movements(equipment_type,action,vehicle_id,vehicle_number,from_floor_id,to_floor_id,quantity,from_company,to_company) values('aerial_work_vehicle','update_vehicle',v.id,btrim(p_number),v.floor_id,p_floor,1,v.assigned_company,company_name);
 end if;return saved_id;
end $$;
revoke all on function public.save_equipment_vehicle(uuid,text,text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.save_equipment_vehicle(uuid,text,text,uuid,text,timestamptz) to service_role;
create or replace function public.reorder_equipment_vehicles(p_ids uuid[])
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(250925001);
  lock table public.aerial_work_vehicles in share row exclusive mode;
  if cardinality(p_ids) is distinct from (select count(*) from public.aerial_work_vehicles)
    or cardinality(p_ids) is distinct from (select count(distinct id) from unnest(p_ids) item(id))
    or exists(select 1 from unnest(p_ids) item(id) where not exists(select 1 from public.aerial_work_vehicles where id=item.id)) then
    raise exception '号車一覧が変更されています。更新して再度操作してください。';
  end if;
  update public.aerial_work_vehicles vehicle set sort_order=ordered.position,updated_at=clock_timestamp()
    from (select id,ordinality-1 position from unnest(p_ids) with ordinality item(id,ordinality)) ordered
    where vehicle.id=ordered.id and vehicle.sort_order is distinct from ordered.position;
end $$;
revoke all on function public.reorder_equipment_vehicles(uuid[]) from public,anon,authenticated;
grant execute on function public.reorder_equipment_vehicles(uuid[]) to service_role;
notify pgrst,'reload schema';

-- Date-aware vehicle assignment continuity
alter table public.equipment_movements add column if not exists work_date date;
create or replace function public.assign_equipment_vehicle_for_date(
  p_vehicle uuid,p_floor uuid,p_company text,p_date date,p_expected timestamptz
) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare vehicle public.aerial_work_vehicles; company_name text:=nullif(btrim(p_company),'');
  snapshot jsonb; capacity integer; kept_ids uuid[]:='{}'; released_id uuid;
begin
  if p_date is null then raise exception '日付を確認してください。'; end if;
  perform pg_advisory_xact_lock(250925001);
  lock table public.aerial_work_vehicles in share row exclusive mode;
  select * into vehicle from public.aerial_work_vehicles where id=p_vehicle for update;
  if vehicle.id is null or vehicle.updated_at is distinct from p_expected then
    raise exception '配置・割当が変更されています。更新して再度操作してください。';
  end if;
  if not exists(select 1 from public.equipment_floor_master where id=p_floor) then raise exception 'フロアが存在しません。'; end if;
  snapshot:=public.get_equipment_board_snapshot(p_date);
  if company_name is not null then
    select sum(r.requested_count)::integer into capacity
      from jsonb_to_recordset(snapshot->'requests') r(equipment_type text,floor_id uuid,company text,requested_count integer)
      where r.equipment_type='aerial_work_vehicle' and r.floor_id=p_floor and r.company=company_name;
    if coalesce(capacity,0)<1 then raise exception '選択日のこのフロアでは、その会社は高所作業車を希望していません。'; end if;
    select coalesce(array_agg(kept.vehicle_id),'{}'::uuid[]) into kept_ids from (
      select candidate.vehicle_id from public.get_equipment_assignment_candidates(snapshot,p_date) candidate
      where candidate.floor_id=p_floor and candidate.company=company_name and candidate.vehicle_id<>p_vehicle
        and candidate.assignment_rank<=candidate.requested_count
      order by candidate.assignment_rank limit capacity-1
    ) kept;
  end if;

  -- Release pre-existing overflow and the oldest visible assignment being replaced.
  -- A dated blank prevents either record from reappearing after another vehicle is removed.
  for released_id in
    select candidate.vehicle_id from public.get_equipment_assignment_candidates(snapshot,p_date) candidate
    where candidate.vehicle_id<>p_vehicle and (
      candidate.assignment_rank>candidate.requested_count or
      (candidate.floor_id=p_floor and candidate.company=company_name and not candidate.vehicle_id=any(kept_ids))
    )
  loop
    insert into public.equipment_movements(equipment_type,action,vehicle_id,vehicle_number,from_floor_id,to_floor_id,quantity,from_company,to_company,work_date,moved_at)
      select 'aerial_work_vehicle','assign_vehicle',id,vehicle_number,floor_id,floor_id,1,assigned_company,null,p_date,clock_timestamp()
      from public.aerial_work_vehicles where id=released_id;
    update public.aerial_work_vehicles set assigned_company=null,
      updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=released_id;
  end loop;
  update public.aerial_work_vehicles set floor_id=p_floor,assigned_company=company_name,
    updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=p_vehicle;
  insert into public.equipment_movements(equipment_type,action,vehicle_id,vehicle_number,from_floor_id,to_floor_id,quantity,from_company,to_company,work_date,moved_at)
    values('aerial_work_vehicle','assign_vehicle',vehicle.id,vehicle.vehicle_number,vehicle.floor_id,p_floor,1,vehicle.assigned_company,company_name,p_date,clock_timestamp());
end $$;
revoke all on function public.assign_equipment_vehicle_for_date(uuid,uuid,text,date,timestamptz) from public,anon,authenticated;
grant execute on function public.assign_equipment_vehicle_for_date(uuid,uuid,text,date,timestamptz) to service_role;
notify pgrst,'reload schema';

create table if not exists public.public_mutation_limits(scope text not null,key_type text not null check(key_type in('device','ip')),key_hash text not null,bucket_start timestamptz not null,request_count integer not null default 0,primary key(scope,key_type,key_hash,bucket_start));
alter table public.public_mutation_limits enable row level security;
revoke all on public.public_mutation_limits from public,anon,authenticated;
grant select,insert,update,delete on public.public_mutation_limits to service_role;
create or replace function public.consume_public_mutation_limit(p_scope text,p_device_key text,p_ip_key text,p_device_limit integer,p_ip_limit integer,p_window_seconds integer) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare bucket timestamptz:=to_timestamp(floor(extract(epoch from clock_timestamp())/p_window_seconds)*p_window_seconds);device_count integer;ip_count integer;
begin
 if p_scope='' or p_window_seconds<60 or p_device_limit<1 or p_ip_limit<p_device_limit then return false;end if;
 insert into public.public_mutation_limits values(p_scope,'device',p_device_key,bucket,1) on conflict(scope,key_type,key_hash,bucket_start) do update set request_count=public.public_mutation_limits.request_count+1 returning request_count into device_count;
 insert into public.public_mutation_limits values(p_scope,'ip',p_ip_key,bucket,1) on conflict(scope,key_type,key_hash,bucket_start) do update set request_count=public.public_mutation_limits.request_count+1 returning request_count into ip_count;
 if random()<0.02 then delete from public.public_mutation_limits where bucket_start<clock_timestamp()-interval '1 day';end if;
 return device_count<=p_device_limit and ip_count<=p_ip_limit;
end $$;
revoke all on function public.consume_public_mutation_limit(text,text,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_public_mutation_limit(text,text,text,integer,integer,integer) to service_role;
notify pgrst,'reload schema';

-- Current access model: login-free pages call server APIs; browsers never write
-- directly with the anon role. Per-change audit history is intentionally off.
revoke all on public.company_master, public.schedule_groups, public.schedule_subcompanies,
  public.new_entrant_records, public.work_completion_reports,
  public.schedule_equipment_requests, public.equipment_floor_master from anon, authenticated;
create table if not exists public.admin_login_attempts(
  id bigint generated always as identity primary key,
  client_key text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists admin_login_attempts_lookup_idx on public.admin_login_attempts(client_key,attempted_at desc);
alter table public.admin_login_attempts enable row level security;
revoke all on public.admin_login_attempts from public,anon,authenticated;
grant select,insert,delete on public.admin_login_attempts to service_role;
do $$ declare t text; begin foreach t in array array['company_master','schedule_groups','schedule_subcompanies','schedule_aerial_work_vehicles','new_entrant_records','work_completion_reports'] loop if to_regclass('public.'||t) is not null then execute format('drop trigger if exists audit_changes on public.%I',t);end if;end loop;end $$;
select cron.unschedule(jobid) from cron.job where jobname='ktnk-audit-log-cleanup';
drop function if exists public.restore_audit_change(bigint,boolean);
drop function if exists public.restore_audit_change(bigint);
drop function if exists public.delete_expired_audit_logs();
drop function if exists public.capture_audit_log();
drop table if exists public.audit_logs;
notify pgrst,'reload schema';

-- 2026-10-01 review fixes
begin;

-- A second update in one transaction must still change the editor's version.


-- A report's original timestamp remains unchanged when its notes are edited.
alter table public.work_completion_reports add column if not exists revision integer not null default 1;
create or replace function public.bump_completion_revision()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.revision := old.revision + 1;
  return new;
end $$;
drop trigger if exists work_completion_reports_revision on public.work_completion_reports;
create trigger work_completion_reports_revision before update on public.work_completion_reports
for each row execute function public.bump_completion_revision();

-- Check the version while holding the same date lock used by ordinary saves.
create or replace function public.save_schedule_with_revision(
  p_groups jsonb,p_subcompanies jsonb,p_equipment_requests jsonb,p_overwrite boolean,p_skip_existing boolean,
  p_expected_id uuid,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_row public.schedule_groups;
begin
  if p_expected_id is null or p_expected_updated_at is null or jsonb_array_length(p_groups)<>1 then raise exception 'Invalid schedule revision'; end if;
  perform pg_advisory_xact_lock(250925001);
  select * into current_row from public.schedule_groups where id=p_expected_id for update;
  if current_row.id is null or current_row.updated_at is distinct from p_expected_updated_at then raise exception 'SCHEDULE_CHANGED'; end if;
  return public.save_schedule_atomically(p_groups,p_subcompanies,p_equipment_requests,p_overwrite,p_skip_existing,p_expected_id);
end $$;
revoke all on function public.save_schedule_with_revision(jsonb,jsonb,jsonb,boolean,boolean,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.save_schedule_with_revision(jsonb,jsonb,jsonb,boolean,boolean,uuid,timestamptz) to service_role;

-- Name changes are applied to every live reference in one transaction.
-- Renaming into another existing primary company is rejected, never merged.
create or replace function public.update_company_master_atomically(
  p_id uuid, p_old_primary text, p_primary text, p_secondary text, p_roles text[]
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare item public.company_master; old_primary text; new_primary text := btrim(p_primary);
  new_secondary text := nullif(btrim(p_secondary), '');
begin
  if coalesce(new_primary, '') = '' then raise exception '一次会社を入力してください。'; end if;
  perform pg_advisory_xact_lock(250925001);
  lock table public.company_master in share row exclusive mode;
  if p_id is null then
    old_primary := btrim(p_old_primary);
    if not exists(select 1 from public.company_master where primary_company = old_primary) then return false; end if;
  else
    select * into item from public.company_master where id = p_id for update;
    if item.id is null then return false; end if;
    old_primary := item.primary_company;
    -- The row editor edits secondary names; use the primary-company editor for renames.
    if new_primary <> old_primary then raise exception '一次会社名は一次会社の編集から変更してください。'; end if;
    if exists(select 1 from public.company_master where id <> p_id and primary_company = old_primary
      and coalesce(secondary_company,'') = coalesce(new_secondary,'')) then
      raise exception using errcode = '23505', message = '同じ会社マスタがすでに登録されています。';
    end if;
    update public.schedule_subcompanies sub set secondary_company = new_secondary
      from public.schedule_groups grp where grp.id = sub.schedule_group_id and grp.primary_company = old_primary
        and coalesce(sub.secondary_company,'') = coalesce(item.secondary_company,'');
    -- Invalidate editors that loaded the old secondary-company name.
    update public.schedule_groups grp set updated_at = clock_timestamp()
      where grp.primary_company = old_primary and exists(
        select 1 from public.schedule_subcompanies sub where sub.schedule_group_id = grp.id
          and coalesce(sub.secondary_company,'') = coalesce(new_secondary,''));
    update public.new_entrant_records set secondary_company = coalesce(new_secondary, '')
      where primary_company = old_primary and coalesce(secondary_company,'') = coalesce(item.secondary_company,'');
    update public.company_master set secondary_company = new_secondary where id = p_id;
    return true;
  end if;
  if new_primary <> old_primary then
    if exists(select 1 from public.company_master where primary_company = new_primary)
      or exists(select 1 from public.schedule_groups where primary_company = new_primary)
      or exists(select 1 from public.new_entrant_records where primary_company = new_primary)
      or exists(select 1 from public.work_completion_reports where primary_company = new_primary) then
      raise exception using errcode = '23505', message = '変更先の会社名は既に使われています。';
    end if;
    update public.schedule_groups set primary_company = new_primary where primary_company = old_primary;
    update public.new_entrant_records set primary_company = new_primary where primary_company = old_primary;
    update public.work_completion_reports set primary_company = new_primary where primary_company = old_primary;
    update public.aerial_work_vehicles set assigned_company = new_primary, updated_at = clock_timestamp() where assigned_company = old_primary;
    update public.equipment_movements set
      from_company = case when from_company = old_primary then new_primary else from_company end,
      to_company = case when to_company = old_primary then new_primary else to_company end
      where from_company = old_primary or to_company = old_primary;
  end if;
  update public.company_master set primary_company = new_primary, primary_trade_roles = coalesce(p_roles, '{}')
    where primary_company = old_primary;
  return true;
end $$;
revoke all on function public.update_company_master_atomically(uuid,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.update_company_master_atomically(uuid,text,text,text,text[]) to service_role;

-- Retrieve only the latest movement and the latest relevant assignment per company.
-- Long-idle vehicles must not disappear behind the REST API's row limit.
create index if not exists equipment_movements_vehicle_date_idx
  on public.equipment_movements(vehicle_id, work_date desc, moved_at desc, id) where work_date is not null;


revoke all on function public.create_data_backup(text), public.restore_data_backup(uuid) from public,anon,authenticated;
grant execute on function public.create_data_backup(text), public.restore_data_backup(uuid) to service_role;

notify pgrst, 'reload schema';
commit;

-- 2026-10-01 atomic input flows
begin;

-- Single-site writes share a short transaction lock with company renames/restores.
-- Keep the original payload implementation private to the validated wrapper.
do $$ begin
  if to_regprocedure('public.save_schedule_payload(jsonb,jsonb,jsonb,boolean,boolean,uuid)') is null then
    alter function public.save_schedule_atomically(jsonb,jsonb,jsonb,boolean,boolean,uuid) rename to save_schedule_payload;
  end if;
end $$;
create or replace function public.save_schedule_atomically(
  p_groups jsonb,p_subcompanies jsonb,p_equipment_requests jsonb,
  p_overwrite boolean default false,p_skip_existing boolean default false,p_expected_id uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare primary_name text := p_groups->0->>'primary_company';
begin
  perform pg_advisory_xact_lock(250925001);
  if not exists(select 1 from public.company_master where primary_company=primary_name) then raise exception 'COMPANY_NOT_FOUND'; end if;
  if exists(select 1 from jsonb_array_elements(p_subcompanies) sub
    where coalesce(btrim(sub->>'secondary_company'),'')<>'' and not exists(
      select 1 from public.company_master where primary_company=primary_name and secondary_company=sub->>'secondary_company')) then
    raise exception 'SECONDARY_COMPANY_CHANGED';
  end if;
  return public.save_schedule_payload(p_groups,p_subcompanies,p_equipment_requests,p_overwrite,p_skip_existing,p_expected_id);
end $$;


create or replace function public.ensure_secondary_companies(p_primary text,p_secondaries text[])
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare first_row public.company_master; next_order integer; company_name text;
begin
  perform pg_advisory_xact_lock(250925001);
  select * into first_row from public.company_master where primary_company=p_primary order by sort_order,id limit 1;
  if first_row.id is null then return false; end if;
  select coalesce(max(sort_order),-1)+1 into next_order from public.company_master;
  for company_name in select distinct btrim(name) from unnest(p_secondaries) names(name) where coalesce(btrim(name),'')<>'' order by 1 loop
    insert into public.company_master(primary_company,secondary_company,primary_trade_roles,sort_order)
      values(p_primary,company_name,first_row.primary_trade_roles,next_order) on conflict do nothing;
    next_order:=next_order+1;
  end loop;
  return true;
end $$;

create or replace function public.reorder_company_master(p_ids uuid[])
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(250925001);
  lock table public.company_master in share row exclusive mode;
  if cardinality(p_ids) is distinct from (select count(*) from public.company_master)
    or cardinality(p_ids) is distinct from (select count(distinct id) from unnest(p_ids) items(id))
    or exists(select 1 from unnest(p_ids) items(id) where not exists(select 1 from public.company_master master where master.id=items.id)) then
    raise exception 'COMPANY_LIST_CHANGED';
  end if;
  update public.company_master master set sort_order=ordered.position
    from (select id,ordinality-1 position from unnest(p_ids) with ordinality items(id,ordinality)) ordered
    where master.id=ordered.id and master.sort_order is distinct from ordered.position;
end $$;

create or replace function public.delete_operational_record(p_table text,p_id uuid,p_expected_updated_at timestamptz)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_row jsonb;
begin
  if p_table not in ('schedule_groups','new_entrant_records') or p_expected_updated_at is null then raise exception 'Invalid record'; end if;
  perform pg_advisory_xact_lock(250925001);
  execute format('select to_jsonb(row) from public.%I row where id=$1 for update',p_table) into current_row using p_id;
  if current_row is null then return false; end if;
  if (current_row->>'updated_at')::timestamptz is distinct from p_expected_updated_at then raise exception 'OPERATION_CHANGED'; end if;
  execute format('delete from public.%I where id=$1',p_table) using p_id;
  return true;
end $$;

create or replace function public.move_schedule_with_revision(p_id uuid,p_original_date date,p_date date,p_expected_updated_at timestamptz)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_row public.schedule_groups;
begin
  perform pg_advisory_xact_lock(250925001);
  select * into current_row from public.schedule_groups where id=p_id for update;
  if current_row.id is null or current_row.work_date is distinct from p_original_date
    or current_row.updated_at is distinct from p_expected_updated_at or p_expected_updated_at is null then raise exception 'OPERATION_CHANGED'; end if;
  if p_date is null or extract(dow from p_date)=0 then raise exception 'Invalid date'; end if;
  update public.schedule_groups set work_date=p_date where id=p_id;
end $$;

-- The version check happens before adding any new company. Company registration
-- and entrant writes either both commit or both roll back.
create or replace function public.save_new_entrants_atomically(
  p_date date,p_primary text,p_people jsonb,p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare person jsonb; entry_id uuid; current_row public.new_entrant_records; saved_row public.new_entrant_records;
  records jsonb:='[]'; secondaries text[];
begin
  if p_date is null or extract(dow from p_date)=0 or jsonb_typeof(p_people) is distinct from 'array'
    or jsonb_array_length(p_people) not between 1 and 200 then raise exception 'Invalid entrant payload'; end if;
  perform pg_advisory_xact_lock(250925001);
  if p_expected_updated_at is not null then
    if jsonb_array_length(p_people)<>1 then raise exception 'Invalid entrant revision'; end if;
    select * into current_row from public.new_entrant_records where id=(p_people->0->>'id')::uuid for update;
    if current_row.id is null or current_row.updated_at is distinct from p_expected_updated_at then raise exception 'ENTRY_CHANGED'; end if;
    if current_row.person_count<>1 then raise exception 'LEGACY_ENTRY'; end if;
  end if;
  if not exists(select 1 from public.company_master where primary_company=p_primary) then raise exception 'COMPANY_NOT_FOUND'; end if;
  if exists(select 1 from jsonb_array_elements(p_people) item where coalesce(item->>'secondaryCompany','')<>''
    and not coalesce((item->>'registerSecondaryCompany')::boolean,false)
    and not exists(select 1 from public.company_master where primary_company=p_primary and secondary_company=item->>'secondaryCompany')) then
    raise exception 'SECONDARY_COMPANY_CHANGED';
  end if;
  select array_agg(person_item->>'secondaryCompany') into secondaries from jsonb_array_elements(p_people) person_item
    where coalesce((person_item->>'registerSecondaryCompany')::boolean,false);
  if not public.ensure_secondary_companies(p_primary,secondaries) then raise exception 'COMPANY_NOT_FOUND'; end if;
  for person in select value from jsonb_array_elements(p_people) loop
    if coalesce(btrim(person->>'personName'),'')='' or coalesce(person->>'nationalityStatus','') not in ('japanese_only','includes_foreign') then raise exception 'Invalid entrant'; end if;
    entry_id:=coalesce((person->>'id')::uuid,gen_random_uuid());
    if p_expected_updated_at is not null then
      update public.new_entrant_records set entry_date=p_date,primary_company=p_primary,
        secondary_company=coalesce(person->>'secondaryCompany',''),person_names=person->>'personName',
        nationality_status=person->>'nationalityStatus',notes=nullif(person->>'notes','') where id=entry_id returning * into saved_row;
    else
      insert into public.new_entrant_records(id,entry_date,primary_company,secondary_company,person_count,person_names,nationality_status,notes)
        values(entry_id,p_date,p_primary,coalesce(person->>'secondaryCompany',''),1,person->>'personName',person->>'nationalityStatus',nullif(person->>'notes',''))
        on conflict(id) do nothing returning * into saved_row;
      if saved_row.id is null then
        select * into saved_row from public.new_entrant_records where id=entry_id;
        if saved_row.entry_date is distinct from p_date or saved_row.primary_company is distinct from p_primary
          or saved_row.secondary_company is distinct from coalesce(person->>'secondaryCompany','')
          or saved_row.person_names is distinct from person->>'personName'
          or saved_row.nationality_status is distinct from person->>'nationalityStatus'
          or coalesce(saved_row.notes,'') is distinct from coalesce(person->>'notes','') then raise exception 'ENTRY_CHANGED'; end if;
      end if;
    end if;
    records:=records||jsonb_build_array(to_jsonb(saved_row));
  end loop;
  return jsonb_build_object('records',records);
end $$;

revoke all on function public.save_schedule_atomically(jsonb,jsonb,boolean,boolean,uuid),
  public.save_schedule_atomically(jsonb,jsonb,jsonb,boolean,boolean,uuid),
  public.save_schedule_payload(jsonb,jsonb,jsonb,boolean,boolean,uuid),public.ensure_secondary_companies(text,text[]),
  public.reorder_company_master(uuid[]),public.delete_operational_record(text,uuid,timestamptz),
  public.move_schedule_with_revision(uuid,date,date,timestamptz),public.save_new_entrants_atomically(date,text,jsonb,timestamptz)
  from public,anon,authenticated;
grant execute on function public.save_schedule_atomically(jsonb,jsonb,jsonb,boolean,boolean,uuid),
  public.save_schedule_payload(jsonb,jsonb,jsonb,boolean,boolean,uuid),public.ensure_secondary_companies(text,text[]),
  public.reorder_company_master(uuid[]),public.delete_operational_record(text,uuid,timestamptz),
  public.move_schedule_with_revision(uuid,date,date,timestamptz),public.save_new_entrants_atomically(date,text,jsonb,timestamptz)
  to service_role;


notify pgrst,'reload schema';
commit;

begin;

-- Serialize completion validation and writes with company edits and restores.
create or replace function public.save_work_completion_atomically(
  p_date date, p_primary text, p_notes text, p_cancel boolean,
  p_reported_at timestamptz, p_expected_reported_at timestamptz default null,
  p_expected_revision integer default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved_row public.work_completion_reports;
begin
  if p_date is null or coalesce(btrim(p_primary),'')='' or p_cancel is null
    or p_reported_at is null or length(coalesce(p_notes,''))>2000
    or (p_expected_reported_at is not null and coalesce(p_expected_revision,0)<1)
    or (p_cancel and p_expected_reported_at is null) then
    raise exception 'Invalid completion payload';
  end if;
  perform pg_advisory_xact_lock(250925001);
  if not exists(select 1 from public.company_master where primary_company=p_primary) then
    raise exception 'COMPANY_NOT_FOUND';
  end if;
  if not p_cancel and not exists(select 1 from public.schedule_groups where work_date=p_date and primary_company=p_primary) then
    raise exception 'SCHEDULE_NOT_FOUND';
  end if;
  if p_cancel then
    delete from public.work_completion_reports
      where work_date=p_date and primary_company=p_primary
        and reported_at=p_expected_reported_at and revision=p_expected_revision
      returning * into saved_row;
  elsif p_expected_reported_at is not null then
    update public.work_completion_reports set notes=coalesce(p_notes,'')
      where work_date=p_date and primary_company=p_primary
        and reported_at=p_expected_reported_at and revision=p_expected_revision
      returning * into saved_row;
  else
    insert into public.work_completion_reports(work_date,primary_company,notes,reported_at)
      values(p_date,p_primary,coalesce(p_notes,''),p_reported_at)
      on conflict(work_date,primary_company) do nothing returning * into saved_row;
  end if;
  if saved_row.work_date is null then return null; end if;
  return to_jsonb(saved_row);
end $$;
revoke all on function public.save_work_completion_atomically(date,text,text,boolean,timestamptz,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.save_work_completion_atomically(date,text,text,boolean,timestamptz,timestamptz,integer) to service_role;
notify pgrst,'reload schema';
commit;

begin;

-- Latest dated override, including an explicit blank assignment.
create index if not exists equipment_movements_vehicle_date_idx
  on public.equipment_movements (vehicle_id, work_date desc, moved_at desc, id desc)
  include (to_floor_id, to_company)
  where work_date is not null;

-- Seek the last assignment for each currently requested company without scanning history.
create index if not exists equipment_movements_vehicle_company_date_idx
  on public.equipment_movements (vehicle_id, to_floor_id, to_company, work_date desc, moved_at desc, id desc)
  where work_date is not null and to_company is not null;

-- A single snapshot avoids five HTTP queries and API row-limit truncation.
-- Return at most two history rows per vehicle; capacity allocation stays in the shared resolver.
create or replace function public.get_equipment_board_snapshot(p_date date)
returns jsonb language sql stable security invoker
set search_path = public, pg_temp as $$
  with requests as materialized (
    select r.equipment_type, r.floor_id, sum(r.requested_count)::integer as requested_count,
      s.primary_company as company
    from public.schedule_groups s
    join public.schedule_equipment_requests r on r.schedule_group_id = s.id
    where s.work_date = p_date
    group by r.equipment_type, r.floor_id, s.primary_company
  ), vehicles as materialized (
    select id, vehicle_number, notes, sort_order, floor_id, assigned_company, updated_at
    from public.aerial_work_vehicles
  ), history as (
    select v.id as vehicle_id, h.to_floor_id, h.to_company, h.work_date, h.moved_at, h.source
    from vehicles v
    cross join lateral (
      (select m.to_floor_id, m.to_company, m.work_date, m.moved_at, 0 as source
       from public.equipment_movements m
       where m.vehicle_id = v.id and m.work_date <= p_date
       order by m.work_date desc, m.moved_at desc, m.id desc limit 1)
      union all
      (select previous.to_floor_id, previous.to_company, previous.work_date, previous.moved_at, 1 as source
       from requests r
       cross join lateral (
         select m.to_floor_id, m.to_company, m.work_date, m.moved_at, m.id
         from public.equipment_movements m
         where m.vehicle_id = v.id and m.to_floor_id = v.floor_id
           and m.to_company = r.company and m.to_company is not null and m.work_date <= p_date
         order by m.work_date desc, m.moved_at desc, m.id desc limit 1
       ) previous
       where r.equipment_type = 'aerial_work_vehicle' and r.floor_id = v.floor_id
       order by previous.work_date desc, previous.moved_at desc, previous.id desc limit 1)
    ) h
  )
  select jsonb_build_object(
    'floors', coalesce((select jsonb_agg(to_jsonb(f) order by f.sort_order, f.name, f.id)
      from (select id, name, sort_order from public.equipment_floor_master) f), '[]'::jsonb),
    'vehicles', coalesce((select jsonb_agg(to_jsonb(v) order by v.sort_order, v.vehicle_number, v.id)
      from vehicles v), '[]'::jsonb),
    'tachiumas', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order, t.name, t.id)
      from (select id, name, notes, sort_order, floor_id, updated_at from public.tachiuma_units) t), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.equipment_type, r.floor_id, r.company)
      from requests r), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h) - 'source' order by h.vehicle_id, h.source) from history h), '[]'::jsonb)
  );
$$;

revoke all on function public.get_equipment_board_snapshot(date) from public, anon, authenticated;
grant execute on function public.get_equipment_board_snapshot(date) to service_role;

notify pgrst, 'reload schema';
commit;

begin;

-- Leftmost columns of the retained compound indexes cover these lookups.
-- Keep all primary keys, unique constraints, and company/date indexes.
drop index if exists public.company_master_primary_idx;
drop index if exists public.schedule_groups_primary_company_idx;
drop index if exists public.schedule_groups_work_date_idx;
drop index if exists public.new_entrant_records_entry_date_idx;

-- Older migrations added a second index for the table's existing unique key.
-- Remove only the standalone duplicate when the constraint index is identical.
do $$
begin
  if exists (
    select 1 from pg_index duplicate
    join pg_index keeper on keeper.indrelid=duplicate.indrelid
      and keeper.indkey=duplicate.indkey and keeper.indclass=duplicate.indclass
      and keeper.indcollation=duplicate.indcollation and keeper.indoption=duplicate.indoption
    join pg_constraint constraint_row on constraint_row.conindid=keeper.indexrelid
      and constraint_row.contype='u'
    where duplicate.indexrelid=to_regclass('public.schedule_groups_work_date_primary_company_idx')
      and keeper.indexrelid<>duplicate.indexrelid
      and duplicate.indisunique and keeper.indisunique and keeper.indisvalid
      and duplicate.indpred is null and keeper.indpred is null
      and duplicate.indexprs is null and keeper.indexprs is null
      and not exists(select 1 from pg_constraint where conindid=duplicate.indexrelid)
  ) then
    drop index public.schedule_groups_work_date_primary_company_idx;
  end if;
end $$;

-- Both callers now use the dated assignment RPC and bounded snapshot RPC.
-- No CASCADE: an unexpected database dependency must stop this migration.
drop function if exists public.assign_equipment_vehicle(uuid,uuid,text,timestamptz);
drop function if exists public.get_equipment_assignment_history(date);

notify pgrst,'reload schema';
commit;

begin;
-- Use the same exact-date / previous-company / legacy priority as the board.
-- Include overflow candidates so a write can explicitly release hidden assignments.
create or replace function public.get_equipment_assignment_candidates(p_snapshot jsonb,p_date date)
returns table(vehicle_id uuid,floor_id uuid,company text,assignment_rank bigint,requested_count integer)
language sql immutable set search_path=public,pg_temp as $$
  with capacities as (
    select r.floor_id,r.company,sum(r.requested_count)::integer requested_count
    from jsonb_to_recordset(p_snapshot->'requests') r(equipment_type text,floor_id uuid,company text,requested_count integer)
    where r.equipment_type='aerial_work_vehicle' group by r.floor_id,r.company
  ), history as (
    select * from jsonb_to_recordset(p_snapshot->'history')
      h(vehicle_id uuid,to_floor_id uuid,to_company text,work_date date,moved_at timestamptz)
    where h.work_date<=p_date
  ), candidates as (
    select v.id,v.floor_id,v.sort_order,v.vehicle_number,chosen.company,
      case when exact.vehicle_id is not null then 0 when previous.to_company is not null then 1 else 2 end priority,
      case when exact.vehicle_id is not null then exact.work_date else previous.work_date end history_date,
      case when exact.vehicle_id is not null then exact.moved_at else previous.moved_at end moved_at
    from jsonb_to_recordset(p_snapshot->'vehicles')
      v(id uuid,floor_id uuid,assigned_company text,sort_order integer,vehicle_number text)
    left join lateral (
      select h.* from history h where h.vehicle_id=v.id and h.work_date=p_date order by h.moved_at desc limit 1
    ) exact on true
    left join lateral (
      select h.* from history h where h.vehicle_id=v.id order by h.work_date desc,h.moved_at desc limit 1
    ) latest on true
    left join lateral (
      select h.* from history h join capacities c on c.floor_id=v.floor_id and c.company=h.to_company
      where h.vehicle_id=v.id and h.to_floor_id=v.floor_id
      order by h.work_date desc,h.moved_at desc limit 1
    ) previous on true
    cross join lateral (
      select case
        when exact.vehicle_id is not null then case when exact.to_floor_id=v.floor_id then exact.to_company end
        when latest.vehicle_id is not null and latest.to_floor_id<>v.floor_id then null
        else coalesce(previous.to_company,v.assigned_company) end company
    ) chosen
  )
  select candidate.id,candidate.floor_id,candidate.company,
    row_number() over(partition by candidate.floor_id,candidate.company order by candidate.priority,
      candidate.history_date desc nulls last,candidate.moved_at desc nulls last,
      candidate.sort_order,candidate.vehicle_number,candidate.id),capacity.requested_count
  from candidates candidate join capacities capacity
    on capacity.floor_id=candidate.floor_id and capacity.company=candidate.company;
$$;
revoke all on function public.get_equipment_assignment_candidates(jsonb,date) from public,anon,authenticated;
grant execute on function public.get_equipment_assignment_candidates(jsonb,date) to service_role;

-- Editing a vehicle's company uses the same dated capacity rules as drag/drop.
create or replace function public.save_equipment_vehicle_for_date(
  p_vehicle uuid,p_number text,p_notes text,p_floor uuid,p_company text,p_expected timestamptz,p_date date
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved_id uuid; saved_version timestamptz;
begin
  perform pg_advisory_xact_lock(250925001);
  saved_id:=public.save_equipment_vehicle(p_vehicle,p_number,p_notes,p_floor,p_company,p_expected);
  select updated_at into saved_version from public.aerial_work_vehicles where id=saved_id;
  perform public.assign_equipment_vehicle_for_date(saved_id,p_floor,p_company,p_date,saved_version);
  return saved_id;
end $$;
revoke all on function public.save_equipment_vehicle_for_date(uuid,text,text,uuid,text,timestamptz,date) from public,anon,authenticated;
grant execute on function public.save_equipment_vehicle_for_date(uuid,text,text,uuid,text,timestamptz,date) to service_role;

notify pgrst,'reload schema';
commit;
