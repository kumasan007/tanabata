import { NextResponse } from "next/server";
import { getPreviousScheduleForCopy } from "@/lib/schedule-service";
import {
  addDays,
  parseLocalDate,
  todayInTokyoString,
  toDateString,
} from "@/lib/utils";
import type { PreviousSchedule } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const company = new URL(request.url).searchParams.get("primaryCompany") ?? "";
  const workDate = new URL(request.url).searchParams.get("workDate") ?? "";
  if (!company.trim())
    return NextResponse.json(
      { error: "一次会社を選択してください。" },
      { status: 400 },
    );
  try {
    const today = todayInTokyoString();
    const target = parseLocalDate(workDate)
      ? workDate
      : toDateString(addDays(parseLocalDate(today)!, 1));
    const row = await getPreviousScheduleForCopy(company, target);
    const source: PreviousSchedule | null = row
      ? {
          workDate: row.work_date,
          primaryCount: row.primary_count,
          workArea: row.work_area,
          workContent: row.work_content,
          aerialWorkVehicleCount: row.aerial_work_vehicle_count,
          aerialWorkVehicleFloor: row.aerial_work_vehicle_floor,
          aerialWorkVehicles: row.aerialWorkVehicles?.map((vehicle) => ({ workArea: vehicle.work_area, vehicleCount: vehicle.vehicle_count })),
          subcompanies: row.subcompanies.map((sub) => ({
              secondaryCompany: sub.secondary_company ?? "",
              workerCount: sub.worker_count,
          })),
        }
      : null;
    return NextResponse.json(
      { source, today },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "前回の作業を取得できませんでした。" },
      { status: 500 },
    );
  }
}
