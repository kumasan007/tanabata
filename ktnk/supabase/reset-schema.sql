drop table if exists public.equipment_movements;
drop table if exists public.aerial_work_vehicles;
drop table if exists public.tachiuma_floor_stocks;
drop table if exists public.schedule_equipment_requests;
drop table if exists public.work_completion_reports;
-- ktnk 作業予定入力システム 初期化SQL
-- Supabase SQL Editorで実行すると、既存データを削除して必要なテーブルを作り直します。

drop trigger if exists schedule_groups_set_updated_at on public.schedule_groups;
drop table if exists public.schedule_aerial_work_vehicles;
drop table if exists public.schedule_subcompanies;
drop table if exists public.schedule_groups;
drop table if exists public.new_entrant_records;
drop function if exists public.set_updated_at();

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

create table public.schedule_subcompanies (
  id uuid primary key default gen_random_uuid(),
  schedule_group_id uuid not null references public.schedule_groups(id) on delete cascade,
  secondary_company text,
  worker_count integer check (worker_count is null or worker_count >= 0),
  sort_order integer not null default 0
);

create table public.new_entrant_records (
  id uuid primary key default gen_random_uuid(), entry_date date not null,
  primary_company text not null, secondary_company text not null,
  person_count integer not null check (person_count > 0),
  person_names text not null check (btrim(person_names) <> ''),
  nationality_status text
    check (nationality_status in ('japanese_only', 'includes_foreign')),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index schedule_groups_work_date_idx
  on public.schedule_groups (work_date);

create index schedule_groups_primary_company_idx
  on public.schedule_groups (primary_company);

create index schedule_subcompanies_group_id_idx
  on public.schedule_subcompanies (schedule_group_id);

create index schedule_subcompanies_secondary_company_idx
  on public.schedule_subcompanies (secondary_company);

create index new_entrant_records_company_date_idx
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

drop policy if exists company_master_app_all on public.company_master;
create policy company_master_app_all
on public.company_master
for all
to anon, authenticated
using (true)
with check (true);

create policy schedule_groups_app_all
on public.schedule_groups
for all
to anon, authenticated
using (true)
with check (true);

create policy schedule_subcompanies_app_all
on public.schedule_subcompanies
for all
to anon, authenticated
using (true)
with check (true);

create policy new_entrant_records_app_all on public.new_entrant_records
for all to anon, authenticated using (true) with check (true);

-- このアプリはNext.js API routesを入口とし、service roleとanonキーの両方に対応します。

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

create trigger new_entrant_records_set_updated_at before update on public.new_entrant_records
for each row execute function public.set_updated_at();

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
    'company_master', coalesce((select jsonb_agg(to_jsonb(r) order by r.sort_order, r.id) from public.company_master r), '[]'::jsonb),
    'equipment_floor_master', coalesce((select jsonb_agg(to_jsonb(r) order by r.sort_order, r.id) from public.equipment_floor_master r), '[]'::jsonb),
    'schedule_groups', coalesce((select jsonb_agg(to_jsonb(r) order by r.work_date, r.id) from public.schedule_groups r), '[]'::jsonb),
    'schedule_subcompanies', coalesce((select jsonb_agg(to_jsonb(r) order by r.schedule_group_id, r.sort_order, r.id) from public.schedule_subcompanies r), '[]'::jsonb),
    'schedule_equipment_requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.schedule_group_id, r.sort_order, r.id) from public.schedule_equipment_requests r), '[]'::jsonb),
    'new_entrant_records', coalesce((select jsonb_agg(to_jsonb(r) order by r.entry_date, r.id) from public.new_entrant_records r), '[]'::jsonb)
  );
  backup_counts := jsonb_build_object(
    'company_master', jsonb_array_length(backup_payload->'company_master'), 'equipment_floor_master', jsonb_array_length(backup_payload->'equipment_floor_master'),
    'schedule_groups', jsonb_array_length(backup_payload->'schedule_groups'), 'schedule_subcompanies', jsonb_array_length(backup_payload->'schedule_subcompanies'),
    'schedule_equipment_requests', jsonb_array_length(backup_payload->'schedule_equipment_requests'), 'new_entrant_records', jsonb_array_length(backup_payload->'new_entrant_records')
  );
  insert into public.data_backups(source, schema_version, row_counts, payload) values(p_source, 4, backup_counts, backup_payload)
  on conflict (backup_date) where source = 'automatic' do update set created_at=now(), schema_version=4, row_counts=excluded.row_counts, payload=excluded.payload
  returning id into backup_id; return backup_id;
end $$;

