alter table public.schedule_groups
  add column if not exists fire_area text;

notify pgrst, 'reload schema';
