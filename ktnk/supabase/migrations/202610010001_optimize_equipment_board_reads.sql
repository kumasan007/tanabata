begin;

-- Latest dated override, including an explicit blank assignment.
create index if not exists equipment_movements_vehicle_date_idx
  on public.equipment_movements (vehicle_id, work_date desc, moved_at desc, id desc)
  include (to_floor_id, to_company)
  where work_date is not null;

-- Seek the last assignment for each currently requested company without scanning history.
create index if not exists equipment_movements_vehicle_company_date_idx
  on public.equipment_movements (vehicle_id, to_floor_id, to_company, work_date desc, moved_at desc, id desc)
  where work_date is not null and to_company is not null;

-- A single snapshot avoids five HTTP queries and API row-limit truncation.
-- Return at most two history rows per vehicle; capacity allocation stays in the shared resolver.
create or replace function public.get_equipment_board_snapshot(p_date date)
returns jsonb language sql stable security invoker
set search_path = public, pg_temp as $$
  with requests as materialized (
    select r.equipment_type, r.floor_id, sum(r.requested_count)::integer as requested_count,
      s.primary_company as company
    from public.schedule_groups s
    join public.schedule_equipment_requests r on r.schedule_group_id = s.id
    where s.work_date = p_date
    group by r.equipment_type, r.floor_id, s.primary_company
  ), vehicles as materialized (
    select id, vehicle_number, notes, sort_order, floor_id, assigned_company, updated_at
    from public.aerial_work_vehicles
  ), history as (
    select v.id as vehicle_id, h.to_floor_id, h.to_company, h.work_date, h.moved_at, h.source
    from vehicles v
    cross join lateral (
      (select m.to_floor_id, m.to_company, m.work_date, m.moved_at, 0 as source
       from public.equipment_movements m
       where m.vehicle_id = v.id and m.work_date <= p_date
       order by m.work_date desc, m.moved_at desc, m.id desc limit 1)
      union all
      (select previous.to_floor_id, previous.to_company, previous.work_date, previous.moved_at, 1 as source
       from requests r
       cross join lateral (
         select m.to_floor_id, m.to_company, m.work_date, m.moved_at, m.id
         from public.equipment_movements m
         where m.vehicle_id = v.id and m.to_floor_id = v.floor_id
           and m.to_company = r.company and m.to_company is not null and m.work_date <= p_date
         order by m.work_date desc, m.moved_at desc, m.id desc limit 1
       ) previous
       where r.equipment_type = 'aerial_work_vehicle' and r.floor_id = v.floor_id
       order by previous.work_date desc, previous.moved_at desc, previous.id desc limit 1)
    ) h
  )
  select jsonb_build_object(
    'floors', coalesce((select jsonb_agg(to_jsonb(f) order by f.sort_order, f.name, f.id)
      from (select id, name, sort_order from public.equipment_floor_master) f), '[]'::jsonb),
    'vehicles', coalesce((select jsonb_agg(to_jsonb(v) order by v.sort_order, v.vehicle_number, v.id)
      from vehicles v), '[]'::jsonb),
    'tachiumas', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order, t.name, t.id)
      from (select id, name, notes, sort_order, floor_id, updated_at from public.tachiuma_units) t), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.equipment_type, r.floor_id, r.company)
      from requests r), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h) - 'source' order by h.vehicle_id, h.source) from history h), '[]'::jsonb)
  );
$$;

revoke all on function public.get_equipment_board_snapshot(date) from public, anon, authenticated;
grant execute on function public.get_equipment_board_snapshot(date) to service_role;

notify pgrst, 'reload schema';
commit;
