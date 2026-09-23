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
