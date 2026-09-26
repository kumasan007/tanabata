import { NextResponse } from "next/server";
import { ADMIN_SESSION_SECONDS, adminCookieName, createAdminSessionToken, verifyAdminPassword } from "@/lib/admin-auth";
import { clearLoginFailures, loginAllowed, recordLoginFailure } from "@/lib/login-rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limit = await loginAllowed(request);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "ログイン試行が多すぎます。15分後にもう一度お試しください。" },
        { status: 429, headers: { "retry-after": "900" } },
      );
    }
    const body = (await request.json()) as { password?: string; remember?: boolean };

    if (!verifyAdminPassword(body.password ?? "")) {
      await recordLoginFailure(limit.key);
      return NextResponse.json({ error: "パスワードが違います。" }, { status: 401 });
    }
    await clearLoginFailures(limit.key);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(adminCookieName(), createAdminSessionToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      ...(body.remember !== false ? { maxAge: ADMIN_SESSION_SECONDS } : {}),
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
