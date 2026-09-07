-- 業務データのスナップショットをSupabase内に保存し、毎日23:59（日本時間）に自動作成する。
create extension if not exists pg_cron;

create table if not exists public.data_backups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  backup_date date not null default ((now() at time zone 'Asia/Tokyo')::date),
  source text not null check (source in ('automatic', 'manual')),
  schema_version integer not null default 1,
  row_counts jsonb not null,
  payload jsonb not null
);

create unique index if not exists data_backups_one_automatic_per_day_idx
  on public.data_backups (backup_date)
  where source = 'automatic';

create index if not exists data_backups_created_at_idx
  on public.data_backups (created_at desc);

alter table public.data_backups enable row level security;
revoke all on public.data_backups from anon, authenticated;
grant select, insert, update, delete on public.data_backups to service_role;

create or replace function public.create_data_backup(p_source text default 'manual')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  backup_id uuid;
  backup_payload jsonb;
  backup_counts jsonb;
begin
  if p_source not in ('automatic', 'manual') then
    raise exception 'Invalid backup source';
  end if;

  backup_payload := jsonb_build_object(
    'company_master', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.sort_order, row_data.id) from public.company_master row_data), '[]'::jsonb),
    'schedule_groups', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.work_date, row_data.id) from public.schedule_groups row_data), '[]'::jsonb),
    'schedule_subcompanies', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.schedule_group_id, row_data.sort_order, row_data.id) from public.schedule_subcompanies row_data), '[]'::jsonb),
    'new_entrant_records', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.entry_date, row_data.id) from public.new_entrant_records row_data), '[]'::jsonb)
  );
  backup_counts := jsonb_build_object(
    'company_master', jsonb_array_length(backup_payload->'company_master'),
    'schedule_groups', jsonb_array_length(backup_payload->'schedule_groups'),
    'schedule_subcompanies', jsonb_array_length(backup_payload->'schedule_subcompanies'),
    'new_entrant_records', jsonb_array_length(backup_payload->'new_entrant_records')
  );

  if p_source = 'automatic' then
    insert into public.data_backups (source, row_counts, payload)
    values (p_source, backup_counts, backup_payload)
    on conflict (backup_date) where source = 'automatic'
    do update set created_at = now(), row_counts = excluded.row_counts, payload = excluded.payload
    returning id into backup_id;
  else
    insert into public.data_backups (source, row_counts, payload)
    values (p_source, backup_counts, backup_payload)
    returning id into backup_id;
  end if;

  return backup_id;
end;
$$;

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

  delete from public.schedule_subcompanies;
  delete from public.schedule_groups;
  delete from public.new_entrant_records;
  delete from public.company_master;

  insert into public.company_master
  select * from jsonb_populate_recordset(null::public.company_master, backup_payload->'company_master');
  insert into public.schedule_groups
  select * from jsonb_populate_recordset(null::public.schedule_groups, backup_payload->'schedule_groups');
  insert into public.schedule_subcompanies
  select * from jsonb_populate_recordset(null::public.schedule_subcompanies, backup_payload->'schedule_subcompanies');
  insert into public.new_entrant_records
  select * from jsonb_populate_recordset(null::public.new_entrant_records, backup_payload->'new_entrant_records');

  restored_counts := jsonb_build_object(
    'company_master', jsonb_array_length(backup_payload->'company_master'),
    'schedule_groups', jsonb_array_length(backup_payload->'schedule_groups'),
    'schedule_subcompanies', jsonb_array_length(backup_payload->'schedule_subcompanies'),
    'new_entrant_records', jsonb_array_length(backup_payload->'new_entrant_records')
  );
  return restored_counts;
end;
$$;

revoke all on function public.create_data_backup(text) from public, anon, authenticated;
revoke all on function public.restore_data_backup(uuid) from public, anon, authenticated;
grant execute on function public.create_data_backup(text) to service_role;
grant execute on function public.restore_data_backup(uuid) to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'ktnk-daily-data-backup';

select cron.schedule(
  'ktnk-daily-data-backup',
  '59 14 * * *',
  $cron$select public.create_data_backup('automatic');$cron$
);

notify pgrst, 'reload schema';
