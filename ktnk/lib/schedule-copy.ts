import type { PreviousSchedule, ScheduleWithSubcompanies } from "@/lib/types";

export function scheduleToCopyData(row: ScheduleWithSubcompanies | null): PreviousSchedule | null {
  if (!row) return null;
  return {
    workDate: row.work_date,
    primaryCount: row.primary_count,
    workArea: row.work_area,
    workContent: row.work_content,
    usesAerialWorkVehicle: row.uses_aerial_work_vehicle,
    aerialWorkVehicleNotes: row.aerial_work_vehicle_notes,
    aerialWorkVehicleRequests: equipmentRequests(row, "aerial_work_vehicle"),
    usesFire: row.uses_fire,
    fireArea: row.fire_area,
    usesTachiuma: row.uses_tachiuma,
    tachiumaNotes: row.tachiuma_notes,
    tachiumaRequests: equipmentRequests(row, "tachiuma"),
    subcompanies: row.subcompanies.map((subcompany) => ({
      secondaryCompany: subcompany.secondary_company ?? "",
      workerCount: subcompany.worker_count,
    })),
  };
}

function equipmentRequests(row: ScheduleWithSubcompanies, type: "aerial_work_vehicle" | "tachiuma") {
  return (row.equipmentRequests ?? []).filter((item) => item.equipment_type === type).map((item) => ({
    floorId: item.floor_id,
    floorName: Array.isArray(item.equipment_floor_master) ? item.equipment_floor_master[0]?.name ?? "" : item.equipment_floor_master?.name ?? "",
    count: item.requested_count,
  }));
}
