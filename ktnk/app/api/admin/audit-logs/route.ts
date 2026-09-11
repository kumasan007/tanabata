import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminFromRequest, createAdminServerClient } from "@/lib/supabase";
import { invalidateAllOperationalData } from "@/lib/data-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const restoreSchema = z.object({
  id: z.coerce.number().int().positive(),
  force: z.boolean().optional().default(false),
});

function unauthorized() {
  return NextResponse.json({ error: "管理者ログインが必要です。" }, { status: 401 });
}

function errorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message
    : "操作履歴の処理に失敗しました。";
}

function hasNewerChange(error: unknown) {
  return error && typeof error === "object" && "message" in error
    && typeof error.message === "string" && error.message.includes("AUDIT_NEWER_CHANGE_EXISTS");
}

export async function GET(request: Request) {
  if (!assertAdminFromRequest(request)) return unauthorized();

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await createAdminServerClient()
      .from("audit_logs")
      .select("id,changed_at,transaction_id,table_name,operation,row_id,old_data,new_data,restored_at")
      .gte("changed_at", since)
      .order("changed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ logs: data ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!assertAdminFromRequest(request)) return unauthorized();

  try {
    const parsed = restoreSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "操作履歴IDが不正です。" }, { status: 400 });

    const { data, error } = await createAdminServerClient().rpc("restore_audit_change", {
      p_audit_id: parsed.data.id,
      p_force: parsed.data.force,
    });
    if (error) throw error;
    invalidateAllOperationalData();
    return NextResponse.json({ restored: data });
  } catch (error) {
    if (hasNewerChange(error)) {
      return NextResponse.json({
        error: "このデータには、選択した履歴より新しい変更があります。",
        code: "AUDIT_NEWER_CHANGE_EXISTS",
      }, { status: 409 });
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
