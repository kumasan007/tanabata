import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { getWorkCompletions } from "@/lib/work-completions";
import { parseLocalDate, toDateStringInTimeZone, todayInTokyoString } from "@/lib/utils";
import { invalidateWorkCompletionData } from "@/lib/data-cache";
import { mutationLimitResponse, publicMutationAllowed } from "@/lib/public-mutation-limit";
const schema = z.object({
  date: z.string().refine((value) => Boolean(parseLocalDate(value)), "日付を選択してください。").optional(),
  automaticDate: z.boolean().default(false),
  primaryCompany: z.string().min(1), notes: z.string().trim().max(2000).default(""),
  expectedReportedAt: z.string().datetime({ offset: true }).optional(),
  expectedRevision: z.number().int().positive().optional(),
});
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const date = params.get("date") || todayInTokyoString();
    if (!date || !parseLocalDate(date)) return NextResponse.json({ error: "日付を選択してください。" }, { status: 400 });
    return NextResponse.json({ reports: await getWorkCompletions(date, date, params.get("primaryCompany")) });
  } catch (error) { return failure(error); }
}
async function mutate(request: Request, cancel: boolean) {
  if (!await publicMutationAllowed(request, "completion-write")) return mutationLimitResponse();
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "日付・会社・備考を確認してください。" }, { status: 400 });
    const now = new Date();
    const { primaryCompany, notes, automaticDate } = parsed.data;
    const date = automaticDate && !cancel ? toDateStringInTimeZone(now, "Asia/Tokyo") : parsed.data.date;
    if (!date) return NextResponse.json({ error: "報告日を確認してください。" }, { status: 400 });
    const expectedReportedAt = automaticDate && parsed.data.expectedReportedAt && toDateStringInTimeZone(new Date(parsed.data.expectedReportedAt), "Asia/Tokyo") !== date ? undefined : parsed.data.expectedReportedAt;
    const expectedRevision = expectedReportedAt ? parsed.data.expectedRevision : undefined;
    if (expectedReportedAt && !expectedRevision) return NextResponse.json({ error: "報告を読み込み直してから操作してください。" }, { status: 400 });
    const db = createServerClient();
    if (cancel && !expectedReportedAt) return NextResponse.json({ error: "取り消す報告を確認してください。" }, { status: 400 });
    const { data, error } = await db.rpc("save_work_completion_atomically", {
      p_date: date, p_primary: primaryCompany, p_notes: notes, p_cancel: cancel,
      p_reported_at: now.toISOString(), p_expected_reported_at: expectedReportedAt ?? null,
      p_expected_revision: expectedRevision ?? null,
    });
    if (error?.code === "PGRST202" || error?.code === "42883") {
      return NextResponse.json({ error: "終了報告用の追加SQL（202610010003_completion_atomic.sql）を実行してください。" }, { status: 503 });
    }
    if (error?.message === "COMPANY_NOT_FOUND" || error?.message === "SCHEDULE_NOT_FOUND") {
      return NextResponse.json({ error: "会社一覧・作業予定が変更されています。最新の内容を確認してください。" }, { status: 409 });
    }
    if (error && error.code !== "23505") throw error;
    if (error || !data) {
      invalidateWorkCompletionData();
      const reports = await getWorkCompletions(date, date, primaryCompany);
      return NextResponse.json({ error: "報告状況が変更されています。最新の内容を確認してください。", report: reports[0] ?? null }, { status: 409 });
    }
    invalidateWorkCompletionData();
    return NextResponse.json({ report: cancel ? null : data });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "作業終了報告を保存できませんでした。" }, { status: 500 });
}
export async function POST(request: Request) { return mutate(request, false); }
export async function DELETE(request: Request) { return mutate(request, true); }
