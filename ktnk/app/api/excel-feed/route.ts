import { NextResponse } from "next/server";
import { buildScheduleCsv, exportFileName } from "@/lib/export";
import { getSchedules, schedulesToExportRows } from "@/lib/schedule-service";
import { addDays, todayInTokyoString, parseLocalDate, toDateString } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") ?? "";
    const expectedToken = process.env.EXCEL_FEED_TOKEN;

    if (!expectedToken || token !== expectedToken) {
      return NextResponse.json({ error: "Excel同期用トークンが必要です。" }, { status: 401 });
    }

    const defaultDateFrom = todayInTokyoString();
    const defaultStart = parseLocalDate(defaultDateFrom);
    const defaultDateTo = defaultStart ? toDateString(addDays(defaultStart, 13)) : defaultDateFrom;
    const dateFrom = url.searchParams.get("dateFrom") || defaultDateFrom;
    const dateTo = url.searchParams.get("dateTo") || defaultDateTo;

    const schedules = await getSchedules({
      dateFrom,
      dateTo,
      primaryCompany: url.searchParams.get("primaryCompany"),
      secondaryCompany: url.searchParams.get("secondaryCompany"),
    });
    const rows = schedulesToExportRows(schedules);
    const csv = `\uFEFF${buildScheduleCsv(rows)}`;

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(
          exportFileName({ dateFrom, dateTo, format: "csv" }),
        )}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Excel同期用CSVの取得に失敗しました。",
      },
      { status: 500 },
    );
  }
}
