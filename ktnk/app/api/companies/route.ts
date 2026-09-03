import { NextResponse } from "next/server";
import { getCompanyMaster } from "@/lib/companies";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  try {
    const master = await getCompanyMaster(force);
    return NextResponse.json(master);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "会社CSVを取得できませんでした。",
      },
      { status: 502 },
    );
  }
}
