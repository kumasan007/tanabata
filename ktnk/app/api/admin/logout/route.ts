import { NextResponse } from "next/server";
import { adminCookieName } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
