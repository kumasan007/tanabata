-- Aggregate entrants in PostgreSQL while preserving caller RLS.
create or replace function public.get_calendar_entrant_summary(
  p_from date, p_to date, p_company text default ''
) returns table (
  entry_date date, primary_company text, secondary_company text, person_count bigint
) language plpgsql stable security invoker set search_path = public as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 365 then
    raise exception 'Invalid calendar date range';
  end if;
  return query
    select r.entry_date, r.primary_company, r.secondary_company, sum(r.person_count)::bigint
    from public.new_entrant_records r
    where r.entry_date between p_from and p_to
      and (coalesce(p_company, '') = '' or r.primary_company = p_company)
    group by r.entry_date, r.primary_company, r.secondary_company
    order by r.entry_date, r.primary_company, r.secondary_company;
end;
$$;
revoke all on function public.get_calendar_entrant_summary(date, date, text) from public;
grant execute on function public.get_calendar_entrant_summary(date, date, text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
