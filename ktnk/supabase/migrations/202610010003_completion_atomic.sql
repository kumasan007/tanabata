begin;

-- Serialize completion validation and writes with company edits and restores.
create or replace function public.save_work_completion_atomically(
  p_date date, p_primary text, p_notes text, p_cancel boolean,
  p_reported_at timestamptz, p_expected_reported_at timestamptz default null,
  p_expected_revision integer default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved_row public.work_completion_reports;
begin
  if p_date is null or coalesce(btrim(p_primary),'')='' or p_cancel is null
    or p_reported_at is null or length(coalesce(p_notes,''))>2000
    or (p_expected_reported_at is not null and coalesce(p_expected_revision,0)<1)
    or (p_cancel and p_expected_reported_at is null) then
    raise exception 'Invalid completion payload';
  end if;
  perform pg_advisory_xact_lock(250925001);
  if not exists(select 1 from public.company_master where primary_company=p_primary) then
    raise exception 'COMPANY_NOT_FOUND';
  end if;
  if not p_cancel and not exists(select 1 from public.schedule_groups where work_date=p_date and primary_company=p_primary) then
    raise exception 'SCHEDULE_NOT_FOUND';
  end if;
  if p_cancel then
    delete from public.work_completion_reports
      where work_date=p_date and primary_company=p_primary
        and reported_at=p_expected_reported_at and revision=p_expected_revision
      returning * into saved_row;
  elsif p_expected_reported_at is not null then
    update public.work_completion_reports set notes=coalesce(p_notes,'')
      where work_date=p_date and primary_company=p_primary
        and reported_at=p_expected_reported_at and revision=p_expected_revision
      returning * into saved_row;
  else
    insert into public.work_completion_reports(work_date,primary_company,notes,reported_at)
      values(p_date,p_primary,coalesce(p_notes,''),p_reported_at)
      on conflict(work_date,primary_company) do nothing returning * into saved_row;
  end if;
  if saved_row.work_date is null then return null; end if;
  return to_jsonb(saved_row);
end $$;
revoke all on function public.save_work_completion_atomically(date,text,text,boolean,timestamptz,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.save_work_completion_atomically(date,text,text,boolean,timestamptz,timestamptz,integer) to service_role;
notify pgrst,'reload schema';
commit;
