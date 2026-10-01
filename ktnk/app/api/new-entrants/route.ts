import { NextResponse } from "next/server";
import { z } from "zod";
import { isWorkingDate } from "@/lib/utils";
import { createServerClient } from "@/lib/supabase";
import { calendarQueryRange } from "@/lib/calendar-dates";
import { getNewEntrants } from "@/lib/new-entrants";
import { invalidateEntrantData, invalidateCompanyData } from "@/lib/data-cache";
import { mutationLimitResponse, publicMutationAllowed } from "@/lib/public-mutation-limit";
import { expectedUpdatedAtSchema, recordMutationSchema } from "@/lib/mutation-validation";
import { mutationErrorResponse } from "@/lib/mutation-error";

const personSchema = z.object({
  id: z.string().uuid().optional(),
  secondaryCompany: z.string().trim().max(200, "会社名は200文字以内で入力してください。"),
  registerSecondaryCompany: z.boolean().default(false),
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
  expectedUpdatedAt: expectedUpdatedAtSchema,
  entryDate: z.string().refine(isWorkingDate, "日曜日は入力できません。月曜〜土曜を選択してください。"),
  primaryCompany: z.string().trim().min(1, "一次会社を選択してください。"),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedId = url.searchParams.get("id");
    if (requestedId) {
      const id = z.string().uuid().safeParse(requestedId);
      if (!id.success) return NextResponse.json({ error: "入場者の指定が正しくありません。" }, { status: 400 });
      const { data, error } = await createServerClient().from("new_entrant_records").select("*").eq("id", id.data).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "この入場者は既に削除されています。" }, { status: 404 });
      return NextResponse.json({ record: data }, { headers: { "cache-control": "no-store" } });
    }
    const range = calendarQueryRange(url.searchParams.get("from"), url.searchParams.get("to"));
    if (!range) return NextResponse.json({ error: "日付の範囲を366日以内で指定してください。" }, { status: 400 });
    return NextResponse.json({ records: await getNewEntrants(range.from, range.to, url.searchParams.get("primaryCompany")) });
  } catch (error) {
    return NextResponse.json({ error: databaseErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!await publicMutationAllowed(request, "entrant-write")) return mutationLimitResponse();
  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const { entryDate, primaryCompany, people } = parsed.data;
    const { data, error } = await createServerClient().rpc("save_new_entrants_atomically", {
      p_date: entryDate, p_primary: primaryCompany, p_people: people, p_expected_updated_at: null,
    });
    if (error) throw error;
    invalidateEntrantData(); invalidateCompanyData();
    return NextResponse.json(data);
  } catch (error) {
    return mutationErrorResponse(error, "新規入場を登録できませんでした。入力内容は残っています。もう一度お試しください。");
  }
}

export async function PATCH(request: Request) {
  if (!await publicMutationAllowed(request, "entrant-write")) return mutationLimitResponse();
  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const { entryDate, primaryCompany, expectedUpdatedAt, ...person } = parsed.data;
    const { data, error } = await createServerClient().rpc("save_new_entrants_atomically", {
      p_date: entryDate, p_primary: primaryCompany, p_people: [person], p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) throw error;
    invalidateEntrantData(); invalidateCompanyData();
    return NextResponse.json({ record: data?.records?.[0] });
  } catch (error) {
    return mutationErrorResponse(error, "新規入場の変更を保存できませんでした。");
  }
}

export async function DELETE(request: Request) {
  if (!await publicMutationAllowed(request, "entrant-write")) return mutationLimitResponse();
  const parsed = recordMutationSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "最新の入場者情報を読み直してください。" }, { status: 400 });
  try {
    const { data, error } = await createServerClient().rpc("delete_operational_record", {
      p_table: "new_entrant_records", p_id: parsed.data.id, p_expected_updated_at: parsed.data.expectedUpdatedAt,
    });
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "この入場者は既に削除されています。" }, { status: 404 });
    invalidateEntrantData();
    return NextResponse.json({ ok: true });
  } catch (error) { return mutationErrorResponse(error, "削除できませんでした。"); }
}

function databaseErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (["PGRST204", "PGRST205", "42P01", "42703"].includes(code)) return "新規入場用の追加SQLがまだ実行されていません。";
  if (code === "23505") return "同じ会社へ複数人を登録するための追加SQLがまだ実行されていません。";
  return error instanceof Error ? error.message : "新規入場データを処理できませんでした。";
}
