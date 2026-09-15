import { NextResponse } from "next/server";
import { getSchedules } from "@/lib/schedule-service";
import { getCalendarSchedules, getCalendarEntrants } from "@/lib/calendar-summary";
import { getNewEntrants } from "@/lib/new-entrants";

import { getWorkCompletions } from "@/lib/work-completions";
import { parseLocalDate } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("from");
    const dateTo = url.searchParams.get("to");
    const primaryCompany = url.searchParams.get("primaryCompany");
    if ((dateFrom && !parseLocalDate(dateFrom)) || (dateTo && !parseLocalDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) {
      return NextResponse.json({ error: "表示する日付の範囲を確認してください。" }, { status: 400 });
    }
    const kind = url.searchParams.get("kind");
    const includeSchedules = kind !== "entrant";
    const includeEntrants = kind !== "schedule";
    const summary = url.searchParams.get("view") === "summary";
    let completionWarning = "";
    const [schedules, entrants, completions] = await Promise.all([
      includeSchedules
        ? summary ? getCalendarSchedules(dateFrom ?? "", dateTo ?? "", primaryCompany?.trim() ?? "")
          : getSchedules({ dateFrom, dateTo, primaryCompany, exactPrimaryCompany: Boolean(primaryCompany) })
        : Promise.resolve([]),
      includeEntrants
        ? summary ? getCalendarEntrants(dateFrom ?? "", dateTo ?? "", primaryCompany?.trim() ?? "")
          : getNewEntrants(dateFrom, dateTo, primaryCompany)
        : Promise.resolve([]),
      kind === "schedule" || kind === "entrant" ? Promise.resolve([])
        : getWorkCompletions(dateFrom, dateTo, primaryCompany, summary).catch((error) => { completionWarning = error.message; return []; }),
    ]);
    return NextResponse.json({
      schedules,
      entrants,
      completions,
      warning: completionWarning,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "カレンダーを取得できませんでした。" }, { status: 500 });
  }
}
