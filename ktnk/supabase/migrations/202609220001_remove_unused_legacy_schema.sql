-- Remove only structures that were superseded by the current application contract.
-- Intentionally no CASCADE: an unexpected live dependency must stop this migration.

begin;

-- Removed from new-entrant requests in 202609070001.
alter table if exists public.new_entrant_records
  drop column if exists is_new_company;

-- Removed with the obsolete no-work / next-visit workflow in 202609080003.
alter table if exists public.schedule_groups
  drop column if exists status,
  drop column if exists next_visit_date,
  drop column if exists next_primary_count,
  drop column if exists next_work_area,
  drop column if exists next_work_content;

alter table if exists public.schedule_subcompanies
  drop column if exists kind;

-- Replaced first by the vehicle detail table, then by the current boolean + notes fields.
do $$
begin
  if to_regclass('public.audit_logs') is not null then
    delete from public.audit_logs
    where table_name = 'schedule_aerial_work_vehicles';
  end if;
end
$$;

drop table if exists public.schedule_aerial_work_vehicles;

alter table if exists public.schedule_groups
  drop column if exists aerial_work_vehicle_details,
  drop column if exists aerial_work_vehicle_count,
  drop column if exists aerial_work_vehicle_floor;

notify pgrst, 'reload schema';

commit;
