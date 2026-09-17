import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { getCompanyMaster } from "@/lib/companies";
import { getWorkCompletions, getScheduledCompletionCompanies } from "@/lib/work-completions";
import { parseLocalDate, toDateStringInTimeZone, todayInTokyoString } from "@/lib/utils";
import { invalidateWorkCompletionData } from "@/lib/data-cache";
const schema = z.object({
  date: z.string().refine((value) => Boolean(parseLocalDate(value)), "日付を選択してください。").optional(),
  automaticDate: z.boolean().default(false),
  primaryCompany: z.string().min(1), notes: z.string().trim().max(2000).default(""),
  expectedReportedAt: z.string().datetime({ offset: true }).optional(),
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
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "日付・会社・備考を確認してください。" }, { status: 400 });
    const now = new Date();
    const { primaryCompany, notes, automaticDate } = parsed.data;
    const date = automaticDate && !cancel ? toDateStringInTimeZone(now, "Asia/Tokyo") : parsed.data.date;
    if (!date) return NextResponse.json({ error: "報告日を確認してください。" }, { status: 400 });
    const expectedReportedAt = automaticDate && parsed.data.expectedReportedAt && toDateStringInTimeZone(new Date(parsed.data.expectedReportedAt), "Asia/Tokyo") !== date ? undefined : parsed.data.expectedReportedAt;
    const master = await getCompanyMaster();
    if (!master.primaryCompanies.includes(primaryCompany)) return NextResponse.json({ error: "一次会社を選択してください。" }, { status: 400 });
    if (!cancel && !(await getScheduledCompletionCompanies(date, primaryCompany)).has(primaryCompany)) {
      return NextResponse.json({ error: "その日に作業予定がある会社を選択してください。" }, { status: 400 });
    }
    const db = createServerClient();
    if (cancel && !expectedReportedAt) return NextResponse.json({ error: "取り消す報告を確認してください。" }, { status: 400 });
    const query = cancel
      ? db.from("work_completion_reports").delete().eq("work_date", date).eq("primary_company", primaryCompany).eq("reported_at", expectedReportedAt!)
      : expectedReportedAt
        ? db.from("work_completion_reports").update({ notes }).eq("work_date", date).eq("primary_company", primaryCompany).eq("reported_at", expectedReportedAt)
        : db.from("work_completion_reports").insert({ work_date: date, primary_company: primaryCompany, notes, reported_at: now.toISOString() });
    const { data, error } = await query.select().maybeSingle();
    if (error && error.code !== "23505") throw error;
    if (error || !data) {
      const reports = await getWorkCompletions(date, date, primaryCompany);
      return NextResponse.json({ error: reports.length ? "すでに作業終了報告をしています。" : "報告が取り消されています。再度確認してください。", report: reports[0] ?? null }, { status: 409 });
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
