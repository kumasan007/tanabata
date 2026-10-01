-- Isolated fixtures: never run against production.
begin;
do $$
declare floor_id uuid:=gen_random_uuid(); first_id uuid:=gen_random_uuid(); second_id uuid:=gen_random_uuid();
  unit_id uuid:=gen_random_uuid(); original_version timestamptz; rejected boolean:=false;
begin
  insert into public.equipment_floor_master(id,name) values(floor_id,'__cleanup_floor');
  insert into public.aerial_work_vehicles(id,vehicle_number,floor_id,sort_order)
    values(first_id,'__cleanup_first',floor_id,0),(second_id,'__cleanup_second',floor_id,1);
  select updated_at into original_version from public.aerial_work_vehicles where id=first_id;
  perform public.reorder_equipment_vehicles(array[first_id,second_id]);
  if (select updated_at from public.aerial_work_vehicles where id=first_id) is distinct from original_version then
    raise exception 'Unchanged vehicle order invalidated an editor';
  end if;
  perform public.reorder_equipment_vehicles(array[second_id,first_id]);
  if (select sort_order from public.aerial_work_vehicles where id=first_id)<>1
    or (select updated_at from public.aerial_work_vehicles where id=first_id)<=original_version then
    raise exception 'Changed vehicle order did not advance its version';
  end if;
  begin
    perform public.reorder_equipment_vehicles(array[first_id,gen_random_uuid()]);
  exception when raise_exception then rejected:=true;
  end;
  if not rejected then raise exception 'Unknown vehicle ID accepted'; end if;

  insert into public.tachiuma_units(id,name,floor_id,sort_order) values(unit_id,'__cleanup_unit',floor_id,0);
  select updated_at into original_version from public.tachiuma_units where id=unit_id;
  perform public.reorder_tachiuma_units(array[unit_id]);
  if (select updated_at from public.tachiuma_units where id=unit_id) is distinct from original_version then
    raise exception 'Unchanged tachiuma order invalidated an editor';
  end if;
  rejected:=false;
  begin
    perform public.reorder_tachiuma_units(array[gen_random_uuid()]);
  exception when raise_exception then rejected:=true;
  end;
  if not rejected then raise exception 'Unknown tachiuma ID accepted'; end if;

  if exists(select 1 from pg_indexes where schemaname='public' and indexname in
    ('company_master_primary_idx','schedule_groups_primary_company_idx','schedule_groups_work_date_idx',
     'new_entrant_records_entry_date_idx','schedule_groups_work_date_primary_company_idx')) then
    raise exception 'Redundant index retained';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.schedule_groups'::regclass and contype='u') then
    raise exception 'Schedule uniqueness constraint removed';
  end if;
end $$;
rollback;
