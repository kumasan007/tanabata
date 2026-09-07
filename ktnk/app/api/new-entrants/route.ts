import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";

const inputSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  primaryCompany: z.string().trim().min(1, "一次会社を選択してください。"),
  secondaryCompany: z.string().trim().min(1, "新規入場する会社を選択してください。"),
  isNewCompany: z.boolean().default(false),
  personCount: z.number().int().min(0),
  personNames: z.string().trim().max(1000).default(""),
  notes: z.string().trim().max(2000).default(""),
}).refine((value) => value.isNewCompany || value.personCount > 0, {
  message: "新規会社にチェックするか、新規入場者を1人以上入力してください。",
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    let query = createServerClient().from("new_entrant_records").select("*").order("entry_date").order("primary_company");
    if (from) query = query.gte("entry_date", from);
    if (to) query = query.lte("entry_date", to);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ records: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "新規入場予定を取得できませんでした。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const value = parsed.data;
    const { data, error } = await createServerClient().from("new_entrant_records").upsert({
      entry_date: value.entryDate,
      primary_company: value.primaryCompany,
      secondary_company: value.secondaryCompany,
      is_new_company: value.isNewCompany,
      person_count: value.personCount,
      person_names: value.personNames || null,
      notes: value.notes || null,
    }, { onConflict: "entry_date,primary_company,secondary_company" }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ record: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "新規入場予定を保存できませんでした。" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "削除対象が正しくありません。" }, { status: 400 });
  const { error } = await createServerClient().from("new_entrant_records").delete().eq("id", id.data);
  if (error) return NextResponse.json({ error: "削除できませんでした。" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
