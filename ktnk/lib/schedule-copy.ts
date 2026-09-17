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
    usesFire: row.uses_fire,
    fireArea: row.fire_area,
    usesTachiuma: row.uses_tachiuma,
    tachiumaNotes: row.tachiuma_notes,
    subcompanies: row.subcompanies.map((subcompany) => ({
      secondaryCompany: subcompany.secondary_company ?? "",
      workerCount: subcompany.worker_count,
    })),
  };
}
