import type { ScheduleSubmitInput, ScheduleWithSubcompanies } from "@/lib/types";
export function parseTachiumaValue(value?: string | null) {
    const text = value ?? "";
    const generatedCount = text.match(/^(.*)（希望\s*1台）$/);
    return { area: generatedCount ? generatedCount[1] : text, count: null };
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
        usesFire: row.uses_fire, fireArea: row.fire_area ?? "", usesTachiuma: row.uses_tachiuma,
        tachiumaNotes: tachiuma.area, tachiumaCount: tachiuma.count, notes: row.notes ?? "",
    };
}
