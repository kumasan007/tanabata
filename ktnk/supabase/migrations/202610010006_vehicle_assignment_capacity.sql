begin;

-- Use the same exact-date / previous-company / legacy priority as the board.
-- Include overflow candidates so a write can explicitly release hidden assignments.
create or replace function public.get_equipment_assignment_candidates(p_snapshot jsonb,p_date date)
returns table(vehicle_id uuid,floor_id uuid,company text,assignment_rank bigint,requested_count integer)
language sql immutable set search_path=public,pg_temp as $$
  with capacities as (
    select r.floor_id,r.company,sum(r.requested_count)::integer requested_count
    from jsonb_to_recordset(p_snapshot->'requests') r(equipment_type text,floor_id uuid,company text,requested_count integer)
    where r.equipment_type='aerial_work_vehicle' group by r.floor_id,r.company
  ), history as (
    select * from jsonb_to_recordset(p_snapshot->'history')
      h(vehicle_id uuid,to_floor_id uuid,to_company text,work_date date,moved_at timestamptz)
    where h.work_date<=p_date
  ), candidates as (
    select v.id,v.floor_id,v.sort_order,v.vehicle_number,chosen.company,
      case when exact.vehicle_id is not null then 0 when previous.to_company is not null then 1 else 2 end priority,
      case when exact.vehicle_id is not null then exact.work_date else previous.work_date end history_date,
      case when exact.vehicle_id is not null then exact.moved_at else previous.moved_at end moved_at
    from jsonb_to_recordset(p_snapshot->'vehicles')
      v(id uuid,floor_id uuid,assigned_company text,sort_order integer,vehicle_number text)
    left join lateral (
      select h.* from history h where h.vehicle_id=v.id and h.work_date=p_date order by h.moved_at desc limit 1
    ) exact on true
    left join lateral (
      select h.* from history h where h.vehicle_id=v.id order by h.work_date desc,h.moved_at desc limit 1
    ) latest on true
    left join lateral (
      select h.* from history h join capacities c on c.floor_id=v.floor_id and c.company=h.to_company
      where h.vehicle_id=v.id and h.to_floor_id=v.floor_id
      order by h.work_date desc,h.moved_at desc limit 1
    ) previous on true
    cross join lateral (
      select case
        when exact.vehicle_id is not null then case when exact.to_floor_id=v.floor_id then exact.to_company end
        when latest.vehicle_id is not null and latest.to_floor_id<>v.floor_id then null
        else coalesce(previous.to_company,v.assigned_company) end company
    ) chosen
  )
  select candidate.id,candidate.floor_id,candidate.company,
    row_number() over(partition by candidate.floor_id,candidate.company order by candidate.priority,
      candidate.history_date desc nulls last,candidate.moved_at desc nulls last,
      candidate.sort_order,candidate.vehicle_number,candidate.id),capacity.requested_count
  from candidates candidate join capacities capacity
    on capacity.floor_id=candidate.floor_id and capacity.company=candidate.company;
$$;
revoke all on function public.get_equipment_assignment_candidates(jsonb,date) from public,anon,authenticated;
grant execute on function public.get_equipment_assignment_candidates(jsonb,date) to service_role;

create or replace function public.assign_equipment_vehicle_for_date(
  p_vehicle uuid,p_floor uuid,p_company text,p_date date,p_expected timestamptz
) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare vehicle public.aerial_work_vehicles; company_name text:=nullif(btrim(p_company),'');
  snapshot jsonb; capacity integer; kept_ids uuid[]:='{}'; released_id uuid;
