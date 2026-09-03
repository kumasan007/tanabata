import { NextResponse } from "next/server";
import { assertAdminFromRequest } from "@/lib/supabase";
import { getSchedules, saveScheduleSubmission, schedulesToExportRows } from "@/lib/schedule-service";
import { scheduleSubmitSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = scheduleSubmitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.errors[0]?.message ?? "入力内容を確認してください。",
          issues: parsed.error.errors,
        },
        { status: 400 },
      );
    }

    const result = await saveScheduleSubmission(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "予定の登録に失敗しました。",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const admin = await assertAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const schedules = await getSchedules({
      dateFrom: url.searchParams.get("dateFrom"),
      dateTo: url.searchParams.get("dateTo"),
      primaryCompany: url.searchParams.get("primaryCompany"),
      secondaryCompany: url.searchParams.get("secondaryCompany"),
    });

    return NextResponse.json({
      schedules,
      rows: schedulesToExportRows(schedules),
      count: schedules.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "予定の取得に失敗しました。",
      },
      { status: 500 },
    );
  }
}
