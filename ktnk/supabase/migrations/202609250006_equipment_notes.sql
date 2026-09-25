begin;

alter table public.tachiuma_floor_stocks
  add column if not exists notes text;

alter table public.tachiuma_floor_stocks
  drop constraint if exists tachiuma_floor_stocks_notes_check;
alter table public.tachiuma_floor_stocks
  add constraint tachiuma_floor_stocks_notes_check
  check (notes is null or char_length(notes) <= 500);

create or replace function public.save_tachiuma_stock(
  p_floor uuid,
  p_quantity integer,
  p_notes text,
  p_expected timestamptz
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare s public.tachiuma_floor_stocks; previous_quantity integer; clean_notes text := nullif(btrim(p_notes), '');
begin
  perform pg_advisory_xact_lock(250925001);
  if not exists(select 1 from public.equipment_floor_master where id=p_floor) then raise exception 'フロアが存在しません。'; end if;
  if p_quantity is null or p_quantity not between 0 and 9999 then raise exception '台数が正しくありません。'; end if;
  if clean_notes is not null and char_length(clean_notes)>500 then raise exception '備考は500文字以内で入力してください。'; end if;
  select * into s from public.tachiuma_floor_stocks where floor_id=p_floor for update;
  if s.updated_at is distinct from p_expected then raise exception '台数または備考が変更されています。更新して再度操作してください。'; end if;
  previous_quantity := coalesce(s.quantity,0);
  insert into public.tachiuma_floor_stocks(floor_id,quantity,notes) values(p_floor,p_quantity,clean_notes)
    on conflict(floor_id) do update set quantity=excluded.quantity,notes=excluded.notes,updated_at=clock_timestamp();
  insert into public.equipment_movements(equipment_type,action,to_floor_id,quantity) values('tachiuma','set_stock',p_floor,p_quantity-previous_quantity);
end $$;

revoke all on function public.save_tachiuma_stock(uuid,integer,text,timestamptz) from public, anon, authenticated;
grant execute on function public.save_tachiuma_stock(uuid,integer,text,timestamptz) to service_role;

commit;
