import type { EquipmentVehicle } from "./equipment-board";
import type { EquipmentType } from "./types";

type Request = { equipment_type: EquipmentType; floor_id: string; requested_count: number; company: string };
export type VehicleAssignmentHistory = { vehicle_id: string | null; to_floor_id: string; to_company: string | null; work_date: string; moved_at: string };

export function resolveVehicleAssignments(vehicles: EquipmentVehicle[], requests: Request[], history: VehicleAssignmentHistory[], date: string) {
  const capacities = new Map<string, number>();
  for (const request of requests) if (request.equipment_type === "aerial_work_vehicle") {
    const key = `${request.floor_id}\0${request.company}`;
    capacities.set(key, (capacities.get(key) ?? 0) + request.requested_count);
  }
  const candidates = vehicles.flatMap((vehicle) => {
    const entries = history.filter(row => row.vehicle_id === vehicle.id && row.work_date <= date)
      .sort((a, b) => b.work_date.localeCompare(a.work_date) || b.moved_at.localeCompare(a.moved_at));
    const exact = entries.find(row => row.work_date === date);
    if (exact) {
      const key = exact.to_company ? `${vehicle.floor_id}\0${exact.to_company}` : "";
      return exact.to_floor_id === vehicle.floor_id && key && capacities.has(key)
        ? [{ vehicle, company: exact.to_company!, key, priority: 0, recent: `${exact.work_date}\0${exact.moved_at}` }] : [];
    }
    const latest = entries[0];
    if (latest && latest.to_floor_id !== vehicle.floor_id) return [];
    const previous = entries.find(row => row.to_floor_id === vehicle.floor_id && row.to_company && capacities.has(`${vehicle.floor_id}\0${row.to_company}`));
    if (previous?.to_company) return [{ vehicle, company: previous.to_company, key: `${vehicle.floor_id}\0${previous.to_company}`, priority: 1, recent: `${previous.work_date}\0${previous.moved_at}` }];
    const legacyKey = vehicle.assigned_company ? `${vehicle.floor_id}\0${vehicle.assigned_company}` : "";
    return legacyKey && capacities.has(legacyKey) ? [{ vehicle, company: vehicle.assigned_company!, key: legacyKey, priority: 2, recent: "" }] : [];
  }).sort((a, b) => a.priority - b.priority || b.recent.localeCompare(a.recent) || a.vehicle.sort_order - b.vehicle.sort_order);

  const assigned = new Map<string, string>();
  for (const candidate of candidates) {
    const remaining = capacities.get(candidate.key) ?? 0;
    if (remaining <= 0) continue;
    assigned.set(candidate.vehicle.id, candidate.company);
    capacities.set(candidate.key, remaining - 1);
  }
  return vehicles.map(vehicle => ({ ...vehicle, assigned_company: assigned.get(vehicle.id) ?? null }));
}
