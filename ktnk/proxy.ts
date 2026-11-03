import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const destination = process.env.KTNK_REDIRECT_URL;
  if (!destination) return NextResponse.next();

  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  let target: URL;
  try {
    target = new URL(destination);
    if (
      target.origin !== "https://crewstack.jp" || target.username || target.password ||
      !/^\/w\/[0-9a-f-]{36}\/$/.test(target.pathname) || target.search ||
      !/^#access=[0-9a-f]{64}$/.test(target.hash)
    ) throw new Error("Invalid destination");
  } catch {
    return NextResponse.json({ error: "移行先の設定を確認してください。" }, { status: 503, headers });
  }

  if (
    request.nextUrl.pathname === "/api" || request.nextUrl.pathname.startsWith("/api/") ||
    !["GET", "HEAD"].includes(request.method)
  ) {
    return NextResponse.json({ error: "旧サイトの受付は終了しました。新しいサイトをご利用ください。" }, { status: 410, headers });
  }

  return NextResponse.redirect(target, { status: 307, headers });
}
