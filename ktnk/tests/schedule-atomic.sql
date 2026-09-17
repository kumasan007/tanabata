-- schema.sql と保存用マイグレーション適用済みの検証DBで実行する。
-- 全変更は最後にROLLBACKする。
begin;
create temp table atomic_test_operations (transaction_id bigint);
create function pg_temp.track_atomic_test_operation() returns trigger language plpgsql as $$
begin
  insert into atomic_test_operations values (txid_current());
  return null;
end;
$$;
create trigger atomic_test_group after insert or update or delete on public.schedule_groups
  for each row execute function pg_temp.track_atomic_test_operation();
create trigger atomic_test_subcompany after insert or update or delete on public.schedule_subcompanies
  for each row execute function pg_temp.track_atomic_test_operation();

do $$
declare
  company_name text := '__atomic_test_' || gen_random_uuid()::text;
  groups jsonb;
  subs jsonb := '[{"secondary_company":"B","worker_count":3}]';
  result jsonb;
  original jsonb;
  current_state jsonb;
  rejected boolean;
  details text;
begin
  groups := jsonb_build_array(
    jsonb_build_object('work_date','2026-09-15','primary_company',company_name,'primary_count',1,
      'work_area','10F','work_content','original','uses_aerial_work_vehicle',true,
      'aerial_work_vehicle_notes','10F','uses_fire',true,'uses_tachiuma',true,'tachiuma_notes','2'),
    jsonb_build_object('work_date','2026-09-16','primary_company',company_name,'primary_count',1,
      'work_area','10F','work_content','original','uses_aerial_work_vehicle',true,
      'aerial_work_vehicle_notes','10F','uses_fire',true,'uses_tachiuma',true,'tachiuma_notes','2')
  );
  result := public.save_schedule_atomically(groups, subs);
  if jsonb_array_length(result->'dates') <> 2 or jsonb_array_length(result->'savedIds') <> 2 then
    raise exception 'Multiple dates were not saved';
  end if;
  if (select count(*) from public.schedule_subcompanies where schedule_group_id in (
    select id from public.schedule_groups where primary_company = company_name)) <> 2 then
    raise exception 'Child rows were not saved';
  end if;
  if (select count(distinct transaction_id) from atomic_test_operations) <> 1 then
    raise exception 'Parent and child operations have different transactions';
  end if;

  select jsonb_agg(to_jsonb(s) || jsonb_build_object(
    'subs', (select jsonb_agg(to_jsonb(sub) order by sub.id) from public.schedule_subcompanies sub where sub.schedule_group_id = s.id)
  ) order by s.work_date) into original from public.schedule_groups s where primary_company = company_name;

  -- 2日目の検証で失敗しても、1日目の保存を取り消す。
  rejected := false;
  begin
    perform public.save_schedule_atomically(
      jsonb_set(jsonb_set(groups, '{0,work_content}', '"changed"'), '{1,primary_count}', '-1'), subs, true);
  exception when raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'Invalid second date was accepted'; end if;

  select jsonb_agg(to_jsonb(s) || jsonb_build_object(
    'subs', (select jsonb_agg(to_jsonb(sub) order by sub.id) from public.schedule_subcompanies sub where sub.schedule_group_id = s.id)
  ) order by s.work_date) into current_state from public.schedule_groups s where primary_company = company_name;
  if current_state is distinct from original then raise exception 'Failed save changed the original data'; end if;

  rejected := false;
  begin
    perform public.save_schedule_atomically(groups, subs);
  exception when raise_exception then
    if sqlerrm <> 'SCHEDULE_ALREADY_EXISTS' then raise; end if;
    get stacked diagnostics details = pg_exception_detail;
    if jsonb_array_length(details::jsonb) <> 2 then raise exception 'Conflict dates are missing'; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Unconfirmed overwrite was accepted'; end if;

  -- 入力済み日を除いて、新しい日のみ保存する。
  result := public.save_schedule_atomically(groups || jsonb_build_array(
    jsonb_set(groups->0, '{work_date}', '"2026-09-17"')), subs, false, true);
  if result->'dates' <> '["2026-09-17"]'::jsonb then raise exception 'Skip-existing dates are incorrect'; end if;

  rejected := false;
  begin
    perform public.save_schedule_atomically(jsonb_build_array(groups->0), subs, true, false, gen_random_uuid());
  exception when raise_exception then
    if sqlerrm <> 'SCHEDULE_NOT_FOUND' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Missing edit ID was accepted'; end if;

  result := public.save_schedule_atomically(
    jsonb_build_array(jsonb_set(groups->0, '{work_content}', '"updated"')), '[]', true);
  if (select work_content from public.schedule_groups where id = (result->'savedIds'->>0)::uuid) <> 'updated'
    or exists (select 1 from public.schedule_subcompanies where schedule_group_id = (result->'savedIds'->>0)::uuid) then
    raise exception 'Confirmed overwrite did not replace child rows';
  end if;
end;
$$;
rollback;
