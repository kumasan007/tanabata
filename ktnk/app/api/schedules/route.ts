import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteSchedule, getScheduleById, saveScheduleSubmission, ScheduleAlreadyExistsError, ScheduleChangedError } from "@/lib/schedule-service";
import { scheduleSubmitSchema } from "@/lib/validation";
import { mutationLimitResponse, publicMutationAllowed } from "@/lib/public-mutation-limit";
import { recordMutationSchema } from "@/lib/mutation-validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "予定の指定が正しくありません。" }, { status: 400 });
  try {
    const record = await getScheduleById(id.data);
    if (!record) return NextResponse.json({ error: "この予定は既に削除されています。" }, { status: 404 });
    return NextResponse.json({ record }, { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "予定を読み込めませんでした。" }, { status: 500 }); }
}

export async function POST(request: Request) {
  if (!await publicMutationAllowed(request, "schedule-write")) return mutationLimitResponse();
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
    if (error instanceof ScheduleChangedError) return NextResponse.json({ error: error.message }, { status: 409 });
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
  if (!await publicMutationAllowed(request, "schedule-write")) return mutationLimitResponse();
  const parsed = recordMutationSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "予定を読み込み直してから削除してください。" }, { status: 400 });
  try {
    if (!await deleteSchedule(parsed.data.id, parsed.data.expectedUpdatedAt)) return NextResponse.json({ error: "予定は既に削除されています。カレンダーを更新してください。" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ScheduleChangedError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "予定の削除に失敗しました。" }, { status: 500 });
  }
}
