import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminFromRequest, createServerClient } from "@/lib/supabase";
import { saveScheduleSubmission } from "@/lib/schedule-service";
import { scheduleSubmitSchema } from "@/lib/validation";
import { invalidateScheduleData } from "@/lib/data-cache";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  if (!assertAdminFromRequest(request)) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  try {
    const body = await request.json();
    const id = z.string().uuid().safeParse(body.id);
    if (!id.success) return NextResponse.json({ error: "予定の指定が正しくありません。" }, { status: 400 });
    const db = createServerClient();
    const { data: existing, error } = await db.from("schedule_groups").select("id,work_date,primary_company").eq("id", id.data).maybeSingle();
    if (error) throw error;
    if (!existing) return NextResponse.json({ error: "予定は削除されています。一覧を更新してください。" }, { status: 404 });
    const parsed = scheduleSubmitSchema.safeParse({ ...body, startDate: existing.work_date, endDate: existing.work_date, primaryCompany: existing.primary_company, excludeWeekends: false, overwriteExisting: true });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    await saveScheduleSubmission(parsed.data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "予定の保存に失敗しました。入力内容を確認して再度お試しください。" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!assertAdminFromRequest(request)) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "予定の指定が正しくありません。" }, { status: 400 });
  try {
    const { data, error } = await createServerClient().from("schedule_groups").delete().eq("id", id.data).select("id");
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: "予定は既に削除されています。一覧を更新してください。" }, { status: 404 });
    invalidateScheduleData();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "予定の削除に失敗しました。" }, { status: 500 });
  }
}
