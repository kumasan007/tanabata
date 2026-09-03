import { NextResponse } from "next/server";
import { getScheduleSummariesByPrimaryCompany } from "@/lib/schedule-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const primaryCompany = url.searchParams.get("primaryCompany") ?? "";

    if (!primaryCompany) {
      return NextResponse.json({ summaries: [] });
    }

    const summaries = await getScheduleSummariesByPrimaryCompany(primaryCompany);
    return NextResponse.json({ summaries });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "記入済み情報を取得できませんでした。",
      },
      { status: 500 },
    );
  }
}
