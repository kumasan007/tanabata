import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureSecondaryCompany } from "@/lib/companies";

export const runtime = "nodejs";
const inputSchema = z.object({
  primaryCompany: z.string().trim().min(1).max(200),
  secondaryCompany: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "会社名を入力してください。" }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "一次会社を選択し、二次会社名を200文字以内で入力してください。" }, { status: 400 });
  const { primaryCompany, secondaryCompany } = parsed.data;
  try {
    const primaryExists = await ensureSecondaryCompany(primaryCompany, secondaryCompany);
    if (!primaryExists) return NextResponse.json({ error: "一次会社が見つかりません。会社一覧を読み込み直してください。" }, { status: 404 });
    return NextResponse.json({ secondaryCompany });
  } catch {
    return NextResponse.json({ error: "二次会社の追加に失敗しました。再度お試しください。" }, { status: 500 });
  }
}
