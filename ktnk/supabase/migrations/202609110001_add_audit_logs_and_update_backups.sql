-- Keep a lightweight, database-side history of operational data for 24 hours.
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  transaction_id bigint not null default txid_current(),
  table_name text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  row_id text,
  old_data jsonb,
  new_data jsonb,
  restored_at timestamptz
);

create index if not exists audit_logs_changed_at_idx
  on public.audit_logs (changed_at desc);
create index if not exists audit_logs_transaction_id_idx
  on public.audit_logs (transaction_id, id);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from public, anon, authenticated;
grant select on public.audit_logs to service_role;

create or replace function public.capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.skip_audit', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  insert into public.audit_logs (table_name, operation, row_id, old_data, new_data)
  values (
    tg_table_name,
    tg_op,
    coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.capture_audit_log() from public, anon, authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'company_master',
    'schedule_groups',
    'schedule_subcompanies',
    'schedule_aerial_work_vehicles',
    'new_entrant_records'
  ]
  loop
    execute format('drop trigger if exists audit_changes on public.%I', target_table);
    execute format(
      'create trigger audit_changes after insert or update or delete on public.%I for each row execute function public.capture_audit_log()',
      target_table
    );
  end loop;
end;
$$;

create or replace function public.delete_expired_audit_logs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.audit_logs where changed_at < now() - interval '24 hours';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_expired_audit_logs() from public, anon, authenticated;
grant execute on function public.delete_expired_audit_logs() to service_role;

drop function if exists public.restore_audit_change(bigint);

