import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { invalidateScheduleData } from "@/lib/data-cache";
import { isWorkingDate } from "@/lib/utils";
import { mutationLimitResponse, publicMutationAllowed } from "@/lib/public-mutation-limit";
import { expectedUpdatedAtSchema } from "@/lib/mutation-validation";
import { mutationErrorResponse } from "@/lib/mutation-error";

const schema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: expectedUpdatedAtSchema,
  originalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isWorkingDate, "月曜〜土曜の日付を選択してください。"),
});

export async function PATCH(request: Request) {
  if (!await publicMutationAllowed(request, "schedule-write")) return mutationLimitResponse();
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { id, originalDate, date, expectedUpdatedAt } = parsed.data;
    const { error } = await createServerClient().rpc("move_schedule_with_revision", {
      p_id: id, p_original_date: originalDate, p_date: date, p_expected_updated_at: expectedUpdatedAt,
    });
    if (error?.code === "23505") return NextResponse.json({ error: "変更先に同じ会社の予定があります。別の日付を選択してください。" }, { status: 409 });
    if (error) throw error;
    invalidateScheduleData();
    return NextResponse.json({ date });
  } catch (error) {
    return mutationErrorResponse(error, "日付の変更に失敗しました。");
  }
}
