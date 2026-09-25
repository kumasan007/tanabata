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
