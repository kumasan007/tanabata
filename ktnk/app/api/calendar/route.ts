import { NextResponse } from "next/server";
import { getSchedules } from "@/lib/schedule-service";
import { getNewEntrants } from "@/lib/new-entrants";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("from");
    const dateTo = url.searchParams.get("to");
    const primaryCompany = url.searchParams.get("primaryCompany");
    const kind = url.searchParams.get("kind");
    const includeSchedules = kind !== "entrant";
    const includeEntrants = kind !== "schedule";
    const [schedules, entrants] = await Promise.all([
      includeSchedules
        ? getSchedules({ dateFrom, dateTo, primaryCompany, exactPrimaryCompany: Boolean(primaryCompany) })
        : Promise.resolve([]),
      includeEntrants
        ? getNewEntrants(dateFrom, dateTo, primaryCompany)
        : Promise.resolve([]),
    ]);
    return NextResponse.json({
      schedules,
      entrants,
      warning: "",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "カレンダーを取得できませんでした。" }, { status: 500 });
  }
}
