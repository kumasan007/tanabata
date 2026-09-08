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
  const status = params.get("status");
  const date = params.get("workDate") ?? "";
  if (
    !company.trim() ||
    !parseLocalDate(date) ||
    (status !== "work" && status !== "no_work")
  ) {
    return NextResponse.json(
      { error: "会社・作業日・作業区分を確認してください。" },
      { status: 400 },
    );
  }
  try {
    const todayDate = todayInTokyoString();
    const includeToday =
      params.get("includeToday") === "1" &&
      status === "work" &&
      date > todayDate;
    const [row, todayRow] = await Promise.all([
      getPreviousScheduleForCopy(company, status, date),
      includeToday
        ? getWorkScheduleOnDate(company, todayDate)
        : Promise.resolve(null),
    ]);
    return NextResponse.json(
      {
        previous: toCopyData(row, status === "work"),
        today: toCopyData(todayRow, true),
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

function toCopyData(
  row: ScheduleWithSubcompanies | null,
  work: boolean,
): PreviousSchedule | null {
  return row
    ? {
        workDate: row.work_date,
        primaryCount: work ? row.primary_count : row.next_primary_count,
        workArea: work ? row.work_area : row.next_work_area,
        workContent: work ? row.work_content : row.next_work_content,
        aerialWorkVehicleCount: work ? row.aerial_work_vehicle_count : null,
        aerialWorkVehicleFloor: work ? row.aerial_work_vehicle_floor : null,
        subcompanies: row.subcompanies
          .filter((sub) => sub.kind === (work ? "current" : "next_visit"))
          .map((sub) => ({
            secondaryCompany: sub.secondary_company ?? "",
            workerCount: sub.worker_count,
          })),
      }
    : null;
}
