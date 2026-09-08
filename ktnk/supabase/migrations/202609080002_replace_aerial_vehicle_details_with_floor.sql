alter table public.schedule_groups
  add column if not exists aerial_work_vehicle_floor text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'schedule_groups'
      and column_name = 'aerial_work_vehicle_details'
  ) then
    alter table public.schedule_groups
      drop column aerial_work_vehicle_details;
  end if;
end
$$;

notify pgrst, 'reload schema';
