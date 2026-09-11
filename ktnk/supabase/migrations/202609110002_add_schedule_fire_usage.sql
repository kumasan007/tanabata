alter table public.schedule_groups
  add column if not exists uses_fire boolean not null default false;
