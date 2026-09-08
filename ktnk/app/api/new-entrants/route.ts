import { NextResponse } from "next/server";
import { z } from "zod";
import { isWorkingDate } from "@/lib/utils";
import { ensureSecondaryCompany } from "@/lib/companies";
import { createServerClient } from "@/lib/supabase";
import { getNewEntrants } from "@/lib/new-entrants";
import { invalidateEntrantData } from "@/lib/data-cache";

const inputSchema = z.object({
  entryDate: z.string().refine(isWorkingDate, "日曜日は入力できません。月曜〜土曜を選択してください。"),
  primaryCompany: z.string().trim().min(1, "一次会社を選択してください。"),
  secondaryCompany: z.string().trim().min(1, "新規入場する会社を選択してください。"),
  personCount: z.number().int().min(1, "新規入場者を1人以上入力してください。"),
  personNames: z.string().trim().min(1, "氏名を入力してください。").max(1000, "氏名は1000文字以内で入力してください。"),
  nationalityStatus: z.enum(["japanese_only", "includes_foreign"], {
    message: "日本籍のみか、外国籍を含むかを選択してください。",
  }),
  notes: z.string().trim().max(2000).default(""),
});

const updateSchema = inputSchema.extend({ id: z.string().uuid() });

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const records = await getNewEntrants(from, to);
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json({ error: databaseErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const value = parsed.data;
    const primaryExists = await ensureSecondaryCompany(value.primaryCompany, value.secondaryCompany);
    if (!primaryExists) return NextResponse.json({ error: "一次会社が見つかりません。会社一覧を読み込み直してください。" }, { status: 404 });
    const { data, error } = await createServerClient().from("new_entrant_records").upsert({
      entry_date: value.entryDate,
      primary_company: value.primaryCompany,
      secondary_company: value.secondaryCompany,
      person_count: value.personCount,
      person_names: value.personNames,
      nationality_status: value.nationalityStatus,
      notes: value.notes || null,
    }, { onConflict: "entry_date,primary_company,secondary_company" }).select("*").single();
    if (error) throw error;
    invalidateEntrantData();
    return NextResponse.json({ record: data });
  } catch (error) {
    return NextResponse.json({ error: databaseErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const value = parsed.data;
    const primaryExists = await ensureSecondaryCompany(value.primaryCompany, value.secondaryCompany);
    if (!primaryExists) return NextResponse.json({ error: "一次会社が見つかりません。会社一覧を読み込み直してください。" }, { status: 404 });
    const { data, error } = await createServerClient().from("new_entrant_records").update({
      entry_date: value.entryDate,
      primary_company: value.primaryCompany,
      secondary_company: value.secondaryCompany,
      person_count: value.personCount,
      person_names: value.personNames,
      nationality_status: value.nationalityStatus,
      notes: value.notes || null,
    }).eq("id", value.id).select("*").single();
    if (error) throw error;
    invalidateEntrantData();
    return NextResponse.json({ record: data });
  } catch (error) {
    return NextResponse.json({ error: databaseErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "削除対象が正しくありません。" }, { status: 400 });
  const { error } = await createServerClient().from("new_entrant_records").delete().eq("id", id.data);
  if (error) return NextResponse.json({ error: "削除できませんでした。" }, { status: 500 });
  invalidateEntrantData();
  return NextResponse.json({ ok: true });
}

function databaseErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (code === "PGRST204" || code === "PGRST205" || code === "42P01" || code === "42703") {
    return "新規入場用の追加SQLがまだ実行されていません。";
  }
  return error instanceof Error ? error.message : "新規入場データを処理できませんでした。";
}
