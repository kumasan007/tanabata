-- Run only against a disposable database with all migrations applied.
begin;
do $$
declare floor_id uuid := gen_random_uuid(); vehicle_uuid uuid := gen_random_uuid(); unit_id uuid := gen_random_uuid();
  group_id uuid; backup_id uuid; legacy_id uuid; secondary_id uuid; old_updated_at timestamptz;
  old_reported_at timestamptz; old_revision integer; affected integer; rejected boolean; payload jsonb; result jsonb;
begin
  insert into public.equipment_floor_master(id,name,sort_order) values(floor_id,'__review_floor',0);
  insert into public.company_master(primary_company,secondary_company) values('__review_A','__review_B') returning id into secondary_id;
  payload := jsonb_build_array(jsonb_build_object('work_date','2026-10-01','primary_company','__review_A',
    'primary_count',1,'work_area','1F','work_content','original','uses_aerial_work_vehicle',true,'uses_fire',false,'uses_tachiuma',false));
  result := public.save_schedule_atomically(payload,'[{"secondary_company":"__review_B","worker_count":2}]',
    jsonb_build_array(jsonb_build_object('equipment_type','aerial_work_vehicle','floor_id',floor_id,'requested_count',1)),false,false,null);
  group_id := (result->'savedIds'->>0)::uuid;
  insert into public.new_entrant_records(entry_date,primary_company,secondary_company,person_count,person_names)
    values('2026-10-01','__review_A','__review_B',1,'test');
  insert into public.work_completion_reports(work_date,primary_company,notes)
    values('2026-10-01','__review_A','original') returning reported_at,revision into old_reported_at,old_revision;
  insert into public.aerial_work_vehicles(id,vehicle_number,floor_id,assigned_company) values(vehicle_uuid,'__review_vehicle',floor_id,'__review_A');
  insert into public.tachiuma_units(id,name,floor_id) values(unit_id,'__review_unit',floor_id);
  insert into public.equipment_movements(equipment_type,action,vehicle_id,to_floor_id,quantity,to_company,work_date)
    values('aerial_work_vehicle','assign_vehicle',vehicle_uuid,floor_id,1,'__review_A','2026-09-01');

  -- The complete backup restores units and reports despite restrictive floor FKs.
  backup_id := public.create_data_backup();
  if not (select backup.payload ?& array['tachiuma_units','work_completion_reports'] from public.data_backups backup where id=backup_id) then
    raise exception 'Backup omits operational tables';
  end if;
  delete from public.tachiuma_units where id=unit_id;
  delete from public.work_completion_reports where primary_company='__review_A';
  perform public.restore_data_backup(backup_id);
  if not exists(select 1 from public.tachiuma_units where id=unit_id)
    or not exists(select 1 from public.work_completion_reports where primary_company='__review_A') then raise exception 'Restore lost data'; end if;

  -- Old files lack these sections; keep the current units/reports and their floors.
  insert into public.data_backups(source,schema_version,row_counts,payload)
    select 'manual',5,backup.row_counts,backup.payload-'tachiuma_units'-'work_completion_reports' from public.data_backups backup where id=backup_id returning id into legacy_id;
  perform public.restore_data_backup(legacy_id);
  if not exists(select 1 from public.tachiuma_units where id=unit_id)
    or not exists(select 1 from public.work_completion_reports where primary_company='__review_A') then raise exception 'Legacy restore removed absent sections'; end if;

  perform public.update_company_master_atomically(null,'__review_A','__review_C',null,array['role']);
  if not exists(select 1 from public.schedule_groups where id=group_id and primary_company='__review_C')
    or not exists(select 1 from public.new_entrant_records where primary_company='__review_C')
    or not exists(select 1 from public.work_completion_reports where primary_company='__review_C')
    or not exists(select 1 from public.aerial_work_vehicles where id=vehicle_uuid and assigned_company='__review_C')
    or not exists(select 1 from public.equipment_movements where vehicle_id=vehicle_uuid and to_company='__review_C') then raise exception 'Primary rename left old references'; end if;
  perform public.update_company_master_atomically(secondary_id,null,'__review_C','__review_D',null);
  if not exists(select 1 from public.schedule_subcompanies where schedule_group_id=group_id and secondary_company='__review_D')
    or not exists(select 1 from public.new_entrant_records where primary_company='__review_C' and secondary_company='__review_D') then raise exception 'Secondary rename left old references'; end if;
  insert into public.company_master(primary_company) values('__review_conflict');
  rejected := false;
  begin
    perform public.update_company_master_atomically(null,'__review_C','__review_conflict',null,array['role']);
  exception when unique_violation then rejected := true;
  end;
  if not rejected or not exists(select 1 from public.schedule_groups where id=group_id and primary_company='__review_C') then raise exception 'Rename collision was not atomic'; end if;

  -- Two editors loaded the same report: only the first notes update can succeed.
  select revision into old_revision from public.work_completion_reports where primary_company='__review_C';
  update public.work_completion_reports set notes='first editor' where primary_company='__review_C' and reported_at=old_reported_at and revision=old_revision;
  update public.work_completion_reports set notes='stale editor' where primary_company='__review_C' and reported_at=old_reported_at and revision=old_revision;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Stale report edit succeeded'; end if;

  select updated_at,jsonb_build_array(to_jsonb(grp)) into old_updated_at,payload from public.schedule_groups grp where id=group_id;
  perform public.save_schedule_with_revision(payload,'[]','[]',true,false,group_id,old_updated_at);
  rejected := false;
  begin
    perform public.save_schedule_with_revision(payload,'[]','[]',true,false,group_id,old_updated_at);
  exception when raise_exception then
    if sqlerrm <> 'SCHEDULE_CHANGED' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Stale schedule edit succeeded'; end if;

  -- More than 1,000 unrelated moves must not hide an idle vehicle's assignment.
  insert into public.schedule_equipment_requests(schedule_group_id,equipment_type,floor_id,requested_count,sort_order)
    values(group_id,'aerial_work_vehicle',floor_id,1,0);
  insert into public.equipment_movements(equipment_type,action,to_floor_id,quantity,work_date)
    select 'tachiuma','test',floor_id,1,'2026-09-30' from generate_series(1,1100);
  if not exists(select 1 from public.get_equipment_assignment_history('2026-10-01') history
    where history.vehicle_id=vehicle_uuid and history.to_company='__review_C') then raise exception 'Long-idle vehicle history was lost'; end if;
end $$;
rollback;
