begin;

alter table public.equipment_movements add column if not exists work_date date;

create or replace function public.assign_equipment_vehicle_for_date(
  p_vehicle uuid, p_floor uuid, p_company text, p_date date, p_expected timestamptz
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.aerial_work_vehicles; company_name text := nullif(btrim(p_company), '');
begin
  perform pg_advisory_xact_lock(250925001);
  select * into v from public.aerial_work_vehicles where id=p_vehicle for update;
  if v.id is null or v.updated_at is distinct from p_expected then raise exception '配置・割当が変更されています。更新して再度操作してください。'; end if;
  if not exists(select 1 from public.equipment_floor_master where id=p_floor) then raise exception 'フロアが存在しません。'; end if;
  if company_name is not null and not exists(
    select 1 from public.schedule_equipment_requests request
    join public.schedule_groups schedule on schedule.id=request.schedule_group_id
    where schedule.work_date=p_date and schedule.primary_company=company_name
      and request.equipment_type='aerial_work_vehicle' and request.floor_id=p_floor and request.requested_count>0
  ) then raise exception '選択日のこのフロアでは、その会社は高所作業車を希望していません。'; end if;
  update public.aerial_work_vehicles set floor_id=p_floor,assigned_company=company_name,updated_at=clock_timestamp() where id=p_vehicle;
  insert into public.equipment_movements(equipment_type,action,vehicle_id,vehicle_number,from_floor_id,to_floor_id,quantity,from_company,to_company,work_date)
    values('aerial_work_vehicle','assign_vehicle',v.id,v.vehicle_number,v.floor_id,p_floor,1,v.assigned_company,company_name,p_date);
end $$;
revoke all on function public.assign_equipment_vehicle_for_date(uuid,uuid,text,date,timestamptz) from public,anon,authenticated;
grant execute on function public.assign_equipment_vehicle_for_date(uuid,uuid,text,date,timestamptz) to service_role;

notify pgrst,'reload schema';
commit;
