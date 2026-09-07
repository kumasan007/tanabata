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
    const [schedules, entrants] = await Promise.all([
      getSchedules({ dateFrom, dateTo, primaryCompany }),
      getNewEntrants(dateFrom, dateTo, primaryCompany),
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
