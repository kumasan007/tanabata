-- Isolated fixtures only. Reproduce replacement followed by removal.
begin;
do $$
declare floor_id uuid:=gen_random_uuid(); schedule_id uuid:=gen_random_uuid();
  ids uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  item integer; old_version timestamptz; rejected boolean:=false; board jsonb;
begin
  insert into public.company_master(primary_company,secondary_company) values('__capacity_company',null);
  insert into public.equipment_floor_master(id,name) values(floor_id,'__capacity_floor');
  insert into public.schedule_groups(id,work_date,primary_company,primary_count,work_area,work_content)
    values(schedule_id,'2026-10-01','__capacity_company',1,'area','work');
  insert into public.schedule_equipment_requests(schedule_group_id,equipment_type,floor_id,requested_count)
    values(schedule_id,'aerial_work_vehicle',floor_id,3);
  for item in 1..5 loop
    insert into public.aerial_work_vehicles(id,vehicle_number,floor_id,sort_order)
      values(ids[item],item::text,floor_id,item);
  end loop;
  for item in 1..3 loop
    select updated_at into old_version from public.aerial_work_vehicles where id=ids[item];
    perform public.assign_equipment_vehicle_for_date(ids[item],floor_id,'__capacity_company','2026-10-01',old_version);
  end loop;
  select updated_at into old_version from public.aerial_work_vehicles where id=ids[1];
  perform public.save_equipment_vehicle_for_date(ids[4],'4','note',floor_id,'__capacity_company',
    (select updated_at from public.aerial_work_vehicles where id=ids[4]),'2026-10-01');
  if (select assigned_company from public.aerial_work_vehicles where id=ids[1]) is not null
    or (select count(*) from public.aerial_work_vehicles where assigned_company='__capacity_company')<>3 then
    raise exception 'Fourth vehicle did not replace the first stored assignment';
  end if;
  begin
    perform public.assign_equipment_vehicle_for_date(ids[1],floor_id,'__capacity_company','2026-10-01',old_version);
  exception when raise_exception then rejected:=true;
  end;
  if not rejected then raise exception 'Displaced vehicle accepted a stale revision'; end if;
  perform public.assign_equipment_vehicle_for_date(ids[4],floor_id,null,'2026-10-01',
    (select updated_at from public.aerial_work_vehicles where id=ids[4]));
  board:=public.get_equipment_board_snapshot('2026-10-01');
  if (select count(*) from public.get_equipment_assignment_candidates(board,'2026-10-01')
      where assignment_rank<=requested_count)<>2 then
    raise exception 'Displaced vehicle reappeared after removal';
  end if;
  if exists(select 1 from public.get_equipment_assignment_candidates(board,'2026-10-01') where vehicle_id in(ids[1],ids[4])) then
    raise exception 'Dated release did not block the old history';
  end if;

  -- Legacy hidden overflow must also stay released when a visible vehicle is removed.
  insert into public.equipment_movements(equipment_type,action,vehicle_id,from_floor_id,to_floor_id,quantity,to_company,work_date,moved_at)
    values('aerial_work_vehicle','assign_vehicle',ids[1],floor_id,floor_id,1,'__capacity_company','2026-10-01',clock_timestamp());
  update public.aerial_work_vehicles set assigned_company='__capacity_company' where id in(ids[1],ids[5]);
  perform public.assign_equipment_vehicle_for_date(ids[2],floor_id,null,'2026-10-01',
    (select updated_at from public.aerial_work_vehicles where id=ids[2]));
  if (select assigned_company from public.aerial_work_vehicles where id=ids[5]) is not null then
    raise exception 'Legacy hidden overflow remained stored';
  end if;
  board:=public.get_equipment_board_snapshot('2026-10-01');
  if (select count(*) from public.get_equipment_assignment_candidates(board,'2026-10-01')
      where assignment_rank<=requested_count)<>2 then raise exception 'Legacy overflow refilled the removed slot'; end if;

  -- Invalid destinations must roll back both metadata and assignment changes.
  rejected:=false;
  begin
    perform public.save_equipment_vehicle_for_date(ids[3],'changed','note',floor_id,'__capacity_company',
      (select updated_at from public.aerial_work_vehicles where id=ids[3]),'2026-10-02');
  exception when raise_exception then rejected:=true;
  end;
  if not rejected or (select vehicle_number from public.aerial_work_vehicles where id=ids[3])<>'3' then
    raise exception 'Invalid company request left a partial vehicle edit';
  end if;
end $$;
rollback;
