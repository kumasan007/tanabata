-- Keep public pages login-free, but require all data access to pass through the
-- validated Next.js API routes, which use the server-only service key.
revoke all on public.company_master from anon, authenticated;
revoke all on public.schedule_groups from anon, authenticated;
revoke all on public.schedule_subcompanies from anon, authenticated;
revoke all on public.new_entrant_records from anon, authenticated;
revoke all on public.work_completion_reports from anon, authenticated;
revoke all on public.schedule_equipment_requests from anon, authenticated;
revoke all on public.equipment_floor_master from anon, authenticated;

revoke execute on function public.save_schedule_atomically(jsonb,jsonb,boolean,boolean,uuid) from anon, authenticated;
revoke execute on function public.save_schedule_atomically(jsonb,jsonb,jsonb,boolean,boolean,uuid) from anon, authenticated;
revoke execute on function public.get_calendar_entrant_summary(date,date,text) from anon, authenticated;

-- Shared-admin login throttling. Only the server service key can access it.
create table if not exists public.admin_login_attempts (
  id bigint generated always as identity primary key,
  client_key text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists admin_login_attempts_lookup_idx
  on public.admin_login_attempts(client_key, attempted_at desc);
alter table public.admin_login_attempts enable row level security;
revoke all on public.admin_login_attempts from public, anon, authenticated;
grant select, insert, delete on public.admin_login_attempts to service_role;

-- Per-change history is intentionally removed. Daily backups remain enabled.
do $$
declare target_table text;
begin
  foreach target_table in array array[
    'company_master', 'schedule_groups', 'schedule_subcompanies',
    'schedule_aerial_work_vehicles', 'new_entrant_records',
    'work_completion_reports'
  ] loop
    if to_regclass('public.' || target_table) is not null then
      execute format('drop trigger if exists audit_changes on public.%I', target_table);
    end if;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ktnk-audit-log-cleanup') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ktnk-audit-log-cleanup';
  end if;
end $$;

drop function if exists public.restore_audit_change(bigint, boolean);
drop function if exists public.restore_audit_change(bigint);
drop function if exists public.delete_expired_audit_logs();
drop function if exists public.capture_audit_log();
drop table if exists public.audit_logs;

notify pgrst, 'reload schema';
