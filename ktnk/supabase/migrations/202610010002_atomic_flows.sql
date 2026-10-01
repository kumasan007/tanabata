begin;

-- Single-site writes share a short transaction lock with company renames/restores.
-- Keep the original payload implementation private to the validated wrapper.
do $$ begin
  if to_regprocedure('public.save_schedule_payload(jsonb,jsonb,jsonb,boolean,boolean,uuid)') is null then
    alter function public.save_schedule_atomically(jsonb,jsonb,jsonb,boolean,boolean,uuid) rename to save_schedule_payload;
  end if;
end $$;
create or replace function public.save_schedule_atomically(
  p_groups jsonb,p_subcompanies jsonb,p_equipment_requests jsonb,
  p_overwrite boolean default false,p_skip_existing boolean default false,p_expected_id uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare primary_name text := p_groups->0->>'primary_company';
begin
  perform pg_advisory_xact_lock(250925001);
  if not exists(select 1 from public.company_master where primary_company=primary_name) then raise exception 'COMPANY_NOT_FOUND'; end if;
  if exists(select 1 from jsonb_array_elements(p_subcompanies) sub
    where coalesce(btrim(sub->>'secondary_company'),'')<>'' and not exists(
      select 1 from public.company_master where primary_company=primary_name and secondary_company=sub->>'secondary_company')) then
    raise exception 'SECONDARY_COMPANY_CHANGED';
  end if;
  return public.save_schedule_payload(p_groups,p_subcompanies,p_equipment_requests,p_overwrite,p_skip_existing,p_expected_id);
end $$;
create or replace function public.save_schedule_with_revision(
  p_groups jsonb,p_subcompanies jsonb,p_equipment_requests jsonb,p_overwrite boolean,p_skip_existing boolean,
  p_expected_id uuid,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_row public.schedule_groups;
begin
  if p_expected_id is null or p_expected_updated_at is null or jsonb_array_length(p_groups)<>1 then raise exception 'Invalid schedule revision'; end if;
  perform pg_advisory_xact_lock(250925001);
  select * into current_row from public.schedule_groups where id=p_expected_id for update;
  if current_row.id is null or current_row.updated_at is distinct from p_expected_updated_at then raise exception 'SCHEDULE_CHANGED'; end if;
  return public.save_schedule_atomically(p_groups,p_subcompanies,p_equipment_requests,p_overwrite,p_skip_existing,p_expected_id);
end $$;

create or replace function public.ensure_secondary_companies(p_primary text,p_secondaries text[])
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare first_row public.company_master; next_order integer; company_name text;
begin
  perform pg_advisory_xact_lock(250925001);
  select * into first_row from public.company_master where primary_company=p_primary order by sort_order,id limit 1;
  if first_row.id is null then return false; end if;
  select coalesce(max(sort_order),-1)+1 into next_order from public.company_master;
  for company_name in select distinct btrim(name) from unnest(p_secondaries) names(name) where coalesce(btrim(name),'')<>'' order by 1 loop
    insert into public.company_master(primary_company,secondary_company,primary_trade_roles,sort_order)
      values(p_primary,company_name,first_row.primary_trade_roles,next_order) on conflict do nothing;
    next_order:=next_order+1;
  end loop;
  return true;
end $$;

create or replace function public.reorder_company_master(p_ids uuid[])
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(250925001);
  lock table public.company_master in share row exclusive mode;
  if cardinality(p_ids) is distinct from (select count(*) from public.company_master)
    or cardinality(p_ids) is distinct from (select count(distinct id) from unnest(p_ids) items(id))
    or exists(select 1 from unnest(p_ids) items(id) where not exists(select 1 from public.company_master master where master.id=items.id)) then
    raise exception 'COMPANY_LIST_CHANGED';
  end if;
  update public.company_master master set sort_order=ordered.position
    from (select id,ordinality-1 position from unnest(p_ids) with ordinality items(id,ordinality)) ordered
    where master.id=ordered.id and master.sort_order is distinct from ordered.position;
end $$;

create or replace function public.delete_operational_record(p_table text,p_id uuid,p_expected_updated_at timestamptz)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_row jsonb;
begin
  if p_table not in ('schedule_groups','new_entrant_records') or p_expected_updated_at is null then raise exception 'Invalid record'; end if;
  perform pg_advisory_xact_lock(250925001);
  execute format('select to_jsonb(row) from public.%I row where id=$1 for update',p_table) into current_row using p_id;
  if current_row is null then return false; end if;
  if (current_row->>'updated_at')::timestamptz is distinct from p_expected_updated_at then raise exception 'OPERATION_CHANGED'; end if;
  execute format('delete from public.%I where id=$1',p_table) using p_id;
  return true;
end $$;

create or replace function public.move_schedule_with_revision(p_id uuid,p_original_date date,p_date date,p_expected_updated_at timestamptz)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_row public.schedule_groups;
begin
  perform pg_advisory_xact_lock(250925001);
  select * into current_row from public.schedule_groups where id=p_id for update;
  if current_row.id is null or current_row.work_date is distinct from p_original_date
    or current_row.updated_at is distinct from p_expected_updated_at or p_expected_updated_at is null then raise exception 'OPERATION_CHANGED'; end if;
  if p_date is null or extract(dow from p_date)=0 then raise exception 'Invalid date'; end if;
  update public.schedule_groups set work_date=p_date where id=p_id;
end $$;

-- The version check happens before adding any new company. Company registration
-- and entrant writes either both commit or both roll back.
create or replace function public.save_new_entrants_atomically(
  p_date date,p_primary text,p_people jsonb,p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare person jsonb; entry_id uuid; current_row public.new_entrant_records; saved_row public.new_entrant_records;
  records jsonb:='[]'; secondaries text[];
begin
  if p_date is null or extract(dow from p_date)=0 or jsonb_typeof(p_people) is distinct from 'array'
    or jsonb_array_length(p_people) not between 1 and 200 then raise exception 'Invalid entrant payload'; end if;
  perform pg_advisory_xact_lock(250925001);
  if p_expected_updated_at is not null then
    if jsonb_array_length(p_people)<>1 then raise exception 'Invalid entrant revision'; end if;
    select * into current_row from public.new_entrant_records where id=(p_people->0->>'id')::uuid for update;
    if current_row.id is null or current_row.updated_at is distinct from p_expected_updated_at then raise exception 'ENTRY_CHANGED'; end if;
    if current_row.person_count<>1 then raise exception 'LEGACY_ENTRY'; end if;
  end if;
  if not exists(select 1 from public.company_master where primary_company=p_primary) then raise exception 'COMPANY_NOT_FOUND'; end if;
  if exists(select 1 from jsonb_array_elements(p_people) item where coalesce(item->>'secondaryCompany','')<>''
    and not coalesce((item->>'registerSecondaryCompany')::boolean,false)
    and not exists(select 1 from public.company_master where primary_company=p_primary and secondary_company=item->>'secondaryCompany')) then
    raise exception 'SECONDARY_COMPANY_CHANGED';
  end if;
  select array_agg(person_item->>'secondaryCompany') into secondaries from jsonb_array_elements(p_people) person_item
    where coalesce((person_item->>'registerSecondaryCompany')::boolean,false);
  if not public.ensure_secondary_companies(p_primary,secondaries) then raise exception 'COMPANY_NOT_FOUND'; end if;
  for person in select value from jsonb_array_elements(p_people) loop
    if coalesce(btrim(person->>'personName'),'')='' or coalesce(person->>'nationalityStatus','') not in ('japanese_only','includes_foreign') then raise exception 'Invalid entrant'; end if;
    entry_id:=coalesce((person->>'id')::uuid,gen_random_uuid());
    if p_expected_updated_at is not null then
      update public.new_entrant_records set entry_date=p_date,primary_company=p_primary,
        secondary_company=coalesce(person->>'secondaryCompany',''),person_names=person->>'personName',
        nationality_status=person->>'nationalityStatus',notes=nullif(person->>'notes','') where id=entry_id returning * into saved_row;
    else
      insert into public.new_entrant_records(id,entry_date,primary_company,secondary_company,person_count,person_names,nationality_status,notes)
        values(entry_id,p_date,p_primary,coalesce(person->>'secondaryCompany',''),1,person->>'personName',person->>'nationalityStatus',nullif(person->>'notes',''))
        on conflict(id) do nothing returning * into saved_row;
      if saved_row.id is null then
        select * into saved_row from public.new_entrant_records where id=entry_id;
        if saved_row.entry_date is distinct from p_date or saved_row.primary_company is distinct from p_primary
          or saved_row.secondary_company is distinct from coalesce(person->>'secondaryCompany','')
          or saved_row.person_names is distinct from person->>'personName'
          or saved_row.nationality_status is distinct from person->>'nationalityStatus'
          or coalesce(saved_row.notes,'') is distinct from coalesce(person->>'notes','') then raise exception 'ENTRY_CHANGED'; end if;
      end if;
    end if;
    records:=records||jsonb_build_array(to_jsonb(saved_row));
  end loop;
  return jsonb_build_object('records',records);
end $$;

revoke all on function public.save_schedule_atomically(jsonb,jsonb,boolean,boolean,uuid),
  public.save_schedule_atomically(jsonb,jsonb,jsonb,boolean,boolean,uuid),
  public.save_schedule_payload(jsonb,jsonb,jsonb,boolean,boolean,uuid),public.ensure_secondary_companies(text,text[]),
  public.reorder_company_master(uuid[]),public.delete_operational_record(text,uuid,timestamptz),
  public.move_schedule_with_revision(uuid,date,date,timestamptz),public.save_new_entrants_atomically(date,text,jsonb,timestamptz)
  from public,anon,authenticated;
grant execute on function public.save_schedule_atomically(jsonb,jsonb,jsonb,boolean,boolean,uuid),
  public.save_schedule_payload(jsonb,jsonb,jsonb,boolean,boolean,uuid),public.ensure_secondary_companies(text,text[]),
  public.reorder_company_master(uuid[]),public.delete_operational_record(text,uuid,timestamptz),
  public.move_schedule_with_revision(uuid,date,date,timestamptz),public.save_new_entrants_atomically(date,text,jsonb,timestamptz)
  to service_role;

create or replace function public.restore_data_backup(p_backup_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare backup_payload jsonb; normalized_groups jsonb; restored_counts jsonb; target text; floor_row record; candidate text; suffix integer;
begin
  select payload into backup_payload from public.data_backups where id = p_backup_id;
  if backup_payload is null then raise exception 'Backup not found'; end if;
  foreach target in array array['company_master','schedule_groups','schedule_subcompanies','new_entrant_records'] loop
    if jsonb_typeof(backup_payload->target) is distinct from 'array' then raise exception 'Invalid backup: %', target; end if;
  end loop;
  foreach target in array array['equipment_floor_master','schedule_equipment_requests','work_completion_reports',
    'aerial_work_vehicles','tachiuma_floor_stocks','tachiuma_units','equipment_movements'] loop
    if backup_payload ? target and jsonb_typeof(backup_payload->target) is distinct from 'array' then raise exception 'Invalid backup: %', target; end if;
  end loop;
  perform pg_advisory_xact_lock(250925001);
  select coalesce(jsonb_agg((item - 'aerial_work_vehicle_count' - 'aerial_work_vehicle_floor') || jsonb_build_object(
    'updated_at', clock_timestamp(),
    'uses_aerial_work_vehicle', coalesce((item->>'uses_aerial_work_vehicle')::boolean, coalesce((item->>'aerial_work_vehicle_count')::integer,0)>0),
    'aerial_work_vehicle_notes', coalesce(item->>'aerial_work_vehicle_notes', item->>'aerial_work_vehicle_floor')
  )), '[]'::jsonb) into normalized_groups from jsonb_array_elements(backup_payload->'schedule_groups') item;
  backup_payload := jsonb_set(backup_payload, '{schedule_groups}', normalized_groups);
  select coalesce(jsonb_agg(item || jsonb_build_object('updated_at', clock_timestamp())), '[]'::jsonb)
    into normalized_groups from jsonb_array_elements(backup_payload->'new_entrant_records') item;
  backup_payload := jsonb_set(backup_payload, '{new_entrant_records}', normalized_groups);
  if backup_payload ? 'work_completion_reports' then
    select coalesce(jsonb_agg(item || jsonb_build_object('revision', greatest(coalesce((item->>'revision')::integer,1),coalesce((select revision from public.work_completion_reports where id=(item->>'id')::uuid),0))+1)), '[]'::jsonb)
      into normalized_groups from jsonb_array_elements(backup_payload->'work_completion_reports') item;
    backup_payload := jsonb_set(backup_payload, '{work_completion_reports}', normalized_groups);
  end if;
  perform set_config('app.skip_audit','on',true);
  -- Delete dependent equipment before floors. Missing legacy sections are preserved.
  foreach target in array array['equipment_movements','aerial_work_vehicles','tachiuma_floor_stocks','tachiuma_units','work_completion_reports'] loop
    if backup_payload ? target then execute format('delete from public.%I', target); end if;
  end loop;
  delete from public.schedule_equipment_requests;
  delete from public.schedule_subcompanies;
  delete from public.schedule_groups;
  delete from public.new_entrant_records;
  delete from public.company_master;
  if backup_payload ?& array['equipment_floor_master','aerial_work_vehicles','tachiuma_floor_stocks','tachiuma_units','equipment_movements'] then
    delete from public.equipment_floor_master;
  end if;
  -- Legacy backups preserve floors referenced by omitted equipment sections.
  -- Free conflicting names before restoring identities, including name swaps.
  if backup_payload ? 'equipment_floor_master' then
    for floor_row in select floor.id from public.equipment_floor_master floor
      join jsonb_array_elements(backup_payload->'equipment_floor_master') item on floor.id=(item->>'id')::uuid
      where floor.name is distinct from item->>'name' loop
      loop
        candidate := '_restore_' || substr(replace(gen_random_uuid()::text,'-',''),1,20);
        exit when not exists(select 1 from public.equipment_floor_master where name=candidate)
          and not exists(select 1 from jsonb_array_elements(backup_payload->'equipment_floor_master') item where item->>'name'=candidate);
      end loop;
      update public.equipment_floor_master set name=candidate where id=floor_row.id;
    end loop;
    for floor_row in select floor.id,floor.name from public.equipment_floor_master floor
      where not exists(select 1 from jsonb_array_elements(backup_payload->'equipment_floor_master') item where (item->>'id')::uuid=floor.id)
        and exists(select 1 from jsonb_array_elements(backup_payload->'equipment_floor_master') item where item->>'name'=floor.name) loop
      suffix:=0;
      loop
        candidate:=left(floor_row.name,15)||'（復元前'||case when suffix=0 then '' else suffix::text end||'）';
        exit when not exists(select 1 from public.equipment_floor_master where name=candidate)
          and not exists(select 1 from jsonb_array_elements(backup_payload->'equipment_floor_master') item where item->>'name'=candidate);
        suffix:=suffix+1;
      end loop;
      update public.equipment_floor_master set name=candidate where id=floor_row.id;
    end loop;
  end if;
  foreach target in array array['company_master','equipment_floor_master','schedule_groups','schedule_subcompanies',
    'schedule_equipment_requests','new_entrant_records','work_completion_reports','aerial_work_vehicles',
    'tachiuma_floor_stocks','tachiuma_units','equipment_movements'] loop
    if backup_payload ? target then
      if target = 'equipment_floor_master' then
        insert into public.equipment_floor_master select * from jsonb_populate_recordset(null::public.equipment_floor_master, backup_payload->target)
          on conflict(id) do update set name = excluded.name, sort_order = excluded.sort_order;
      else
        execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', target, target)
          using backup_payload->target;
      end if;
    end if;
  end loop;
  select jsonb_object_agg(key, jsonb_array_length(value)) into restored_counts from jsonb_each(backup_payload)
    where jsonb_typeof(value) = 'array';
  return restored_counts;
end $$;

notify pgrst,'reload schema';
commit;
