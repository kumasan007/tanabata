-- 高所作業車は台数を扱わず、使用有無と使用内容だけを保存する。
alter table public.schedule_groups
  add column if not exists uses_aerial_work_vehicle boolean not null default false,
  add column if not exists aerial_work_vehicle_notes text;

update public.schedule_groups groups
set
  uses_aerial_work_vehicle = coalesce(groups.aerial_work_vehicle_count, 0) > 0
    or exists (
      select 1 from public.schedule_aerial_work_vehicles vehicles
      where vehicles.schedule_group_id = groups.id
    ),
  aerial_work_vehicle_notes = coalesce(
    nullif(btrim(groups.aerial_work_vehicle_floor), ''),
    (
      select string_agg(vehicles.work_area, '、' order by vehicles.sort_order, vehicles.id)
      from public.schedule_aerial_work_vehicles vehicles
      where vehicles.schedule_group_id = groups.id
    )
  );

drop function if exists public.save_schedule_atomically(jsonb, jsonb, jsonb, boolean, boolean, uuid);

create function public.save_schedule_atomically(
  p_groups jsonb,
  p_subcompanies jsonb,
  p_overwrite boolean default false,
  p_skip_existing boolean default false,
  p_expected_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  primary_name text;
  work_day date;
  group_id uuid;
  conflicts date[];
  saved_dates date[] := '{}'::date[];
  saved_ids uuid[] := '{}'::uuid[];
begin
  if jsonb_typeof(p_groups) is distinct from 'array'
    or jsonb_array_length(p_groups) not between 1 and 180
    or jsonb_typeof(p_subcompanies) is distinct from 'array' then
    raise exception 'Invalid schedule payload';
  end if;

  primary_name := p_groups->0->>'primary_company';
  if coalesce(btrim(primary_name), '') = ''
    or exists (select 1 from jsonb_array_elements(p_groups) g where g->>'primary_company' is distinct from primary_name)
    or (select count(distinct g->>'work_date') from jsonb_array_elements(p_groups) g) <> jsonb_array_length(p_groups) then
    raise exception 'Invalid schedule company or dates';
  end if;

  for work_day in select (g->>'work_date')::date from jsonb_array_elements(p_groups) g order by 1 loop
    if work_day is null or extract(dow from work_day) = 0 then raise exception 'Invalid work date'; end if;
    perform pg_advisory_xact_lock(hashtextextended(primary_name || ':' || work_day::text, 0));
  end loop;

  perform 1 from public.schedule_groups
  where primary_company = primary_name
    and work_date in (select (g->>'work_date')::date from jsonb_array_elements(p_groups) g)
  order by work_date for update;

  if p_expected_id is not null and (
    jsonb_array_length(p_groups) <> 1 or not exists (
      select 1 from public.schedule_groups
      where id = p_expected_id and primary_company = primary_name
        and work_date = (p_groups->0->>'work_date')::date
    )
  ) then raise exception using message = 'SCHEDULE_NOT_FOUND'; end if;

  select array_agg(s.work_date order by s.work_date) into conflicts
  from public.schedule_groups s
  where s.primary_company = primary_name
    and s.work_date in (select (g->>'work_date')::date from jsonb_array_elements(p_groups) g);

  if not p_overwrite and conflicts is not null and (
    not p_skip_existing or cardinality(conflicts) = jsonb_array_length(p_groups)
  ) then raise exception using message = 'SCHEDULE_ALREADY_EXISTS', detail = to_jsonb(conflicts)::text; end if;

  for item in select g from jsonb_array_elements(p_groups) g order by g->>'work_date' loop
    work_day := (item->>'work_date')::date;
    if not p_overwrite and p_skip_existing and work_day = any(coalesce(conflicts, '{}'::date[])) then continue; end if;

    if (item->>'primary_count')::integer is null
      or (item->>'primary_count')::integer < 0
      or coalesce(btrim(item->>'work_area'), '') = ''
      or coalesce(btrim(item->>'work_content'), '') = ''
      or (coalesce((item->>'uses_aerial_work_vehicle')::boolean, false)
        and coalesce(btrim(item->>'aerial_work_vehicle_notes'), '') = '')
      or ((item->>'primary_count')::integer = 0 and coalesce((
        select sum((sub->>'worker_count')::integer) from jsonb_array_elements(p_subcompanies) sub
      ), 0) < 1) then
      raise exception 'Invalid schedule fields';
    end if;

    insert into public.schedule_groups (
      work_date, primary_company, primary_count, work_area, work_content,
      uses_aerial_work_vehicle, aerial_work_vehicle_notes,
      uses_fire, fire_area, uses_tachiuma, tachiuma_notes, notes
    ) values (
      work_day, primary_name, (item->>'primary_count')::integer,
      item->>'work_area', item->>'work_content',
      coalesce((item->>'uses_aerial_work_vehicle')::boolean, false),
      case when coalesce((item->>'uses_aerial_work_vehicle')::boolean, false) then item->>'aerial_work_vehicle_notes' else null end,
      (item->>'uses_fire')::boolean,
      case when (item->>'uses_fire')::boolean then item->>'fire_area' else null end,
      (item->>'uses_tachiuma')::boolean,
      case when (item->>'uses_tachiuma')::boolean then item->>'tachiuma_notes' else null end,
      item->>'notes'
    ) on conflict (work_date, primary_company) do update set
      primary_count = excluded.primary_count, work_area = excluded.work_area,
      work_content = excluded.work_content,
      uses_aerial_work_vehicle = excluded.uses_aerial_work_vehicle,
      aerial_work_vehicle_notes = excluded.aerial_work_vehicle_notes,
      uses_fire = excluded.uses_fire, fire_area = excluded.fire_area,
      uses_tachiuma = excluded.uses_tachiuma, tachiuma_notes = excluded.tachiuma_notes,
      notes = excluded.notes
    where p_overwrite
    returning id into group_id;

    if not found then raise exception using message = 'SCHEDULE_ALREADY_EXISTS', detail = jsonb_build_array(work_day)::text; end if;

    delete from public.schedule_subcompanies where schedule_group_id = group_id;
    insert into public.schedule_subcompanies (schedule_group_id, secondary_company, worker_count, sort_order)
      select group_id, sub->>'secondary_company', (sub->>'worker_count')::integer, (ordinality - 1)::integer
      from jsonb_array_elements(p_subcompanies) with ordinality as entries(sub, ordinality);

    saved_dates := array_append(saved_dates, work_day);
    saved_ids := array_append(saved_ids, group_id);
  end loop;
  return jsonb_build_object('dates', to_jsonb(saved_dates), 'savedIds', to_jsonb(saved_ids));
end;
$$;

revoke all on function public.save_schedule_atomically(jsonb, jsonb, boolean, boolean, uuid) from public;
grant execute on function public.save_schedule_atomically(jsonb, jsonb, boolean, boolean, uuid) to anon, authenticated, service_role;

-- 削除する明細テーブルの履歴は復元不能になるため、表示・復元対象からも除外する。
delete from public.audit_logs where table_name = 'schedule_aerial_work_vehicles';
drop table public.schedule_aerial_work_vehicles;
alter table public.schedule_groups
  drop column aerial_work_vehicle_count,
  drop column aerial_work_vehicle_floor;

create or replace function public.create_data_backup(p_source text default 'manual')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare backup_id uuid; backup_payload jsonb; backup_counts jsonb;
begin
  if p_source not in ('automatic', 'manual') then raise exception 'Invalid backup source'; end if;
  backup_payload := jsonb_build_object(
    'company_master', coalesce((select jsonb_agg(to_jsonb(r) order by r.sort_order, r.id) from public.company_master r), '[]'::jsonb),
    'schedule_groups', coalesce((select jsonb_agg(to_jsonb(r) order by r.work_date, r.id) from public.schedule_groups r), '[]'::jsonb),
    'schedule_subcompanies', coalesce((select jsonb_agg(to_jsonb(r) order by r.schedule_group_id, r.sort_order, r.id) from public.schedule_subcompanies r), '[]'::jsonb),
    'new_entrant_records', coalesce((select jsonb_agg(to_jsonb(r) order by r.entry_date, r.id) from public.new_entrant_records r), '[]'::jsonb)
  );
  backup_counts := jsonb_build_object(
    'company_master', jsonb_array_length(backup_payload->'company_master'),
    'schedule_groups', jsonb_array_length(backup_payload->'schedule_groups'),
    'schedule_subcompanies', jsonb_array_length(backup_payload->'schedule_subcompanies'),
    'new_entrant_records', jsonb_array_length(backup_payload->'new_entrant_records')
  );
  insert into public.data_backups (source, schema_version, row_counts, payload)
  values (p_source, 3, backup_counts, backup_payload)
  on conflict (backup_date) where source = 'automatic'
  do update set created_at = now(), schema_version = 3, row_counts = excluded.row_counts, payload = excluded.payload
  returning id into backup_id;
  return backup_id;
end;
$$;

create or replace function public.restore_data_backup(p_backup_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare backup_payload jsonb; normalized_groups jsonb; restored_counts jsonb;
begin
  select payload into backup_payload from public.data_backups where id = p_backup_id;
  if backup_payload is null then raise exception 'Backup not found'; end if;
  select coalesce(jsonb_agg(
    (item - 'aerial_work_vehicle_count' - 'aerial_work_vehicle_floor') || jsonb_build_object(
      'uses_aerial_work_vehicle', coalesce(
        (item->>'uses_aerial_work_vehicle')::boolean,
        coalesce((item->>'aerial_work_vehicle_count')::integer, 0) > 0
          or exists (
            select 1
            from jsonb_array_elements(coalesce(backup_payload->'schedule_aerial_work_vehicles', '[]'::jsonb)) vehicle
            where vehicle->>'schedule_group_id' = item->>'id'
          )
      ),
      'aerial_work_vehicle_notes', coalesce(
        item->>'aerial_work_vehicle_notes',
        item->>'aerial_work_vehicle_floor',
        (
          select string_agg(vehicle->>'work_area', '、' order by (vehicle->>'sort_order')::integer, vehicle->>'id')
          from jsonb_array_elements(coalesce(backup_payload->'schedule_aerial_work_vehicles', '[]'::jsonb)) vehicle
          where vehicle->>'schedule_group_id' = item->>'id'
        )
      )
    )
  ), '[]'::jsonb) into normalized_groups
  from jsonb_array_elements(backup_payload->'schedule_groups') item;

  perform set_config('app.skip_audit', 'on', true);
  delete from public.schedule_subcompanies; delete from public.schedule_groups;
  delete from public.new_entrant_records; delete from public.company_master;
  insert into public.company_master select * from jsonb_populate_recordset(null::public.company_master, backup_payload->'company_master');
  insert into public.schedule_groups select * from jsonb_populate_recordset(null::public.schedule_groups, normalized_groups);
  insert into public.schedule_subcompanies select * from jsonb_populate_recordset(null::public.schedule_subcompanies, backup_payload->'schedule_subcompanies');
  insert into public.new_entrant_records select * from jsonb_populate_recordset(null::public.new_entrant_records, backup_payload->'new_entrant_records');
  restored_counts := jsonb_build_object(
    'company_master', jsonb_array_length(backup_payload->'company_master'),
    'schedule_groups', jsonb_array_length(normalized_groups),
    'schedule_subcompanies', jsonb_array_length(backup_payload->'schedule_subcompanies'),
    'new_entrant_records', jsonb_array_length(backup_payload->'new_entrant_records')
  );
  return restored_counts;
end;
$$;

notify pgrst, 'reload schema';
