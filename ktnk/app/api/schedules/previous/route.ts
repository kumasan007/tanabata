import { NextResponse } from "next/server";
import {
  getPreviousScheduleForCopy,
  getWorkScheduleOnDate,
} from "@/lib/schedule-service";
import { parseLocalDate, todayInTokyoString } from "@/lib/utils";
import type { PreviousSchedule, ScheduleWithSubcompanies } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const company = params.get("primaryCompany") ?? "";
  const date = params.get("workDate") ?? "";
  if (!company.trim() || !parseLocalDate(date)) {
    return NextResponse.json(
      { error: "会社・作業日を確認してください。" },
      { status: 400 },
    );
  }
  try {
    const todayDate = todayInTokyoString();
    const includeToday =
      params.get("includeToday") === "1" &&
      date > todayDate;
    const [row, todayRow] = await Promise.all([
      getPreviousScheduleForCopy(company, date),
      includeToday
        ? getWorkScheduleOnDate(company, todayDate)
        : Promise.resolve(null),
    ]);
    return NextResponse.json(
      {
        previous: toCopyData(row),
        today: toCopyData(todayRow),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "コピー元の予定を取得できませんでした。" },
      { status: 500 },
    );
  }
}

function toCopyData(row: ScheduleWithSubcompanies | null): PreviousSchedule | null {
  return row
    ? {
        workDate: row.work_date,
        primaryCount: row.primary_count,
        workArea: row.work_area,
        workContent: row.work_content,
        aerialWorkVehicleCount: row.aerial_work_vehicle_count,
        aerialWorkVehicleFloor: row.aerial_work_vehicle_floor,
        subcompanies: row.subcompanies.map((sub) => ({
            secondaryCompany: sub.secondary_company ?? "",
            workerCount: sub.worker_count,
        })),
      }
    : null;
}
