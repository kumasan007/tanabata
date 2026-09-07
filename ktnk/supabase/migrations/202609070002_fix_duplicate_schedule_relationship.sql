-- PostgREST PGRST201 対応:
-- schedule_subcompanies.schedule_group_id の重複外部キーを1本に統一する。
-- テーブル内の入力データは変更・削除しない。

begin;

alter table public.schedule_subcompanies
  drop constraint if exists schedule_subcompanies_group_id_fkey;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.schedule_subcompanies'::regclass
      and conname = 'schedule_subcompanies_schedule_group_id_fkey'
      and contype = 'f'
  ) then
    alter table public.schedule_subcompanies
      add constraint schedule_subcompanies_schedule_group_id_fkey
      foreign key (schedule_group_id)
      references public.schedule_groups(id)
      on delete cascade
      not valid;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
