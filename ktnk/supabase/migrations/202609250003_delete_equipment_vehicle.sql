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