create or replace function public.restore_audit_change(p_audit_id bigint, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.audit_logs%rowtype;
  change_row public.audit_logs%rowtype;
  column_list text;
begin
  select * into target from public.audit_logs where id = p_audit_id for update;
  if not found then raise exception 'Audit log not found'; end if;
  if target.changed_at < now() - interval '24 hours' then raise exception 'Audit log has expired'; end if;
  if target.restored_at is not null then raise exception 'Audit log has already been restored'; end if;

  if not p_force and exists (
    select 1
    from public.audit_logs original_change
    join public.audit_logs newer_change
      on newer_change.table_name = original_change.table_name
      and newer_change.row_id = original_change.row_id
      and newer_change.id > target.id
      and newer_change.transaction_id <> target.transaction_id
    where original_change.transaction_id = target.transaction_id
  ) then
    raise exception 'AUDIT_NEWER_CHANGE_EXISTS';
  end if;

  -- A cascade delete produces several rows in the same transaction. Restore the
  -- complete transaction so parent and child records cannot be split apart.
  -- These inverse writes are also audited, so an accidental restore can itself
  -- be undone from the newly-created history entry.
  for change_row in
    select * from public.audit_logs
    where transaction_id = target.transaction_id and restored_at is null
    order by
      case operation when 'INSERT' then 1 when 'UPDATE' then 2 else 3 end,
      case
        when operation = 'INSERT' then case table_name when 'schedule_subcompanies' then 3 when 'schedule_aerial_work_vehicles' then 3 when 'schedule_groups' then 2 else 1 end
        when operation = 'DELETE' then case table_name when 'schedule_groups' then 3 when 'schedule_subcompanies' then 2 when 'schedule_aerial_work_vehicles' then 2 else 1 end
        else 1
      end desc,
      id desc
  loop
    if change_row.table_name not in ('company_master', 'schedule_groups', 'schedule_subcompanies', 'schedule_aerial_work_vehicles', 'new_entrant_records') then
      raise exception 'Unsupported audit table';
    end if;

    if change_row.operation = 'INSERT' then
      execute format('delete from public.%I where id::text = $1', change_row.table_name) using change_row.row_id;
    elsif change_row.operation = 'DELETE' then
      execute format(
        'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
        change_row.table_name,
        change_row.table_name
      ) using change_row.old_data;
    else
      select string_agg(quote_ident(attname), ', ' order by attnum)
        into column_list
      from pg_attribute
      where attrelid = format('public.%I', change_row.table_name)::regclass
        and attnum > 0 and not attisdropped and attgenerated = '';
      execute format(
        'update public.%1$I as current_row set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) where current_row.id::text = $2',
        change_row.table_name,
        column_list
      ) using change_row.old_data, change_row.row_id;
    end if;
  end loop;

  update public.audit_logs set restored_at = now() where transaction_id = target.transaction_id;
  return jsonb_build_object('id', target.id, 'transactionId', target.transaction_id);
end;
$$;

revoke all on function public.restore_audit_change(bigint, boolean) from public, anon, authenticated;
grant execute on function public.restore_audit_change(bigint, boolean) to service_role;

-- Include the aerial-work-vehicle table added after the original backup migration.
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
  if p_source not in ('automatic', 'manual') then raise exception 'Invalid backup source'; end if;
  backup_payload := jsonb_build_object(
    'company_master', coalesce((select jsonb_agg(to_jsonb(r) order by r.sort_order, r.id) from public.company_master r), '[]'::jsonb),
    'schedule_groups', coalesce((select jsonb_agg(to_jsonb(r) order by r.work_date, r.id) from public.schedule_groups r), '[]'::jsonb),
    'schedule_subcompanies', coalesce((select jsonb_agg(to_jsonb(r) order by r.schedule_group_id, r.sort_order, r.id) from public.schedule_subcompanies r), '[]'::jsonb),
    'schedule_aerial_work_vehicles', coalesce((select jsonb_agg(to_jsonb(r) order by r.schedule_group_id, r.sort_order, r.id) from public.schedule_aerial_work_vehicles r), '[]'::jsonb),
    'new_entrant_records', coalesce((select jsonb_agg(to_jsonb(r) order by r.entry_date, r.id) from public.new_entrant_records r), '[]'::jsonb)
  );
  backup_counts := jsonb_build_object(
    'company_master', jsonb_array_length(backup_payload->'company_master'),
    'schedule_groups', jsonb_array_length(backup_payload->'schedule_groups'),
    'schedule_subcompanies', jsonb_array_length(backup_payload->'schedule_subcompanies'),
    'schedule_aerial_work_vehicles', jsonb_array_length(backup_payload->'schedule_aerial_work_vehicles'),
    'new_entrant_records', jsonb_array_length(backup_payload->'new_entrant_records')
  );
  insert into public.data_backups (source, schema_version, row_counts, payload)
  values (p_source, 2, backup_counts, backup_payload)
  on conflict (backup_date) where source = 'automatic'
  do update set created_at = now(), schema_version = 2, row_counts = excluded.row_counts, payload = excluded.payload
  returning id into backup_id;
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
  select payload into backup_payload from public.data_backups where id = p_backup_id;
  if backup_payload is null then raise exception 'Backup not found'; end if;
  perform set_config('app.skip_audit', 'on', true);
  delete from public.schedule_aerial_work_vehicles;
  delete from public.schedule_subcompanies;
  delete from public.schedule_groups;
  delete from public.new_entrant_records;
  delete from public.company_master;
  insert into public.company_master select * from jsonb_populate_recordset(null::public.company_master, backup_payload->'company_master');
  insert into public.schedule_groups select * from jsonb_populate_recordset(null::public.schedule_groups, backup_payload->'schedule_groups');
  insert into public.schedule_subcompanies select * from jsonb_populate_recordset(null::public.schedule_subcompanies, backup_payload->'schedule_subcompanies');
  insert into public.schedule_aerial_work_vehicles select * from jsonb_populate_recordset(null::public.schedule_aerial_work_vehicles, coalesce(backup_payload->'schedule_aerial_work_vehicles', '[]'::jsonb));
  insert into public.new_entrant_records select * from jsonb_populate_recordset(null::public.new_entrant_records, backup_payload->'new_entrant_records');
  restored_counts := jsonb_build_object(
    'company_master', jsonb_array_length(backup_payload->'company_master'),
    'schedule_groups', jsonb_array_length(backup_payload->'schedule_groups'),
    'schedule_subcompanies', jsonb_array_length(backup_payload->'schedule_subcompanies'),
    'schedule_aerial_work_vehicles', jsonb_array_length(coalesce(backup_payload->'schedule_aerial_work_vehicles', '[]'::jsonb)),
    'new_entrant_records', jsonb_array_length(backup_payload->'new_entrant_records')
  );
  return restored_counts;
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'ktnk-audit-log-cleanup';
select cron.schedule(
  'ktnk-audit-log-cleanup',
  '17 18 * * *',
  $cron$select public.delete_expired_audit_logs();$cron$
);

select cron.unschedule(jobid) from cron.job where jobname = 'ktnk-daily-data-backup';
select cron.schedule(
  'ktnk-daily-data-backup',
  '59 14 * * *',
  $cron$select public.run_daily_data_backup();$cron$
);

notify pgrst, 'reload schema';
