begin;

-- Preserve every legacy row that used the removed no-work / next-visit flow.
create table if not exists public.schedule_legacy_archive (
  schedule_group_id uuid primary key,
  payload jsonb not null,
  archived_at timestamptz not null default now()
);

alter table public.schedule_legacy_archive enable row level security;

insert into public.schedule_legacy_archive (schedule_group_id, payload)
select
  groups.id,
  jsonb_build_object(
    'schedule_group', to_jsonb(groups),
    'schedule_subcompanies', coalesce((
      select jsonb_agg(to_jsonb(subcompanies) order by subcompanies.sort_order)
      from public.schedule_subcompanies subcompanies
      where subcompanies.schedule_group_id = groups.id
    ), '[]'::jsonb)
  )
from public.schedule_groups groups
where groups.status = 'no_work'
   or groups.next_visit_date is not null
   or groups.next_primary_count is not null
   or groups.next_work_area is not null
   or groups.next_work_content is not null
   or exists (
     select 1
     from public.schedule_subcompanies subcompanies
     where subcompanies.schedule_group_id = groups.id
       and subcompanies.kind = 'next_visit'
   )
on conflict (schedule_group_id) do nothing;

delete from public.schedule_groups where status = 'no_work';
delete from public.schedule_subcompanies where kind = 'next_visit';

alter table public.schedule_groups
  drop constraint if exists schedule_groups_status_check,
  drop column if exists status,
  drop column if exists next_visit_date,
  drop column if exists next_primary_count,
  drop column if exists next_work_area,
  drop column if exists next_work_content;

alter table public.schedule_subcompanies
  drop constraint if exists schedule_subcompanies_kind_check,
  drop column if exists kind;

-- Keep restores of older backup files compatible without reviving removed rows.
create or replace function public.restore_data_backup(p_backup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  backup_payload jsonb;
  restored_counts jsonb;
begin
  select payload into backup_payload
  from public.data_backups
  where id = p_backup_id;

  if backup_payload is null then
    raise exception 'Backup not found';
  end if;

  insert into public.schedule_legacy_archive (schedule_group_id, payload)
  select
    (group_item->>'id')::uuid,
    jsonb_build_object(
      'schedule_group', group_item,
      'schedule_subcompanies', coalesce((
        select jsonb_agg(subcompany_item)
        from jsonb_array_elements(backup_payload->'schedule_subcompanies') subcompany_item
        where subcompany_item->>'schedule_group_id' = group_item->>'id'
      ), '[]'::jsonb)
    )
  from jsonb_array_elements(backup_payload->'schedule_groups') group_item
  where group_item->>'status' = 'no_work'
     or group_item->>'next_visit_date' is not null
     or group_item->>'next_primary_count' is not null
     or group_item->>'next_work_area' is not null
     or group_item->>'next_work_content' is not null
  on conflict (schedule_group_id) do nothing;

  delete from public.schedule_subcompanies;
  delete from public.schedule_groups;
  delete from public.new_entrant_records;
  delete from public.company_master;

  insert into public.company_master
  select * from jsonb_populate_recordset(null::public.company_master, backup_payload->'company_master');

  insert into public.schedule_groups
  select * from jsonb_populate_recordset(
    null::public.schedule_groups,
    coalesce((
      select jsonb_agg(group_item - array['status', 'next_visit_date', 'next_primary_count', 'next_work_area', 'next_work_content'])
      from jsonb_array_elements(backup_payload->'schedule_groups') group_item
      where coalesce(group_item->>'status', 'work') = 'work'
    ), '[]'::jsonb)
  );

  insert into public.schedule_subcompanies
  select * from jsonb_populate_recordset(
    null::public.schedule_subcompanies,
    coalesce((
      select jsonb_agg(subcompany_item - 'kind')
      from jsonb_array_elements(backup_payload->'schedule_subcompanies') subcompany_item
      where coalesce(subcompany_item->>'kind', 'current') = 'current'
        and exists (
          select 1 from public.schedule_groups groups
          where groups.id = (subcompany_item->>'schedule_group_id')::uuid
        )
    ), '[]'::jsonb)
  );

  insert into public.new_entrant_records
  select * from jsonb_populate_recordset(null::public.new_entrant_records, backup_payload->'new_entrant_records');

  restored_counts := jsonb_build_object(
    'company_master', (select count(*) from public.company_master),
    'schedule_groups', (select count(*) from public.schedule_groups),
    'schedule_subcompanies', (select count(*) from public.schedule_subcompanies),
    'new_entrant_records', (select count(*) from public.new_entrant_records)
  );
  return restored_counts;
end;
$$;

commit;
