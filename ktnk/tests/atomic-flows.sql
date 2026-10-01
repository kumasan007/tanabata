-- Isolated database only. Every fixture rolls back.
begin;
do $$
declare company_id uuid; entrant_id uuid:=gen_random_uuid(); group_id uuid; old_version timestamptz;
  other_id uuid; ids uuid[]; rejected boolean; payload jsonb; result jsonb;
  floor_id uuid:=gen_random_uuid(); retained_floor_id uuid:=gen_random_uuid(); unit_id uuid:=gen_random_uuid();
  backup_id uuid; legacy_id uuid;
begin
  insert into public.company_master(primary_company,secondary_company) values('__atomic_A','__atomic_B') returning id into company_id;
  -- A pre-existing secondary never prevents other names in the same request.
  perform public.ensure_secondary_companies('__atomic_A',array['__atomic_B','__atomic_C','__atomic_D']);
  if (select count(*) from public.company_master where primary_company='__atomic_A')<>3 then raise exception 'Partial company registration'; end if;
  payload:=jsonb_build_array(jsonb_build_object('id',entrant_id,'secondaryCompany','__atomic_B','personName','person','nationalityStatus','japanese_only','notes',''));
  result:=public.save_new_entrants_atomically('2026-10-01','__atomic_A',payload,null);
  perform public.save_new_entrants_atomically('2026-10-01','__atomic_A',payload,null);
  if (select count(*) from public.new_entrant_records where id=entrant_id)<>1 then raise exception 'Retry duplicated entrant'; end if;
  select updated_at into old_version from public.new_entrant_records where id=entrant_id;
  perform public.update_company_master_atomically(company_id,null,'__atomic_A','__atomic_renamed',null);
  rejected:=false;
  begin
    perform public.save_new_entrants_atomically('2026-10-01','__atomic_A',payload,old_version);
  exception when raise_exception then
    if sqlerrm<>'ENTRY_CHANGED' then raise; end if; rejected:=true;
  end;
  if not rejected or exists(select 1 from public.company_master where secondary_company='__atomic_B')
    or not exists(select 1 from public.new_entrant_records where id=entrant_id and secondary_company='__atomic_renamed') then raise exception 'Stale entrant recreated company'; end if;
  rejected:=false;
  begin
    perform public.save_new_entrants_atomically('2026-10-01','__atomic_A',jsonb_set(payload,'{0,id}',to_jsonb(gen_random_uuid())),null);
  exception when raise_exception then if sqlerrm<>'SECONDARY_COMPANY_CHANGED' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Stale dropdown recreated renamed secondary'; end if;
  rejected:=false;
  begin
    perform public.save_new_entrants_atomically('2026-10-01','__atomic_A',jsonb_build_array(
      jsonb_build_object('secondaryCompany','__atomic_rollback','registerSecondaryCompany',true,'personName','valid','nationalityStatus','japanese_only'),
      jsonb_build_object('secondaryCompany','__atomic_rollback','registerSecondaryCompany',true,'personName','','nationalityStatus','japanese_only')),null);
  exception when raise_exception then if sqlerrm<>'Invalid entrant' then raise; end if; rejected:=true; end;
  if not rejected or exists(select 1 from public.company_master where secondary_company='__atomic_rollback')
    or exists(select 1 from public.new_entrant_records where person_names='valid') then raise exception 'Entrant failure left partial data'; end if;
  rejected:=false;
  begin perform public.delete_operational_record('new_entrant_records',entrant_id,old_version);
  exception when raise_exception then if sqlerrm<>'OPERATION_CHANGED' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Stale entrant deleted'; end if;

  payload:=jsonb_build_array(jsonb_build_object('work_date','2026-10-01','primary_company','__atomic_A','primary_count',1,'work_area','1F','work_content','test','uses_aerial_work_vehicle',false,'uses_fire',false,'uses_tachiuma',false));
  result:=public.save_schedule_atomically(payload,'[]','[]',false,false,null);
  group_id:=(result->'savedIds'->>0)::uuid;
  select updated_at into old_version from public.schedule_groups where id=group_id;
  update public.schedule_groups set notes='changed' where id=group_id;
  rejected:=false;
  begin perform public.delete_operational_record('schedule_groups',group_id,old_version);
  exception when raise_exception then if sqlerrm<>'OPERATION_CHANGED' then raise; end if; rejected:=true; end;
  if not rejected or not exists(select 1 from public.schedule_groups where id=group_id) then raise exception 'Stale schedule deleted'; end if;
  rejected:=false;
  begin perform public.move_schedule_with_revision(group_id,'2026-10-01','2026-10-02',old_version);
  exception when raise_exception then if sqlerrm<>'OPERATION_CHANGED' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Stale schedule moved'; end if;
  select updated_at into old_version from public.schedule_groups where id=group_id;
  perform public.move_schedule_with_revision(group_id,'2026-10-01','2026-10-02',old_version);
  if not exists(select 1 from public.schedule_groups where id=group_id and work_date='2026-10-02' and notes='changed') then raise exception 'Date move lost content'; end if;
  perform public.update_company_master_atomically(null,'__atomic_A','__atomic_new_primary',null,'{}');
  rejected:=false;
  begin perform public.save_schedule_atomically(payload,'[]','[]',false,false,null);
  exception when raise_exception then if sqlerrm<>'COMPANY_NOT_FOUND' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Obsolete primary accepted'; end if;
  payload:=jsonb_set(payload,'{0,primary_company}','"__atomic_new_primary"');
  rejected:=false;
  begin perform public.save_schedule_atomically(payload,'[{"secondary_company":"__atomic_B","worker_count":1}]','[]',false,false,null);
  exception when raise_exception then if sqlerrm<>'SECONDARY_COMPANY_CHANGED' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Obsolete secondary accepted'; end if;

  select array_agg(id order by sort_order desc,id) into ids from public.company_master;
  perform public.reorder_company_master(ids);
  if not exists(select 1 from public.company_master where id=company_id and secondary_company='__atomic_renamed') then raise exception 'Reorder reverted rename'; end if;
  other_id:=ids[1]; delete from public.company_master where id=other_id;
  rejected:=false;
  begin perform public.reorder_company_master(ids);
  exception when raise_exception then if sqlerrm<>'COMPANY_LIST_CHANGED' then raise; end if; rejected:=true; end;
  if not rejected or exists(select 1 from public.company_master where id=other_id) then raise exception 'Reorder resurrected deletion'; end if;

  -- A legacy backup contains floor F1=1F; today F1=2F and F2=1F.
  insert into public.equipment_floor_master(id,name,sort_order) values(floor_id,'__atomic_1F',0);
  backup_id:=public.create_data_backup();
  insert into public.data_backups(source,schema_version,row_counts,payload)
    select 'manual',5,backup.row_counts,backup.payload-'tachiuma_units'-'work_completion_reports' from public.data_backups backup where id=backup_id returning id into legacy_id;
  update public.equipment_floor_master set name='__atomic_2F' where id=floor_id;
  insert into public.equipment_floor_master(id,name,sort_order) values(retained_floor_id,'__atomic_1F',1);
  insert into public.tachiuma_units(id,name,floor_id) values(unit_id,'__atomic_unit',retained_floor_id);
  select updated_at into old_version from public.schedule_groups where id=group_id;
  perform public.restore_data_backup(legacy_id);
  if not exists(select 1 from public.equipment_floor_master where id=floor_id and name='__atomic_1F')
    or not exists(select 1 from public.tachiuma_units unit where unit.id=unit_id and unit.floor_id=retained_floor_id)
    or not exists(select 1 from public.equipment_floor_master where id=retained_floor_id and name like '%復元前%') then raise exception 'Legacy floor collision lost identity'; end if;
  if (select updated_at from public.schedule_groups where id=group_id)=old_version then raise exception 'Restore reused stale editor version'; end if;
end $$;
rollback;
