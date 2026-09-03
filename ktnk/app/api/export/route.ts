import { NextResponse } from "next/server";
import { buildScheduleCsv, buildScheduleWorkbook, exportFileName } from "@/lib/export";
import { getSchedules, schedulesToExportRows } from "@/lib/schedule-service";
import { assertAdminFromRequest } from "@/lib/supabase";
import type { ScheduleStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await assertAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");

    const schedules = await getSchedules({
      dateFrom,
      dateTo,
      status: parseStatus(url.searchParams.get("status")),
      primaryCompany: url.searchParams.get("primaryCompany"),
      secondaryCompany: url.searchParams.get("secondaryCompany"),
    });
    const rows = schedulesToExportRows(schedules);
    const filename = exportFileName({ dateFrom, dateTo, format });

    if (format === "csv") {
      const csv = `\uFEFF${buildScheduleCsv(rows)}`;
      return new NextResponse(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": contentDisposition(filename),
        },
      });
    }

    const buffer = await buildScheduleWorkbook(rows);
    return new NextResponse(buffer, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": contentDisposition(filename),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "出力に失敗しました。",
      },
      { status: 500 },
    );
  }
}

function contentDisposition(filename: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function parseStatus(value: string | null): ScheduleStatus | null {
  return value === "work" || value === "no_work" ? value : null;
}
