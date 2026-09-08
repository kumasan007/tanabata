alter table public.new_entrant_records
  add column if not exists nationality_status text;

alter table public.new_entrant_records
  drop constraint if exists new_entrant_records_nationality_status_check;

alter table public.new_entrant_records
  add constraint new_entrant_records_nationality_status_check
  check (nationality_status in ('japanese_only', 'includes_foreign'));

notify pgrst, 'reload schema';
