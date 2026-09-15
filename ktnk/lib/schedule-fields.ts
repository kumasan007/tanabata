import type { AerialWorkVehicleInput, ScheduleSubmitInput, ScheduleWithSubcompanies } from "@/lib/types";
export function aerialVehicleFields(vehicles: AerialWorkVehicleInput[]) {
    return {
        aerialWorkVehicles: vehicles,
        aerialWorkVehicleCount: vehicles.reduce((sum, row) => sum + (row.vehicleCount ?? 0), 0),
        aerialWorkVehicleFloor: vehicles.map((row) => row.workArea).filter(Boolean).join("、"),
    };
}
export function scheduleToFormData(row: ScheduleWithSubcompanies, secondaryCompanies?: string[]): ScheduleSubmitInput {
    const vehicles = row.aerialWorkVehicles?.length
        ? row.aerialWorkVehicles.map((vehicle) => ({ workArea: vehicle.work_area, vehicleCount: vehicle.vehicle_count }))
        : (row.aerial_work_vehicle_count ?? 0) > 0
            ? [{ workArea: row.aerial_work_vehicle_floor ?? "", vehicleCount: row.aerial_work_vehicle_count }]
            : [];
    const savedCounts = new Map(row.subcompanies.map((sub) => [sub.secondary_company ?? "", sub.worker_count]));
    return {
        dates: [row.work_date], startDate: row.work_date, endDate: row.work_date, excludeWeekends: false,
        primaryCompany: row.primary_company, primaryCount: row.primary_count,
        currentSubcompanies: (secondaryCompanies ?? row.subcompanies.map((sub) => sub.secondary_company ?? ""))
            .map((secondaryCompany) => ({ secondaryCompany, workerCount: savedCounts.get(secondaryCompany) ?? 0 })),
        workArea: row.work_area ?? "", workContent: row.work_content ?? "",
        ...aerialVehicleFields(vehicles),
        usesFire: row.uses_fire, usesTachiuma: row.uses_tachiuma,
        tachiumaNotes: row.tachiuma_notes ?? "", notes: row.notes ?? "",
    };
}
