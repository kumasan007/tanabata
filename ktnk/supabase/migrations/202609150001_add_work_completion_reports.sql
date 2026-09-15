-- 一次会社・日付ごとに独立した作業終了報告
create table if not exists public.work_completion_reports (
  work_date date not null,
  primary_company text not null,
  reported_at timestamptz not null default now(),
  notes text not null default '' check (char_length(notes) <= 2000),
  primary key (work_date, primary_company)
);
alter table public.work_completion_reports enable row level security;
grant select, insert, update, delete on public.work_completion_reports to anon, authenticated, service_role;
drop policy if exists work_completion_reports_app_all on public.work_completion_reports;
create policy work_completion_reports_app_all on public.work_completion_reports
  for all to anon, authenticated using (true) with check (true);
