-- The original atomic-save migration shared a version number with another
-- migration. Recreate it under a unique version and include fire_area so all
-- schedule and equipment fields are committed together for every selected day.
create or replace function public.save_schedule_atomically(
  p_groups jsonb,
  p_subcompanies jsonb,
  p_vehicles jsonb,
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
    or jsonb_typeof(p_subcompanies) is distinct from 'array'
    or jsonb_typeof(p_vehicles) is distinct from 'array' then
    raise exception 'Invalid schedule payload';
  end if;

  primary_name := p_groups->0->>'primary_company';
  if coalesce(btrim(primary_name), '') = ''
    or exists (select 1 from jsonb_array_elements(p_groups) g where g->>'primary_company' is distinct from primary_name)
    or (select count(distinct g->>'work_date') from jsonb_array_elements(p_groups) g) <> jsonb_array_length(p_groups) then
    raise exception 'Invalid schedule company or dates';
  end if;

  for work_day in
    select (g->>'work_date')::date from jsonb_array_elements(p_groups) g order by 1
  loop
    if work_day is null or extract(dow from work_day) = 0 then
      raise exception 'Invalid work date';
    end if;
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
  ) then
    raise exception using message = 'SCHEDULE_NOT_FOUND';
  end if;

  select array_agg(s.work_date order by s.work_date) into conflicts
  from public.schedule_groups s
  where s.primary_company = primary_name
    and s.work_date in (select (g->>'work_date')::date from jsonb_array_elements(p_groups) g);

  if not p_overwrite and conflicts is not null and (
    not p_skip_existing or cardinality(conflicts) = jsonb_array_length(p_groups)
  ) then
    raise exception using message = 'SCHEDULE_ALREADY_EXISTS', detail = to_jsonb(conflicts)::text;
  end if;

  for item in select g from jsonb_array_elements(p_groups) g order by g->>'work_date'
  loop
    work_day := (item->>'work_date')::date;
    if not p_overwrite and p_skip_existing and work_day = any(coalesce(conflicts, '{}'::date[])) then
      continue;
    end if;

    if (item->>'primary_count')::integer is null
      or (item->>'primary_count')::integer < 0
      or coalesce(btrim(item->>'work_area'), '') = ''
      or coalesce(btrim(item->>'work_content'), '') = ''
      or ((item->>'primary_count')::integer = 0 and coalesce((
        select sum((sub->>'worker_count')::integer) from jsonb_array_elements(p_subcompanies) sub
      ), 0) < 1) then
      raise exception 'Invalid schedule fields';
    end if;

    insert into public.schedule_groups (
      work_date, primary_company, primary_count, work_area, work_content,
      aerial_work_vehicle_count, aerial_work_vehicle_floor,
      uses_fire, fire_area, uses_tachiuma, tachiuma_notes, notes
    ) values (
      work_day, primary_name, (item->>'primary_count')::integer,
      item->>'work_area', item->>'work_content',
      (item->>'aerial_work_vehicle_count')::integer,
      item->>'aerial_work_vehicle_floor',
      (item->>'uses_fire')::boolean,
      case when (item->>'uses_fire')::boolean then item->>'fire_area' else null end,
      (item->>'uses_tachiuma')::boolean,
      case when (item->>'uses_tachiuma')::boolean then item->>'tachiuma_notes' else null end,
      item->>'notes'
    ) on conflict (work_date, primary_company) do update set
      primary_count = excluded.primary_count,
      work_area = excluded.work_area,
      work_content = excluded.work_content,
      aerial_work_vehicle_count = excluded.aerial_work_vehicle_count,
      aerial_work_vehicle_floor = excluded.aerial_work_vehicle_floor,
      uses_fire = excluded.uses_fire,
      fire_area = excluded.fire_area,
      uses_tachiuma = excluded.uses_tachiuma,
      tachiuma_notes = excluded.tachiuma_notes,
      notes = excluded.notes
    where p_overwrite
    returning id into group_id;

    if not found then
      raise exception using message = 'SCHEDULE_ALREADY_EXISTS', detail = jsonb_build_array(work_day)::text;
    end if;

    delete from public.schedule_subcompanies where schedule_group_id = group_id;
    delete from public.schedule_aerial_work_vehicles where schedule_group_id = group_id;

    insert into public.schedule_subcompanies (schedule_group_id, secondary_company, worker_count, sort_order)
      select group_id, sub->>'secondary_company', (sub->>'worker_count')::integer, (ordinality - 1)::integer
      from jsonb_array_elements(p_subcompanies) with ordinality as entries(sub, ordinality);

    insert into public.schedule_aerial_work_vehicles (schedule_group_id, work_area, vehicle_count, sort_order)
      select group_id, vehicle->>'work_area', (vehicle->>'vehicle_count')::integer, (ordinality - 1)::integer
      from jsonb_array_elements(p_vehicles) with ordinality as entries(vehicle, ordinality);

    saved_dates := array_append(saved_dates, work_day);
    saved_ids := array_append(saved_ids, group_id);
  end loop;

  return jsonb_build_object('dates', to_jsonb(saved_dates), 'savedIds', to_jsonb(saved_ids));
end;
$$;

revoke all on function public.save_schedule_atomically(jsonb, jsonb, jsonb, boolean, boolean, uuid) from public;
grant execute on function public.save_schedule_atomically(jsonb, jsonb, jsonb, boolean, boolean, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
