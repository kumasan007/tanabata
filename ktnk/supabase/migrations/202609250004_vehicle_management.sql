begin;

alter table public.aerial_work_vehicles
  add column if not exists notes text,
  add column if not exists sort_order integer not null default 0;
alter table public.aerial_work_vehicles drop constraint if exists aerial_work_vehicles_notes_check;
alter table public.aerial_work_vehicles add constraint aerial_work_vehicles_notes_check
  check (notes is null or char_length(notes) <= 500);

with ordered as (
  select id, row_number() over (order by sort_order, vehicle_number, id) - 1 as position
  from public.aerial_work_vehicles
)
update public.aerial_work_vehicles vehicle set sort_order=ordered.position
from ordered where ordered.id=vehicle.id;

create or replace function public.save_equipment_vehicle(
  p_vehicle uuid, p_number text, p_notes text, p_floor uuid, p_company text, p_expected timestamptz
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.aerial_work_vehicles; saved_id uuid; company_name text := nullif(btrim(p_company), ''); clean_notes text := nullif(btrim(p_notes), '');
begin
  perform pg_advisory_xact_lock(250925001);
  if btrim(coalesce(p_number,''))='' or char_length(btrim(p_number))>30 then raise exception '号車番号を確認してください。'; end if;
  if char_length(coalesce(clean_notes,''))>500 then raise exception '備考は500文字以内で入力してください。'; end if;
  if not exists(select 1 from public.equipment_floor_master where id=p_floor) then raise exception 'フロアが存在しません。'; end if;
  if company_name is not null and not exists(
    select 1 from public.schedule_groups where primary_company=company_name
  ) then raise exception '会社が存在しません。更新して再度選択してください。'; end if;
  if p_vehicle is null then
    insert into public.aerial_work_vehicles(vehicle_number,notes,floor_id,assigned_company,sort_order)
      values(btrim(p_number),clean_notes,p_floor,company_name,coalesce((select max(sort_order)+1 from public.aerial_work_vehicles),0))
      returning id into saved_id;
    insert into public.equipment_movements(equipment_type,action,vehicle_id,vehicle_number,to_floor_id,quantity,to_company)
      values('aerial_work_vehicle','register_vehicle',saved_id,btrim(p_number),p_floor,1,company_name);
  else
    select * into v from public.aerial_work_vehicles where id=p_vehicle for update;
    if v.id is null or v.updated_at is distinct from p_expected then raise exception '号車情報が変更されています。更新して再度操作してください。'; end if;
    update public.aerial_work_vehicles set vehicle_number=btrim(p_number),notes=clean_notes,floor_id=p_floor,
      assigned_company=company_name,updated_at=clock_timestamp() where id=p_vehicle returning id into saved_id;
    insert into public.equipment_movements(equipment_type,action,vehicle_id,vehicle_number,from_floor_id,to_floor_id,quantity,from_company,to_company)
      values('aerial_work_vehicle','update_vehicle',v.id,btrim(p_number),v.floor_id,p_floor,1,v.assigned_company,company_name);
  end if;
  return saved_id;
end $$;
revoke all on function public.save_equipment_vehicle(uuid,text,text,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.save_equipment_vehicle(uuid,text,text,uuid,text,timestamptz) to service_role;

create or replace function public.reorder_equipment_vehicles(p_ids uuid[])
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(250925001);
  if cardinality(p_ids) is distinct from (select count(*) from public.aerial_work_vehicles)
    or cardinality(p_ids) is distinct from (select count(distinct item.id) from unnest(p_ids) item(id))
    or exists(select 1 from unnest(p_ids) item(id) left join public.aerial_work_vehicles v on v.id=item.id where v.id is null)
  then raise exception '号車一覧が変更されています。更新して再度操作してください。'; end if;
  update public.aerial_work_vehicles v set sort_order=ordered.position,updated_at=clock_timestamp()
  from (select id,ordinality-1 as position from unnest(p_ids) with ordinality item(id,ordinality)) ordered where ordered.id=v.id;
end $$;
revoke all on function public.reorder_equipment_vehicles(uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_equipment_vehicles(uuid[]) to service_role;

notify pgrst, 'reload schema';
commit;
