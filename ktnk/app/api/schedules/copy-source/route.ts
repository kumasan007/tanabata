import { NextResponse } from "next/server";
import { getPreviousScheduleForCopy } from "@/lib/schedule-service";
import {
  addDays,
  parseLocalDate,
  todayInTokyoString,
  toDateString,
} from "@/lib/utils";
import { scheduleToCopyData } from "@/lib/schedule-copy";

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
    const source = scheduleToCopyData(row);
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
