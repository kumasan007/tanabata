-- Reordering the company master updates sort_order on several rows at once.
-- Keep those presentation-only changes out of the per-company operation history.
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

  if tg_table_name = 'company_master'
    and tg_op = 'UPDATE'
    and (to_jsonb(old) - 'sort_order') = (to_jsonb(new) - 'sort_order') then
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