create or replace function public.restore_data_backup(p_backup_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare backup_payload jsonb; normalized_groups jsonb; restored_counts jsonb;
begin
  select payload into backup_payload from public.data_backups where id=p_backup_id;
  if backup_payload is null then raise exception 'Backup not found'; end if;
  select coalesce(jsonb_agg((item - 'aerial_work_vehicle_count' - 'aerial_work_vehicle_floor') || jsonb_build_object(
    'uses_aerial_work_vehicle', coalesce((item->>'uses_aerial_work_vehicle')::boolean, coalesce((item->>'aerial_work_vehicle_count')::integer,0)>0),
    'aerial_work_vehicle_notes', coalesce(item->>'aerial_work_vehicle_notes', item->>'aerial_work_vehicle_floor')
  )), '[]'::jsonb) into normalized_groups from jsonb_array_elements(backup_payload->'schedule_groups') item;
  perform set_config('app.skip_audit','on',true);
  delete from public.schedule_equipment_requests; delete from public.schedule_subcompanies; delete from public.schedule_groups;
  delete from public.new_entrant_records; delete from public.company_master;
  if backup_payload ? 'equipment_floor_master' then delete from public.equipment_floor_master; end if;
  insert into public.company_master select * from jsonb_populate_recordset(null::public.company_master, backup_payload->'company_master');
  if backup_payload ? 'equipment_floor_master' then insert into public.equipment_floor_master select * from jsonb_populate_recordset(null::public.equipment_floor_master, backup_payload->'equipment_floor_master'); end if;
  insert into public.schedule_groups select * from jsonb_populate_recordset(null::public.schedule_groups, normalized_groups);
  insert into public.schedule_subcompanies select * from jsonb_populate_recordset(null::public.schedule_subcompanies, backup_payload->'schedule_subcompanies');
  insert into public.schedule_equipment_requests select * from jsonb_populate_recordset(null::public.schedule_equipment_requests, coalesce(backup_payload->'schedule_equipment_requests','[]'::jsonb));
  insert into public.new_entrant_records select * from jsonb_populate_recordset(null::public.new_entrant_records, backup_payload->'new_entrant_records');
  restored_counts := jsonb_build_object('company_master',jsonb_array_length(backup_payload->'company_master'),'equipment_floor_master',jsonb_array_length(coalesce(backup_payload->'equipment_floor_master','[]'::jsonb)),'schedule_groups',jsonb_array_length(normalized_groups),'schedule_subcompanies',jsonb_array_length(backup_payload->'schedule_subcompanies'),'schedule_equipment_requests',jsonb_array_length(coalesce(backup_payload->'schedule_equipment_requests','[]'::jsonb)),'new_entrant_records',jsonb_array_length(backup_payload->'new_entrant_records'));
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
alter table public.equipment_movements enable row level security;
revoke all on public.aerial_work_vehicles, public.tachiuma_floor_stocks, public.equipment_movements from anon, authenticated;
grant all on public.aerial_work_vehicles, public.tachiuma_floor_stocks, public.equipment_movements to service_role;

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

create or replace function public.create_data_backup(p_source text default 'manual')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare backup_id uuid; backup_payload jsonb; backup_counts jsonb;
begin
  if p_source not in ('automatic', 'manual') then raise exception 'Invalid backup source'; end if;
  backup_payload := jsonb_build_object(
    'aerial_work_vehicles', coalesce((select jsonb_agg(to_jsonb(r)) from public.aerial_work_vehicles r), '[]'::jsonb),
    'tachiuma_floor_stocks', coalesce((select jsonb_agg(to_jsonb(r)) from public.tachiuma_floor_stocks r), '[]'::jsonb),
    'equipment_movements', coalesce((select jsonb_agg(to_jsonb(r)) from public.equipment_movements r), '[]'::jsonb),
    'company_master', coalesce((select jsonb_agg(to_jsonb(r) order by r.sort_order, r.id) from public.company_master r), '[]'::jsonb),
    'equipment_floor_master', coalesce((select jsonb_agg(to_jsonb(r) order by r.sort_order, r.id) from public.equipment_floor_master r), '[]'::jsonb),
    'schedule_groups', coalesce((select jsonb_agg(to_jsonb(r) order by r.work_date, r.id) from public.schedule_groups r), '[]'::jsonb),
    'schedule_subcompanies', coalesce((select jsonb_agg(to_jsonb(r) order by r.schedule_group_id, r.sort_order, r.id) from public.schedule_subcompanies r), '[]'::jsonb),
    'schedule_equipment_requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.schedule_group_id, r.sort_order, r.id) from public.schedule_equipment_requests r), '[]'::jsonb),
    'new_entrant_records', coalesce((select jsonb_agg(to_jsonb(r) order by r.entry_date, r.id) from public.new_entrant_records r), '[]'::jsonb)
  );
  backup_counts := jsonb_build_object(
    'aerial_work_vehicles', jsonb_array_length(backup_payload->'aerial_work_vehicles'),
    'tachiuma_floor_stocks', jsonb_array_length(backup_payload->'tachiuma_floor_stocks'),
    'equipment_movements', jsonb_array_length(backup_payload->'equipment_movements'),
    'company_master', jsonb_array_length(backup_payload->'company_master'), 'equipment_floor_master', jsonb_array_length(backup_payload->'equipment_floor_master'),
    'schedule_groups', jsonb_array_length(backup_payload->'schedule_groups'), 'schedule_subcompanies', jsonb_array_length(backup_payload->'schedule_subcompanies'),
    'schedule_equipment_requests', jsonb_array_length(backup_payload->'schedule_equipment_requests'), 'new_entrant_records', jsonb_array_length(backup_payload->'new_entrant_records')
  );
  insert into public.data_backups(source, schema_version, row_counts, payload) values(p_source, 5, backup_counts, backup_payload)
  on conflict (backup_date) where source = 'automatic' do update set created_at=now(), schema_version=5, row_counts=excluded.row_counts, payload=excluded.payload
  returning id into backup_id; return backup_id;
end $$;

create or replace function public.restore_data_backup(p_backup_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare backup_payload jsonb; normalized_groups jsonb; restored_counts jsonb;
begin
  select payload into backup_payload from public.data_backups where id=p_backup_id;
  if backup_payload is null then raise exception 'Backup not found'; end if;
  select coalesce(jsonb_agg((item - 'aerial_work_vehicle_count' - 'aerial_work_vehicle_floor') || jsonb_build_object(
    'uses_aerial_work_vehicle', coalesce((item->>'uses_aerial_work_vehicle')::boolean, coalesce((item->>'aerial_work_vehicle_count')::integer,0)>0),
    'aerial_work_vehicle_notes', coalesce(item->>'aerial_work_vehicle_notes', item->>'aerial_work_vehicle_floor')
  )), '[]'::jsonb) into normalized_groups from jsonb_array_elements(backup_payload->'schedule_groups') item;
  perform set_config('app.skip_audit','on',true);
  perform pg_advisory_xact_lock(250925001);
  if backup_payload ? 'aerial_work_vehicles' then
    delete from public.equipment_movements; delete from public.aerial_work_vehicles; delete from public.tachiuma_floor_stocks;
  end if;
  delete from public.schedule_equipment_requests; delete from public.schedule_subcompanies; delete from public.schedule_groups;
  delete from public.new_entrant_records; delete from public.company_master;
  if backup_payload ? 'equipment_floor_master' and backup_payload ? 'aerial_work_vehicles' then delete from public.equipment_floor_master; end if;
  insert into public.company_master select * from jsonb_populate_recordset(null::public.company_master, backup_payload->'company_master');
  if backup_payload ? 'equipment_floor_master' then insert into public.equipment_floor_master select * from jsonb_populate_recordset(null::public.equipment_floor_master, backup_payload->'equipment_floor_master') on conflict(id) do update set name=excluded.name, sort_order=excluded.sort_order; end if;
  insert into public.schedule_groups select * from jsonb_populate_recordset(null::public.schedule_groups, normalized_groups);
  insert into public.schedule_subcompanies select * from jsonb_populate_recordset(null::public.schedule_subcompanies, backup_payload->'schedule_subcompanies');
  insert into public.schedule_equipment_requests select * from jsonb_populate_recordset(null::public.schedule_equipment_requests, coalesce(backup_payload->'schedule_equipment_requests','[]'::jsonb));
  insert into public.new_entrant_records select * from jsonb_populate_recordset(null::public.new_entrant_records, backup_payload->'new_entrant_records');
  if backup_payload ? 'aerial_work_vehicles' then
    insert into public.aerial_work_vehicles select * from jsonb_populate_recordset(null::public.aerial_work_vehicles, coalesce(backup_payload->'aerial_work_vehicles','[]'::jsonb));
    insert into public.tachiuma_floor_stocks select * from jsonb_populate_recordset(null::public.tachiuma_floor_stocks, coalesce(backup_payload->'tachiuma_floor_stocks','[]'::jsonb));
    insert into public.equipment_movements select * from jsonb_populate_recordset(null::public.equipment_movements, coalesce(backup_payload->'equipment_movements','[]'::jsonb));
  end if;
  restored_counts := jsonb_build_object('company_master',jsonb_array_length(backup_payload->'company_master'),'equipment_floor_master',jsonb_array_length(coalesce(backup_payload->'equipment_floor_master','[]'::jsonb)),'schedule_groups',jsonb_array_length(normalized_groups),'schedule_subcompanies',jsonb_array_length(backup_payload->'schedule_subcompanies'),'schedule_equipment_requests',jsonb_array_length(coalesce(backup_payload->'schedule_equipment_requests','[]'::jsonb)),'new_entrant_records',jsonb_array_length(backup_payload->'new_entrant_records'));
  return restored_counts;
end $$;


notify pgrst, 'reload schema';
commit;


-- Current vehicle company assignment
begin;

alter table public.aerial_work_vehicles add column if not exists assigned_company text;
alter table public.equipment_movements
  add column if not exists from_company text,
  add column if not exists to_company text;

-- Assignments describe current usage, independent of the selected calendar date.
create or replace function public.assign_equipment_vehicle(
  p_vehicle uuid, p_floor uuid, p_company text, p_expected timestamptz
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.aerial_work_vehicles; company_name text := nullif(btrim(p_company), '');
begin
  perform pg_advisory_xact_lock(250925001);
  select * into v from public.aerial_work_vehicles where id=p_vehicle for update;
  if v.id is null or v.updated_at is distinct from p_expected then
    raise exception '配置・割当が変更されています。更新して再度操作してください。';
  end if;
  if not exists(select 1 from public.equipment_floor_master where id=p_floor) then
    raise exception 'フロアが存在しません。';
  end if;
  if company_name is not null and company_name is distinct from v.assigned_company
    and not exists(select 1 from public.company_master where primary_company=company_name)
    and not exists(select 1 from public.schedule_groups where primary_company=company_name) then
    raise exception '会社が存在しません。更新して再度選択してください。';
  end if;
  if v.floor_id=p_floor and v.assigned_company is not distinct from company_name then return; end if;
  update public.aerial_work_vehicles
    set floor_id=p_floor,assigned_company=company_name,updated_at=clock_timestamp() where id=p_vehicle;
  insert into public.equipment_movements(equipment_type,action,vehicle_id,from_floor_id,to_floor_id,quantity,from_company,to_company)
    values('aerial_work_vehicle','assign_vehicle',v.id,v.floor_id,p_floor,1,v.assigned_company,company_name);
end $$;
revoke all on function public.assign_equipment_vehicle(uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.assign_equipment_vehicle(uuid,uuid,text,timestamptz) to service_role;

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
create or replace function public.reorder_equipment_vehicles(p_ids uuid[]) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(250925001);
 if cardinality(p_ids) is distinct from(select count(*) from public.aerial_work_vehicles) or cardinality(p_ids) is distinct from(select count(distinct item.id) from unnest(p_ids)item(id)) or exists(select 1 from unnest(p_ids)item(id) left join public.aerial_work_vehicles v on v.id=item.id where v.id is null) then raise exception '号車一覧が変更されています。更新して再度操作してください。';end if;
 update public.aerial_work_vehicles v set sort_order=o.position,updated_at=clock_timestamp() from(select id,ordinality-1 position from unnest(p_ids) with ordinality item(id,ordinality))o where o.id=v.id;
end $$;
revoke all on function public.reorder_equipment_vehicles(uuid[]) from public,anon,authenticated;
grant execute on function public.reorder_equipment_vehicles(uuid[]) to service_role;
notify pgrst,'reload schema';

-- Date-aware vehicle assignment continuity
alter table public.equipment_movements add column if not exists work_date date;
create or replace function public.assign_equipment_vehicle_for_date(p_vehicle uuid,p_floor uuid,p_company text,p_date date,p_expected timestamptz)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.aerial_work_vehicles;company_name text:=nullif(btrim(p_company),'');
begin
 perform pg_advisory_xact_lock(250925001);
 select * into v from public.aerial_work_vehicles where id=p_vehicle for update;
 if v.id is null or v.updated_at is distinct from p_expected then raise exception '配置・割当が変更されています。更新して再度操作してください。';end if;
 if not exists(select 1 from public.equipment_floor_master where id=p_floor) then raise exception 'フロアが存在しません。';end if;
 if company_name is not null and not exists(select 1 from public.schedule_equipment_requests r join public.schedule_groups s on s.id=r.schedule_group_id where s.work_date=p_date and s.primary_company=company_name and r.equipment_type='aerial_work_vehicle' and r.floor_id=p_floor and r.requested_count>0) then raise exception '選択日のこのフロアでは、その会社は高所作業車を希望していません。';end if;
 update public.aerial_work_vehicles set floor_id=p_floor,assigned_company=company_name,updated_at=clock_timestamp() where id=p_vehicle;
 insert into public.equipment_movements(equipment_type,action,vehicle_id,vehicle_number,from_floor_id,to_floor_id,quantity,from_company,to_company,work_date) values('aerial_work_vehicle','assign_vehicle',v.id,v.vehicle_number,v.floor_id,p_floor,1,v.assigned_company,company_name,p_date);
end $$;
revoke all on function public.assign_equipment_vehicle_for_date(uuid,uuid,text,date,timestamptz) from public,anon,authenticated;
grant execute on function public.assign_equipment_vehicle_for_date(uuid,uuid,text,date,timestamptz) to service_role;
notify pgrst,'reload schema';
