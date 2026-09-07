-- よく使う「会社 + 日付範囲」の絞り込みを少ない読み取りで処理する。
create index if not exists schedule_groups_primary_date_idx
  on public.schedule_groups (primary_company, work_date);

create index if not exists schedule_groups_status_date_idx
  on public.schedule_groups (status, work_date);

create index if not exists new_entrant_records_primary_date_idx
  on public.new_entrant_records (primary_company, entry_date);
