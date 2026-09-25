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
