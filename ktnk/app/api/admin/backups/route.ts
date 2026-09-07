import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminFromRequest, createAdminServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backupIdSchema = z.string().uuid();

function unauthorized() {
  return NextResponse.json({ error: "管理者ログインが必要です。" }, { status: 401 });
}

function errorResponse(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "バックアップ操作に失敗しました。" },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  if (!assertAdminFromRequest(request)) return unauthorized();

  try {
    const db = createAdminServerClient();
    const url = new URL(request.url);
    const requestedId = url.searchParams.get("id");

    if (requestedId) {
      const id = backupIdSchema.safeParse(requestedId);
      if (!id.success) return NextResponse.json({ error: "バックアップIDが不正です。" }, { status: 400 });
      const { data, error } = await db
        .from("data_backups")
        .select("id,created_at,backup_date,source,schema_version,row_counts,payload")
        .eq("id", id.data)
        .single();
      if (error) throw error;

      const body = JSON.stringify({
        exportedAt: new Date().toISOString(),
        backup: data,
      }, null, 2);
      return new NextResponse(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="ktnk-backup-${data.backup_date}.json"`,
          "cache-control": "no-store",
        },
      });
    }

    const { data, error } = await db
      .from("data_backups")
      .select("id,created_at,backup_date,source,schema_version,row_counts")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ backups: data ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!assertAdminFromRequest(request)) return unauthorized();

  try {
    const db = createAdminServerClient();
    const { data, error } = await db.rpc("create_data_backup", { p_source: "manual" });
    if (error) throw error;
    return NextResponse.json({ id: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  if (!assertAdminFromRequest(request)) return unauthorized();

  try {
    const body = await request.json();
    const id = backupIdSchema.safeParse(body?.id);
    if (!id.success) return NextResponse.json({ error: "バックアップIDが不正です。" }, { status: 400 });

    const db = createAdminServerClient();
    const { error: safetyBackupError } = await db.rpc("create_data_backup", { p_source: "manual" });
    if (safetyBackupError) throw safetyBackupError;
    const { data, error } = await db.rpc("restore_data_backup", { p_backup_id: id.data });
    if (error) throw error;
    return NextResponse.json({ restored: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  if (!assertAdminFromRequest(request)) return unauthorized();

  try {
    const id = backupIdSchema.safeParse(new URL(request.url).searchParams.get("id"));
    if (!id.success) return NextResponse.json({ error: "バックアップIDが不正です。" }, { status: 400 });

    const { error } = await createAdminServerClient().from("data_backups").delete().eq("id", id.data);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
