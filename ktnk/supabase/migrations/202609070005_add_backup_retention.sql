-- 7日より前のバックアップを毎日の自動バックアップ時に削除する。
create or replace function public.delete_old_data_backups()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.data_backups
  where created_at < now() - interval '7 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_old_data_backups() from public, anon, authenticated;
grant execute on function public.delete_old_data_backups() to service_role;

create or replace function public.run_daily_data_backup()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.create_data_backup('automatic');
  perform public.delete_old_data_backups();
end;
$$;

revoke all on function public.run_daily_data_backup() from public, anon, authenticated;
grant execute on function public.run_daily_data_backup() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'ktnk-daily-data-backup';

select cron.schedule(
  'ktnk-daily-data-backup',
  '59 14 * * *',
  $cron$select public.run_daily_data_backup();$cron$
);
