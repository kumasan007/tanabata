import { NextResponse } from "next/server";
import { getAdminCookieFromRequest, verifyAdminSessionToken } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json({
    authenticated: verifyAdminSessionToken(getAdminCookieFromRequest(request)),
  });
}
