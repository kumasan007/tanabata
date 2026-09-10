begin;

-- 同じ日・所属会社に複数人を個別登録できるようにする。
alter table public.new_entrant_records
  drop constraint if exists new_entrant_records_entry_date_primary_company_secondary_company_key;

create index if not exists new_entrant_records_company_date_idx
  on public.new_entrant_records (entry_date, primary_company, secondary_company);

notify pgrst, 'reload schema';

commit;
