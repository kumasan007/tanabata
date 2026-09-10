import type { PreviousSchedule, ScheduleWithSubcompanies } from "@/lib/types";

export function scheduleToCopyData(row: ScheduleWithSubcompanies | null): PreviousSchedule | null {
  if (!row) return null;
  return {
    workDate: row.work_date,
    primaryCount: row.primary_count,
    workArea: row.work_area,
    workContent: row.work_content,
    aerialWorkVehicleCount: row.aerial_work_vehicle_count,
    aerialWorkVehicleFloor: row.aerial_work_vehicle_floor,
    aerialWorkVehicles: row.aerialWorkVehicles?.map((vehicle) => ({ workArea: vehicle.work_area, vehicleCount: vehicle.vehicle_count })),
    subcompanies: row.subcompanies.map((subcompany) => ({
      secondaryCompany: subcompany.secondary_company ?? "",
      workerCount: subcompany.worker_count,
    })),
  };
}
