alter table public.schedule_groups
  add column if not exists tachiuma_notes text;
