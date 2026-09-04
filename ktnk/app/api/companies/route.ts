import { NextResponse } from "next/server";
import { getCompanyMaster } from "@/lib/companies";

export const runtime = "nodejs";

export async function GET() {
  try {
    const master = await getCompanyMaster();
    return NextResponse.json(master, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "会社マスタを取得できませんでした。",
      },
      { status: 500 },
    );
  }
}
