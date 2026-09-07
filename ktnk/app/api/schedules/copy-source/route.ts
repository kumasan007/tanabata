import { NextResponse } from "next/server";
import {
  getNextScheduleForCopy,
  getPreviousScheduleForCopy,
} from "@/lib/schedule-service";
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
  if (!company.trim())
    return NextResponse.json(
      { error: "一次会社を選択してください。" },
      { status: 400 },
    );
  try {
    const today = todayInTokyoString();
    // Prefer the latest work day up to today, then fall back to the nearest future plan.
    const tomorrow = toDateString(addDays(parseLocalDate(today)!, 1));
    const previous = await getPreviousScheduleForCopy(company, "work", tomorrow);
    const row =
      previous ?? await getNextScheduleForCopy(company, "work", tomorrow);
    const source: PreviousSchedule | null = row
      ? {
          workDate: row.work_date,
          primaryCount: row.primary_count,
          workArea: row.work_area,
          workContent: row.work_content,
          subcompanies: row.subcompanies
            .filter((sub) => sub.kind === "current")
            .map((sub) => ({
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
