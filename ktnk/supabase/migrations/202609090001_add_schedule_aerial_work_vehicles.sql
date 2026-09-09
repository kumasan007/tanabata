create table if not exists public.schedule_aerial_work_vehicles (
  id uuid primary key default gen_random_uuid(),
  schedule_group_id uuid not null references public.schedule_groups(id) on delete cascade,
  work_area text not null check (length(trim(work_area)) > 0),
  vehicle_count integer not null check (vehicle_count > 0),
  sort_order integer not null default 0
);

create index if not exists schedule_aerial_work_vehicles_group_idx
  on public.schedule_aerial_work_vehicles(schedule_group_id, sort_order);

alter table public.schedule_aerial_work_vehicles enable row level security;

grant select, insert, update, delete on public.schedule_aerial_work_vehicles to anon, authenticated, service_role;

drop policy if exists "anon can read aerial work vehicles" on public.schedule_aerial_work_vehicles;
create policy "anon can read aerial work vehicles" on public.schedule_aerial_work_vehicles for select to anon using (true);
drop policy if exists "anon can insert aerial work vehicles" on public.schedule_aerial_work_vehicles;
create policy "anon can insert aerial work vehicles" on public.schedule_aerial_work_vehicles for insert to anon with check (true);
drop policy if exists "anon can update aerial work vehicles" on public.schedule_aerial_work_vehicles;
create policy "anon can update aerial work vehicles" on public.schedule_aerial_work_vehicles for update to anon using (true) with check (true);
drop policy if exists "anon can delete aerial work vehicles" on public.schedule_aerial_work_vehicles;
create policy "anon can delete aerial work vehicles" on public.schedule_aerial_work_vehicles for delete to anon using (true);

insert into public.schedule_aerial_work_vehicles (schedule_group_id, work_area, vehicle_count, sort_order)
select id, aerial_work_vehicle_floor, aerial_work_vehicle_count, 0
from public.schedule_groups
where coalesce(aerial_work_vehicle_count, 0) > 0
  and length(trim(coalesce(aerial_work_vehicle_floor, ''))) > 0
  and not exists (
    select 1 from public.schedule_aerial_work_vehicles vehicle
    where vehicle.schedule_group_id = schedule_groups.id
  );
