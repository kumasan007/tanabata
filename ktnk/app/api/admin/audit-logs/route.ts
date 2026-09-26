import { NextResponse } from "next/server";

// Kept as a tiny compatibility endpoint so old open admin tabs fail clearly.
// The history table, triggers and UI are removed by the latest migration.
export function GET() {
  return NextResponse.json({ error: "操作履歴機能は廃止されました。" }, { status: 410 });
}

export function PATCH() {
  return NextResponse.json({ error: "操作履歴機能は廃止されました。" }, { status: 410 });
}
