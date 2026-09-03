import { NextResponse } from "next/server";
import { ADMIN_SESSION_SECONDS, adminCookieName, createAdminSessionToken, verifyAdminPassword } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };

    if (!verifyAdminPassword(body.password ?? "")) {
      return NextResponse.json({ error: "パスワードが違います。" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(adminCookieName(), createAdminSessionToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "ログインに失敗しました。",
      },
      { status: 500 },
    );
  }
}
