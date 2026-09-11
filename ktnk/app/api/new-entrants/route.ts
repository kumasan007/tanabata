import { NextResponse } from "next/server";
import { z } from "zod";
import { isWorkingDate } from "@/lib/utils";
import { ensureSecondaryCompanies, ensureSecondaryCompany } from "@/lib/companies";
import { createServerClient } from "@/lib/supabase";
import { getNewEntrants } from "@/lib/new-entrants";
import { invalidateEntrantData } from "@/lib/data-cache";

const personSchema = z.object({
  secondaryCompany: z.string().trim().max(200, "会社名は200文字以内で入力してください。"),
  personName: z.string().trim().min(1, "氏名を入力してください。").max(200, "氏名は200文字以内で入力してください。"),
  nationalityStatus: z.enum(["japanese_only", "includes_foreign"], { message: "日本籍か外国籍かを選択してください。" }),
  notes: z.string().trim().max(2000, "備考は2000文字以内で入力してください。").default(""),
});

const createSchema = z.object({
  entryDate: z.string().refine(isWorkingDate, "日曜日は入力できません。月曜〜土曜を選択してください。"),
  primaryCompany: z.string().trim().min(1, "一次会社を選択してください。"),
  people: z.array(personSchema).min(1, "新規入場者を1人以上追加してください。").max(200),
});

const updateSchema = personSchema.extend({
  id: z.string().uuid(),
  entryDate: z.string().refine(isWorkingDate, "日曜日は入力できません。月曜〜土曜を選択してください。"),
  primaryCompany: z.string().trim().min(1, "一次会社を選択してください。"),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return NextResponse.json({ records: await getNewEntrants(url.searchParams.get("from"), url.searchParams.get("to")) });
  } catch (error) {
    return NextResponse.json({ error: databaseErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const value = parsed.data;
    if (!await ensureSecondaryCompanies(value.primaryCompany, value.people.map((person) => person.secondaryCompany))) {
      return NextResponse.json({ error: "一次会社が見つかりません。会社一覧を読み込み直してください。" }, { status: 404 });
    }
    const { data, error } = await createServerClient().from("new_entrant_records").insert(value.people.map((person) => ({
      entry_date: value.entryDate, primary_company: value.primaryCompany, secondary_company: person.secondaryCompany,
      person_count: 1, person_names: person.personName, nationality_status: person.nationalityStatus, notes: person.notes || null,
    }))).select("id,entry_date,primary_company,secondary_company,person_count,person_names,nationality_status,notes,created_at,updated_at");
    if (error) throw error;
    invalidateEntrantData();
    return NextResponse.json({ records: data });
  } catch (error) {
    return NextResponse.json({ error: databaseErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const value = parsed.data;
    if (!await ensureSecondaryCompany(value.primaryCompany, value.secondaryCompany)) {
      return NextResponse.json({ error: "一次会社が見つかりません。会社一覧を読み込み直してください。" }, { status: 404 });
    }
    const { data, error } = await createServerClient().from("new_entrant_records").update({
      entry_date: value.entryDate, primary_company: value.primaryCompany, secondary_company: value.secondaryCompany,
      person_count: 1, person_names: value.personName, nationality_status: value.nationalityStatus, notes: value.notes || null,
    }).eq("id", value.id).select("id,entry_date,primary_company,secondary_company,person_count,person_names,nationality_status,notes,created_at,updated_at").single();
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
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (["PGRST204", "PGRST205", "42P01", "42703"].includes(code)) return "新規入場用の追加SQLがまだ実行されていません。";
  if (code === "23505") return "同じ会社へ複数人を登録するための追加SQLがまだ実行されていません。";
  return error instanceof Error ? error.message : "新規入場データを処理できませんでした。";
}
