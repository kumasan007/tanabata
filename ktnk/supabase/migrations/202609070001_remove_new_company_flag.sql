alter table public.new_entrant_records
  drop constraint if exists new_entrant_records_has_entry_check;

alter table public.new_entrant_records
  drop column if exists is_new_company;

alter table public.new_entrant_records
  drop constraint if exists new_entrant_records_person_count_check;

alter table public.new_entrant_records
  add constraint new_entrant_records_person_count_check
  check (person_count > 0) not valid;

notify pgrst, 'reload schema';
