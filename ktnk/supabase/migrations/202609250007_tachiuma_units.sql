begin;

create table if not exists public.tachiuma_units (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 50),
  notes text check (notes is null or char_length(notes) <= 500),
  floor_id uuid not null references public.equipment_floor_master(id) on delete restrict,
  sort_order integer not null default 0,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.tachiuma_units enable row level security;
revoke all on public.tachiuma_units from anon, authenticated;
grant all on public.tachiuma_units to service_role;

insert into public.tachiuma_units(name,notes,floor_id,sort_order)
select '立ち馬 ' || generated.number, stock.notes, stock.floor_id,
  row_number() over(order by floor.sort_order, generated.number)-1
from public.tachiuma_floor_stocks stock
join public.equipment_floor_master floor on floor.id=stock.floor_id
cross join lateral generate_series(1,stock.quantity) generated(number)
where not exists(select 1 from public.tachiuma_units);

create or replace function public.save_tachiuma_unit(p_unit uuid,p_name text,p_notes text,p_floor uuid,p_expected timestamptz)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare item public.tachiuma_units; saved_id uuid; clean_notes text:=nullif(btrim(p_notes),'');
begin
  perform pg_advisory_xact_lock(250925001);
  if btrim(coalesce(p_name,''))='' or char_length(btrim(p_name))>50 then raise exception '名称を確認してください。'; end if;
  if char_length(coalesce(clean_notes,''))>500 then raise exception '備考は500文字以内で入力してください。'; end if;
  if not exists(select 1 from public.equipment_floor_master where id=p_floor) then raise exception 'フロアが存在しません。'; end if;
  if p_unit is null then
    insert into public.tachiuma_units(name,notes,floor_id,sort_order) values(btrim(p_name),clean_notes,p_floor,coalesce((select max(sort_order)+1 from public.tachiuma_units),0)) returning id into saved_id;
  else
    select * into item from public.tachiuma_units where id=p_unit for update;
    if item.id is null or item.updated_at is distinct from p_expected then raise exception '立ち馬情報が変更されています。更新して再度操作してください。'; end if;
    update public.tachiuma_units set name=btrim(p_name),notes=clean_notes,floor_id=p_floor,updated_at=clock_timestamp() where id=p_unit returning id into saved_id;
  end if;
  return saved_id;
end $$;
create or replace function public.delete_tachiuma_unit(p_unit uuid,p_expected timestamptz) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare item public.tachiuma_units;
begin
  select * into item from public.tachiuma_units where id=p_unit for update;
  if item.id is null or item.updated_at is distinct from p_expected then raise exception '立ち馬情報が変更されています。更新して再度操作してください。'; end if;
  delete from public.tachiuma_units where id=p_unit;
end $$;
create or replace function public.reorder_tachiuma_units(p_ids uuid[]) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if cardinality(p_ids) is distinct from (select count(*) from public.tachiuma_units) or cardinality(p_ids) is distinct from (select count(distinct id) from unnest(p_ids) item(id)) then raise exception '立ち馬一覧が変更されています。'; end if;
  update public.tachiuma_units unit set sort_order=ordered.position,updated_at=clock_timestamp() from (select id,ordinality-1 position from unnest(p_ids) with ordinality item(id,ordinality)) ordered where ordered.id=unit.id;
end $$;
revoke all on function public.save_tachiuma_unit(uuid,text,text,uuid,timestamptz), public.delete_tachiuma_unit(uuid,timestamptz), public.reorder_tachiuma_units(uuid[]) from public,anon,authenticated;
grant execute on function public.save_tachiuma_unit(uuid,text,text,uuid,timestamptz), public.delete_tachiuma_unit(uuid,timestamptz), public.reorder_tachiuma_units(uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
