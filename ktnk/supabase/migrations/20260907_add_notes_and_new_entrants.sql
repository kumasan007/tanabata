alter table public.schedule_groups
  add column if not exists notes text;

create table if not exists public.new_entrant_records (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  primary_company text not null,
  secondary_company text not null,
  person_count integer not null check (person_count > 0),
  person_names text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint new_entrant_records_date_company_key
    unique (entry_date, primary_company, secondary_company)
);

create index if not exists new_entrant_records_entry_date_idx
  on public.new_entrant_records (entry_date);

alter table public.new_entrant_records enable row level security;
grant select, insert, update, delete on public.new_entrant_records to anon, authenticated, service_role;

drop policy if exists new_entrant_records_app_all on public.new_entrant_records;
create policy new_entrant_records_app_all
on public.new_entrant_records
for all
to anon, authenticated
using (true)
with check (true);

drop trigger if exists new_entrant_records_set_updated_at on public.new_entrant_records;
create trigger new_entrant_records_set_updated_at
before update on public.new_entrant_records
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
