begin;

-- Earlier migrations created this name without INCLUDE and with id ascending.
-- IF NOT EXISTS in the read optimization migration left that definition intact.
drop index if exists public.equipment_movements_vehicle_date_idx;
create index equipment_movements_vehicle_date_idx
  on public.equipment_movements (vehicle_id, work_date desc, moved_at desc, id desc)
  include (to_floor_id, to_company)
  where work_date is not null;

commit;
