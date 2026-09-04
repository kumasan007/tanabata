-- 20260904_supabase_only_company_master.sqlを適用済みの環境に、表示順を追加する。

alter table public.company_master
  add column if not exists sort_order integer not null default 0;

do $$
begin
  if (select count(*) > 1 and count(distinct sort_order) = 1 from public.company_master) then
    with ordered as (
      select id, row_number() over (order by primary_company, secondary_company nulls first, id) - 1 as position
      from public.company_master
    )
    update public.company_master company
    set sort_order = ordered.position
    from ordered
    where company.id = ordered.id;
  end if;
end
$$;

notify pgrst, 'reload schema';
