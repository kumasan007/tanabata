import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";

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
    const db = createServerClient();
    const { data: rows, error } = await db.from("company_master")
      .select("secondary_company,primary_trade_roles,sort_order")
      .eq("primary_company", primaryCompany).order("sort_order", { ascending: true });
    if (error) throw error;
    if (!rows?.length) return NextResponse.json({ error: "一次会社が見つかりません。会社一覧を読み込み直してください。" }, { status: 404 });
    if (!rows.some((row) => row.secondary_company === secondaryCompany)) {
      const { error: insertError } = await db.from("company_master").insert({
        primary_company: primaryCompany,
        secondary_company: secondaryCompany,
        primary_trade_roles: rows[0].primary_trade_roles ?? [],
        sort_order: Math.max(...rows.map((row) => row.sort_order)) + 1,
      });
      // The unique company-pair index also handles simultaneous registrations.
      if (insertError && insertError.code !== "23505") throw insertError;
    }
    return NextResponse.json({ secondaryCompany });
  } catch {
    return NextResponse.json({ error: "二次会社の追加に失敗しました。再度お試しください。" }, { status: 500 });
  }
}
