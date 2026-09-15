import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteSchedule, saveScheduleSubmission, ScheduleAlreadyExistsError } from "@/lib/schedule-service";
import { scheduleSubmitSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = scheduleSubmitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.errors[0]?.message ?? "入力内容を確認してください。",
          issues: parsed.error.errors,
        },
        { status: 400 },
      );
    }

    const id = z.string().uuid().optional().safeParse(body.id);
    if (!id.success) return NextResponse.json({ error: "予定の指定が正しくありません。" }, { status: 400 });
    const result = await saveScheduleSubmission(parsed.data, id.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ScheduleAlreadyExistsError) {
      return NextResponse.json(
        {
          error: "同じ日・一次会社の作業内容が既に入力されています。",
          code: "SCHEDULE_ALREADY_EXISTS",
          dates: error.dates,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "予定の登録に失敗しました。",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "予定の指定が正しくありません。" }, { status: 400 });
  try {
    if (!await deleteSchedule(id.data)) return NextResponse.json({ error: "予定は既に削除されています。カレンダーを更新してください。" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "予定の削除に失敗しました。" }, { status: 500 });
  }
}
