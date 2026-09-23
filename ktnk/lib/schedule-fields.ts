import type { ScheduleSubmitInput, ScheduleWithSubcompanies } from "@/lib/types";
export function parseTachiumaValue(value?: string | null) {
    const text = value ?? "";
    const generatedCount = text.match(/^(.*)（希望\s*1台）$/);
    return { area: generatedCount ? generatedCount[1] : text };
}
export function scheduleToFormData(row: ScheduleWithSubcompanies, secondaryCompanies?: string[]): ScheduleSubmitInput {
    const savedCounts = new Map(row.subcompanies.map((sub) => [sub.secondary_company ?? "", sub.worker_count]));
    const tachiuma = parseTachiumaValue(row.tachiuma_notes);
    return {
        dates: [row.work_date], startDate: row.work_date, endDate: row.work_date, excludeWeekends: false,
        primaryCompany: row.primary_company, primaryCount: row.primary_count,
        currentSubcompanies: (secondaryCompanies ?? row.subcompanies.map((sub) => sub.secondary_company ?? ""))
            .map((secondaryCompany) => ({ secondaryCompany, workerCount: savedCounts.get(secondaryCompany) ?? 0 })),
        workArea: row.work_area ?? "", workContent: row.work_content ?? "",
        usesAerialWorkVehicle: row.uses_aerial_work_vehicle,
        aerialWorkVehicleNotes: row.aerial_work_vehicle_notes ?? "",
        aerialWorkVehicleRequests: equipmentRequests(row, "aerial_work_vehicle"),
        usesFire: row.uses_fire, fireArea: row.fire_area ?? "", usesTachiuma: row.uses_tachiuma,
        tachiumaNotes: tachiuma.area, tachiumaRequests: equipmentRequests(row, "tachiuma"), notes: row.notes ?? "",
    };
}

function equipmentRequests(row: ScheduleWithSubcompanies, type: "aerial_work_vehicle" | "tachiuma") {
    return (row.equipmentRequests ?? []).filter((item) => item.equipment_type === type).map((item) => ({ floorId: item.floor_id, floorName: Array.isArray(item.equipment_floor_master) ? item.equipment_floor_master[0]?.name ?? "" : item.equipment_floor_master?.name ?? "", count: item.requested_count }));
}
