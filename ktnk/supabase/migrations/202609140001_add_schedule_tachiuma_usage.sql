alter table public.schedule_groups
  add column if not exists uses_tachiuma boolean not null default false;
