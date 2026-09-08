alter table public.schedule_groups
  add column if not exists aerial_work_vehicle_count integer
    check (aerial_work_vehicle_count is null or aerial_work_vehicle_count >= 0),
  add column if not exists aerial_work_vehicle_floor text;
