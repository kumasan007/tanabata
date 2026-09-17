begin;

-- Allow one record per person even when the date and company are the same.
-- Older installations used either a table constraint or this unique index.
alter table public.new_entrant_records
  drop constraint if exists new_entrant_records_entry_date_primary_company_secondary_company_key;

drop index if exists public.new_entrant_records_date_company_idx;

create index if not exists new_entrant_records_company_date_idx
  on public.new_entrant_records (entry_date, primary_company, secondary_company);

notify pgrst, 'reload schema';

commit;
