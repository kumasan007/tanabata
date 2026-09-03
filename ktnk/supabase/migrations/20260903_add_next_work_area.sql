alter table public.schedule_groups
add column if not exists next_work_area text;
