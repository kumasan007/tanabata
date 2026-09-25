import { NextResponse } from "next/server";
import { assertAdminFromRequest } from "@/lib/supabase";

export async function GET(request: Request) {
  let authenticated = false;
  try { authenticated = assertAdminFromRequest(request); } catch { /* Invalid or unconfigured session. */ }
  return NextResponse.json({ authenticated }, { headers: { "Cache-Control": "no-store" } });
}
