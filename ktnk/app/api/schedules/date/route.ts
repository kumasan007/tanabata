import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { invalidateScheduleData } from "@/lib/data-cache";
import { isWorkingDate } from "@/lib/utils";

const schema = z.object({
  id: z.string().uuid(),
  originalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isWorkingDate, "月曜〜土曜の日付を選択してください。"),
});

export async function PATCH(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { id, originalDate, date } = parsed.data;
    const { data, error } = await createServerClient().from("schedule_groups")
      .update({ work_date: date }).eq("id", id).eq("work_date", originalDate).select("id").maybeSingle();
    if (error?.code === "23505") return NextResponse.json({ error: "変更先に同じ会社の予定があります。別の日付を選択してください。" }, { status: 409 });
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "予定が変更または削除されています。画面を更新してください。" }, { status: 409 });
    invalidateScheduleData();
    return NextResponse.json({ date });
  } catch {
    return NextResponse.json({ error: "日付の変更に失敗しました。" }, { status: 500 });
  }
}