begin
  if p_date is null then raise exception '日付を確認してください。'; end if;
  perform pg_advisory_xact_lock(250925001);
  lock table public.aerial_work_vehicles in share row exclusive mode;
  select * into vehicle from public.aerial_work_vehicles where id=p_vehicle for update;
  if vehicle.id is null or vehicle.updated_at is distinct from p_expected then
    raise exception '配置・割当が変更されています。更新して再度操作してください。';
  end if;
  if not exists(select 1 from public.equipment_floor_master where id=p_floor) then raise exception 'フロアが存在しません。'; end if;
  snapshot:=public.get_equipment_board_snapshot(p_date);
  if company_name is not null then
    select sum(r.requested_count)::integer into capacity
      from jsonb_to_recordset(snapshot->'requests') r(equipment_type text,floor_id uuid,company text,requested_count integer)
      where r.equipment_type='aerial_work_vehicle' and r.floor_id=p_floor and r.company=company_name;
    if coalesce(capacity,0)<1 then raise exception '選択日のこのフロアでは、その会社は高所作業車を希望していません。'; end if;
    select coalesce(array_agg(kept.vehicle_id),'{}'::uuid[]) into kept_ids from (
      select candidate.vehicle_id from public.get_equipment_assignment_candidates(snapshot,p_date) candidate
      where candidate.floor_id=p_floor and candidate.company=company_name and candidate.vehicle_id<>p_vehicle
        and candidate.assignment_rank<=candidate.requested_count
      order by candidate.assignment_rank limit capacity-1
    ) kept;
  end if;

  -- Release pre-existing overflow and the oldest visible assignment being replaced.
  -- A dated blank prevents either record from reappearing after another vehicle is removed.
  for released_id in
    select candidate.vehicle_id from public.get_equipment_assignment_candidates(snapshot,p_date) candidate
    where candidate.vehicle_id<>p_vehicle and (
      candidate.assignment_rank>candidate.requested_count or
      (candidate.floor_id=p_floor and candidate.company=company_name and not candidate.vehicle_id=any(kept_ids))
    )
  loop
    insert into public.equipment_movements(equipment_type,action,vehicle_id,vehicle_number,from_floor_id,to_floor_id,quantity,from_company,to_company,work_date,moved_at)
      select 'aerial_work_vehicle','assign_vehicle',id,vehicle_number,floor_id,floor_id,1,assigned_company,null,p_date,clock_timestamp()
      from public.aerial_work_vehicles where id=released_id;
    update public.aerial_work_vehicles set assigned_company=null,
      updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=released_id;
  end loop;
  update public.aerial_work_vehicles set floor_id=p_floor,assigned_company=company_name,
    updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=p_vehicle;
  insert into public.equipment_movements(equipment_type,action,vehicle_id,vehicle_number,from_floor_id,to_floor_id,quantity,from_company,to_company,work_date,moved_at)
    values('aerial_work_vehicle','assign_vehicle',vehicle.id,vehicle.vehicle_number,vehicle.floor_id,p_floor,1,vehicle.assigned_company,company_name,p_date,clock_timestamp());
end $$;
revoke all on function public.assign_equipment_vehicle_for_date(uuid,uuid,text,date,timestamptz) from public,anon,authenticated;
grant execute on function public.assign_equipment_vehicle_for_date(uuid,uuid,text,date,timestamptz) to service_role;

-- Editing a vehicle's company uses the same dated capacity rules as drag/drop.
create or replace function public.save_equipment_vehicle_for_date(
  p_vehicle uuid,p_number text,p_notes text,p_floor uuid,p_company text,p_expected timestamptz,p_date date
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved_id uuid; saved_version timestamptz;
begin
  perform pg_advisory_xact_lock(250925001);
  saved_id:=public.save_equipment_vehicle(p_vehicle,p_number,p_notes,p_floor,p_company,p_expected);
  select updated_at into saved_version from public.aerial_work_vehicles where id=saved_id;
  perform public.assign_equipment_vehicle_for_date(saved_id,p_floor,p_company,p_date,saved_version);
  return saved_id;
end $$;
revoke all on function public.save_equipment_vehicle_for_date(uuid,text,text,uuid,text,timestamptz,date) from public,anon,authenticated;
grant execute on function public.save_equipment_vehicle_for_date(uuid,text,text,uuid,text,timestamptz,date) to service_role;

notify pgrst,'reload schema';
commit;
