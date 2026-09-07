import { NextResponse } from "next/server";
import { getSchedules } from "@/lib/schedule-service";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("from");
    const dateTo = url.searchParams.get("to");
    const primaryCompany = url.searchParams.get("primaryCompany");
    const schedules = await getSchedules({ dateFrom, dateTo, primaryCompany });
    let entrantsQuery = createServerClient().from("new_entrant_records").select("*").order("entry_date");
    if (dateFrom) entrantsQuery = entrantsQuery.gte("entry_date", dateFrom);
    if (dateTo) entrantsQuery = entrantsQuery.lte("entry_date", dateTo);
    if (primaryCompany) entrantsQuery = entrantsQuery.eq("primary_company", primaryCompany);
    const { data: entrants, error } = await entrantsQuery;
    if (error) throw error;
    return NextResponse.json({ schedules, entrants: entrants ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "カレンダーを取得できませんでした。" }, { status: 500 });
  }
}
