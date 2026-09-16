-- Add work-completion reports to the 24-hour operation history.
-- This table uses a composite primary key, so its audit identity and restore
-- statements need to use work_date + primary_company instead of an id column.
create or replace function public.capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if current_setting('app.skip_audit', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  insert into public.audit_logs (table_name, operation, row_id, old_data, new_data)
  values (
    tg_table_name,
    tg_op,
    coalesce(
      row_data->>'id',
      case when tg_table_name = 'work_completion_reports'
        then (row_data->>'work_date') || '|' || (row_data->>'primary_company')
      end
    ),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.capture_audit_log() from public, anon, authenticated;

drop trigger if exists audit_changes on public.work_completion_reports;
create trigger audit_changes
after insert or update or delete on public.work_completion_reports
for each row execute function public.capture_audit_log();

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
    if change_row.table_name not in ('company_master', 'schedule_groups', 'schedule_subcompanies', 'schedule_aerial_work_vehicles', 'new_entrant_records', 'work_completion_reports') then
      raise exception 'Unsupported audit table';
    end if;

    if change_row.table_name = 'work_completion_reports' then
      if change_row.operation = 'INSERT' then
        delete from public.work_completion_reports
        where work_date = (change_row.new_data->>'work_date')::date
          and primary_company = change_row.new_data->>'primary_company';
      elsif change_row.operation = 'DELETE' then
        insert into public.work_completion_reports
        select * from jsonb_populate_record(null::public.work_completion_reports, change_row.old_data);
      else
        update public.work_completion_reports
        set work_date = (change_row.old_data->>'work_date')::date,
            primary_company = change_row.old_data->>'primary_company',
            reported_at = (change_row.old_data->>'reported_at')::timestamptz,
            notes = coalesce(change_row.old_data->>'notes', '')
        where work_date = (change_row.new_data->>'work_date')::date
          and primary_company = change_row.new_data->>'primary_company';
      end if;
    elsif change_row.operation = 'INSERT' then
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

notify pgrst, 'reload schema';
