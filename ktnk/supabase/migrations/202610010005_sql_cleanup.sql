begin;

-- Leftmost columns of the retained compound indexes cover these lookups.
-- Keep all primary keys, unique constraints, and company/date indexes.
drop index if exists public.company_master_primary_idx;
drop index if exists public.schedule_groups_primary_company_idx;
drop index if exists public.schedule_groups_work_date_idx;
drop index if exists public.new_entrant_records_entry_date_idx;

-- Older migrations added a second index for the table's existing unique key.
-- Remove only the standalone duplicate when the constraint index is identical.
do $$
begin
  if exists (
    select 1 from pg_index duplicate
    join pg_index keeper on keeper.indrelid=duplicate.indrelid
      and keeper.indkey=duplicate.indkey and keeper.indclass=duplicate.indclass
      and keeper.indcollation=duplicate.indcollation and keeper.indoption=duplicate.indoption
    join pg_constraint constraint_row on constraint_row.conindid=keeper.indexrelid
      and constraint_row.contype='u'
    where duplicate.indexrelid=to_regclass('public.schedule_groups_work_date_primary_company_idx')
      and keeper.indexrelid<>duplicate.indexrelid
      and duplicate.indisunique and keeper.indisunique and keeper.indisvalid
      and duplicate.indpred is null and keeper.indpred is null
      and duplicate.indexprs is null and keeper.indexprs is null
      and not exists(select 1 from pg_constraint where conindid=duplicate.indexrelid)
  ) then
    drop index public.schedule_groups_work_date_primary_company_idx;
  end if;
end $$;

-- Both callers now use the dated assignment RPC and bounded snapshot RPC.
-- No CASCADE: an unexpected database dependency must stop this migration.
drop function if exists public.assign_equipment_vehicle(uuid,uuid,text,timestamptz);
drop function if exists public.get_equipment_assignment_history(date);

create or replace function public.reorder_equipment_vehicles(p_ids uuid[])
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(250925001);
  lock table public.aerial_work_vehicles in share row exclusive mode;
  if cardinality(p_ids) is distinct from (select count(*) from public.aerial_work_vehicles)
    or cardinality(p_ids) is distinct from (select count(distinct id) from unnest(p_ids) item(id))
    or exists(select 1 from unnest(p_ids) item(id) where not exists(select 1 from public.aerial_work_vehicles where id=item.id)) then
    raise exception '号車一覧が変更されています。更新して再度操作してください。';
  end if;
  update public.aerial_work_vehicles vehicle set sort_order=ordered.position,updated_at=clock_timestamp()
    from (select id,ordinality-1 position from unnest(p_ids) with ordinality item(id,ordinality)) ordered
    where vehicle.id=ordered.id and vehicle.sort_order is distinct from ordered.position;
end $$;

create or replace function public.reorder_tachiuma_units(p_ids uuid[])
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(250925001);
  lock table public.tachiuma_units in share row exclusive mode;
  if cardinality(p_ids) is distinct from (select count(*) from public.tachiuma_units)
    or cardinality(p_ids) is distinct from (select count(distinct id) from unnest(p_ids) item(id))
    or exists(select 1 from unnest(p_ids) item(id) where not exists(select 1 from public.tachiuma_units where id=item.id)) then
    raise exception '立ち馬一覧が変更されています。更新して再度操作してください。';
  end if;
  update public.tachiuma_units unit set sort_order=ordered.position,updated_at=clock_timestamp()
    from (select id,ordinality-1 position from unnest(p_ids) with ordinality item(id,ordinality)) ordered
    where unit.id=ordered.id and unit.sort_order is distinct from ordered.position;
end $$;

revoke all on function public.reorder_equipment_vehicles(uuid[]),public.reorder_tachiuma_units(uuid[]) from public,anon,authenticated;
grant execute on function public.reorder_equipment_vehicles(uuid[]),public.reorder_tachiuma_units(uuid[]) to service_role;

notify pgrst,'reload schema';
commit;
