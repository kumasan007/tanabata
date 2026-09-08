-- バックアップはアプリやservice_roleから手動削除させず、10日経過後だけ日次処理で削除する。
revoke delete on public.data_backups from anon, authenticated, service_role;

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
  where created_at < now() - interval '10 days';
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
