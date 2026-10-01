begin;

-- A second update in one transaction must still change the editor's version.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end $$;

-- A report's original timestamp remains unchanged when its notes are edited.
alter table public.work_completion_reports add column if not exists revision integer not null default 1;
create or replace function public.bump_completion_revision()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.revision := old.revision + 1;
  return new;
end $$;
drop trigger if exists work_completion_reports_revision on public.work_completion_reports;
create trigger work_completion_reports_revision before update on public.work_completion_reports
for each row execute function public.bump_completion_revision();

-- Check the version while holding the same date lock used by ordinary saves.
create or replace function public.save_schedule_with_revision(
  p_groups jsonb, p_subcompanies jsonb, p_equipment_requests jsonb,
  p_overwrite boolean, p_skip_existing boolean, p_expected_id uuid,
  p_expected_updated_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare current_row public.schedule_groups;
begin
  if p_expected_id is null or p_expected_updated_at is null or jsonb_array_length(p_groups) <> 1 then
    raise exception 'Invalid schedule revision';
  end if;
  perform pg_advisory_xact_lock(hashtextextended((p_groups->0->>'primary_company') || ':' || (p_groups->0->>'work_date'), 0));
  select * into current_row from public.schedule_groups where id = p_expected_id for update;
  if current_row.id is null or current_row.updated_at is distinct from p_expected_updated_at then
    raise exception using message = 'SCHEDULE_CHANGED';
  end if;
  return public.save_schedule_atomically(p_groups, p_subcompanies, p_equipment_requests, p_overwrite, p_skip_existing, p_expected_id);
end $$;
revoke all on function public.save_schedule_with_revision(jsonb,jsonb,jsonb,boolean,boolean,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.save_schedule_with_revision(jsonb,jsonb,jsonb,boolean,boolean,uuid,timestamptz) to service_role;

-- Name changes are applied to every live reference in one transaction.
-- Renaming into another existing primary company is rejected, never merged.
create or replace function public.update_company_master_atomically(
  p_id uuid, p_old_primary text, p_primary text, p_secondary text, p_roles text[]
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare item public.company_master; old_primary text; new_primary text := btrim(p_primary);
  new_secondary text := nullif(btrim(p_secondary), '');
begin
  if coalesce(new_primary, '') = '' then raise exception '一次会社を入力してください。'; end if;
  perform pg_advisory_xact_lock(250925001);
  lock table public.company_master in share row exclusive mode;
  if p_id is null then
    old_primary := btrim(p_old_primary);
    if not exists(select 1 from public.company_master where primary_company = old_primary) then return false; end if;
  else
    select * into item from public.company_master where id = p_id for update;
    if item.id is null then return false; end if;
    old_primary := item.primary_company;
    -- The row editor edits secondary names; use the primary-company editor for renames.
    if new_primary <> old_primary then raise exception '一次会社名は一次会社の編集から変更してください。'; end if;
    if exists(select 1 from public.company_master where id <> p_id and primary_company = old_primary
      and coalesce(secondary_company,'') = coalesce(new_secondary,'')) then
      raise exception using errcode = '23505', message = '同じ会社マスタがすでに登録されています。';
    end if;
    update public.schedule_subcompanies sub set secondary_company = new_secondary
      from public.schedule_groups grp where grp.id = sub.schedule_group_id and grp.primary_company = old_primary
        and coalesce(sub.secondary_company,'') = coalesce(item.secondary_company,'');
    -- Invalidate editors that loaded the old secondary-company name.
    update public.schedule_groups grp set updated_at = clock_timestamp()
      where grp.primary_company = old_primary and exists(
        select 1 from public.schedule_subcompanies sub where sub.schedule_group_id = grp.id
          and coalesce(sub.secondary_company,'') = coalesce(new_secondary,''));
    update public.new_entrant_records set secondary_company = coalesce(new_secondary, '')
      where primary_company = old_primary and coalesce(secondary_company,'') = coalesce(item.secondary_company,'');
    update public.company_master set secondary_company = new_secondary where id = p_id;
    return true;
  end if;
  if new_primary <> old_primary then
    if exists(select 1 from public.company_master where primary_company = new_primary)
      or exists(select 1 from public.schedule_groups where primary_company = new_primary)
      or exists(select 1 from public.new_entrant_records where primary_company = new_primary)
      or exists(select 1 from public.work_completion_reports where primary_company = new_primary) then
      raise exception using errcode = '23505', message = '変更先の会社名は既に使われています。';
    end if;
    update public.schedule_groups set primary_company = new_primary where primary_company = old_primary;
    update public.new_entrant_records set primary_company = new_primary where primary_company = old_primary;
    update public.work_completion_reports set primary_company = new_primary where primary_company = old_primary;
    update public.aerial_work_vehicles set assigned_company = new_primary, updated_at = clock_timestamp() where assigned_company = old_primary;
    update public.equipment_movements set
      from_company = case when from_company = old_primary then new_primary else from_company end,
      to_company = case when to_company = old_primary then new_primary else to_company end
      where from_company = old_primary or to_company = old_primary;
  end if;
  update public.company_master set primary_company = new_primary, primary_trade_roles = coalesce(p_roles, '{}')
    where primary_company = old_primary;
  return true;
end $$;
revoke all on function public.update_company_master_atomically(uuid,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.update_company_master_atomically(uuid,text,text,text,text[]) to service_role;

-- Retrieve only the latest movement and the latest relevant assignment per company.
-- Long-idle vehicles must not disappear behind the REST API's row limit.
create index if not exists equipment_movements_vehicle_date_idx
  on public.equipment_movements(vehicle_id, work_date desc, moved_at desc, id) where work_date is not null;
create or replace function public.get_equipment_assignment_history(p_date date)
returns table(id uuid, vehicle_id uuid, to_floor_id uuid, to_company text, work_date date, moved_at timestamptz)
language sql stable security invoker set search_path = public, pg_temp as $$
  select history.id, history.vehicle_id, history.to_floor_id, history.to_company, history.work_date, history.moved_at
  from public.aerial_work_vehicles vehicle
  cross join lateral (
    (select movement.* from public.equipment_movements movement
      where movement.vehicle_id = vehicle.id and movement.work_date <= p_date
      order by movement.work_date desc, movement.moved_at desc, movement.id limit 1)
    union
    (select distinct on (movement.to_company) movement.* from public.equipment_movements movement
      where movement.vehicle_id = vehicle.id and movement.work_date <= p_date and movement.to_floor_id = vehicle.floor_id
        and exists(select 1 from public.schedule_equipment_requests request
          join public.schedule_groups grp on grp.id = request.schedule_group_id
          where grp.work_date = p_date and grp.primary_company = movement.to_company
            and request.floor_id = vehicle.floor_id and request.equipment_type = 'aerial_work_vehicle')
      order by movement.to_company, movement.work_date desc, movement.moved_at desc, movement.id)
  ) history
  order by history.vehicle_id, history.work_date desc, history.moved_at desc, history.id;
$$;
revoke all on function public.get_equipment_assignment_history(date) from public,anon,authenticated;
grant execute on function public.get_equipment_assignment_history(date) to service_role;

create or replace function public.create_data_backup(p_source text default 'manual')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare backup_id uuid; backup_payload jsonb; backup_counts jsonb;
begin
  if p_source not in ('automatic', 'manual') then raise exception 'Invalid backup source'; end if;
  backup_payload := jsonb_build_object(
    'company_master', coalesce((select jsonb_agg(to_jsonb(r)) from public.company_master r), '[]'::jsonb),
    'equipment_floor_master', coalesce((select jsonb_agg(to_jsonb(r)) from public.equipment_floor_master r), '[]'::jsonb),
    'schedule_groups', coalesce((select jsonb_agg(to_jsonb(r)) from public.schedule_groups r), '[]'::jsonb),
    'schedule_subcompanies', coalesce((select jsonb_agg(to_jsonb(r)) from public.schedule_subcompanies r), '[]'::jsonb),
    'schedule_equipment_requests', coalesce((select jsonb_agg(to_jsonb(r)) from public.schedule_equipment_requests r), '[]'::jsonb),
    'new_entrant_records', coalesce((select jsonb_agg(to_jsonb(r)) from public.new_entrant_records r), '[]'::jsonb),
    'work_completion_reports', coalesce((select jsonb_agg(to_jsonb(r)) from public.work_completion_reports r), '[]'::jsonb),
    'aerial_work_vehicles', coalesce((select jsonb_agg(to_jsonb(r)) from public.aerial_work_vehicles r), '[]'::jsonb),
    'tachiuma_floor_stocks', coalesce((select jsonb_agg(to_jsonb(r)) from public.tachiuma_floor_stocks r), '[]'::jsonb),
    'tachiuma_units', coalesce((select jsonb_agg(to_jsonb(r)) from public.tachiuma_units r), '[]'::jsonb),
    'equipment_movements', coalesce((select jsonb_agg(to_jsonb(r)) from public.equipment_movements r), '[]'::jsonb)
  );
  select jsonb_object_agg(key, jsonb_array_length(value)) into backup_counts from jsonb_each(backup_payload);
  insert into public.data_backups(source, schema_version, row_counts, payload) values(p_source, 6, backup_counts, backup_payload)
    on conflict (backup_date) where source = 'automatic' do update
      set created_at = now(), schema_version = 6, row_counts = excluded.row_counts, payload = excluded.payload
    returning id into backup_id;
  return backup_id;
end $$;

create or replace function public.restore_data_backup(p_backup_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare backup_payload jsonb; normalized_groups jsonb; restored_counts jsonb; target text;
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
  select coalesce(jsonb_agg((item - 'aerial_work_vehicle_count' - 'aerial_work_vehicle_floor') || jsonb_build_object(
    'uses_aerial_work_vehicle', coalesce((item->>'uses_aerial_work_vehicle')::boolean, coalesce((item->>'aerial_work_vehicle_count')::integer,0)>0),
    'aerial_work_vehicle_notes', coalesce(item->>'aerial_work_vehicle_notes', item->>'aerial_work_vehicle_floor')
  )), '[]'::jsonb) into normalized_groups from jsonb_array_elements(backup_payload->'schedule_groups') item;
  backup_payload := jsonb_set(backup_payload, '{schedule_groups}', normalized_groups);
  if backup_payload ? 'work_completion_reports' then
    select coalesce(jsonb_agg(item || jsonb_build_object('revision', coalesce((item->>'revision')::integer,1))), '[]'::jsonb)
      into normalized_groups from jsonb_array_elements(backup_payload->'work_completion_reports') item;
    backup_payload := jsonb_set(backup_payload, '{work_completion_reports}', normalized_groups);
  end if;
  perform pg_advisory_xact_lock(250925001);
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
revoke all on function public.create_data_backup(text), public.restore_data_backup(uuid) from public,anon,authenticated;
grant execute on function public.create_data_backup(text), public.restore_data_backup(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
