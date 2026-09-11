import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminFromRequest, createAdminServerClient } from "@/lib/supabase";
import { verifyAdminPassword } from "@/lib/admin-auth";
import { invalidateAllOperationalData } from "@/lib/data-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backupIdSchema = z.string().uuid();
const backupPayloadSchema = z.object({
  company_master: z.array(z.record(z.unknown())),
  schedule_groups: z.array(z.record(z.unknown())),
  schedule_subcompanies: z.array(z.record(z.unknown())),
  schedule_aerial_work_vehicles: z.array(z.record(z.unknown())).default([]),
  new_entrant_records: z.array(z.record(z.unknown())),
});

function unauthorized() {
  return NextResponse.json({ error: "管理者ログインが必要です。" }, { status: 401 });
}

function errorResponse(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : error instanceof Error
        ? error.message
        : "バックアップ操作に失敗しました。";
  return NextResponse.json(
    { error: message },
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
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await request.formData();
      if (!verifyAdminPassword(String(formData.get("password") ?? ""))) {
        return NextResponse.json({ error: "パスワードが違います。" }, { status: 401 });
      }
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "バックアップJSONを選択してください。" }, { status: 400 });
      }

      let imported: unknown;
      try {
        imported = JSON.parse(await file.text());
      } catch {
        return NextResponse.json({ error: "バックアップJSONを読み込めませんでした。" }, { status: 400 });
      }

      const parsed = z.object({ backup: z.object({ payload: backupPayloadSchema }) }).safeParse(imported);
      if (!parsed.success) {
        return NextResponse.json({ error: "対応していないバックアップJSONです。" }, { status: 400 });
      }

      const payload = parsed.data.backup.payload;
      const rowCounts = {
        company_master: payload.company_master.length,
        schedule_groups: payload.schedule_groups.length,
        schedule_subcompanies: payload.schedule_subcompanies.length,
        schedule_aerial_work_vehicles: payload.schedule_aerial_work_vehicles.length,
        new_entrant_records: payload.new_entrant_records.length,
      };
      const { data: safetyBackupId, error: safetyBackupError } = await db.rpc("create_data_backup", { p_source: "manual" });
      if (safetyBackupError) throw safetyBackupError;
      const { data: importedBackup, error: importError } = await db
        .from("data_backups")
        .insert({ source: "manual", schema_version: 2, row_counts: rowCounts, payload })
        .select("id")
        .single();
      if (importError) throw importError;
      const { data: restored, error: restoreError } = await db.rpc("restore_data_backup", { p_backup_id: importedBackup.id });
      if (restoreError) throw restoreError;
      invalidateAllOperationalData();
      return NextResponse.json({ imported: restored, safetyBackupId }, { status: 201 });
    }

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
    if (!verifyAdminPassword(typeof body?.password === "string" ? body.password : "")) {
      return NextResponse.json({ error: "パスワードが違います。" }, { status: 401 });
    }
    const id = backupIdSchema.safeParse(body?.id);
    if (!id.success) return NextResponse.json({ error: "バックアップIDが不正です。" }, { status: 400 });

    const db = createAdminServerClient();
    const { error: safetyBackupError } = await db.rpc("create_data_backup", { p_source: "manual" });
    if (safetyBackupError) throw safetyBackupError;
    const { data, error } = await db.rpc("restore_data_backup", { p_backup_id: id.data });
    if (error) throw error;
    invalidateAllOperationalData();
    return NextResponse.json({ restored: data });
  } catch (error) {
    return errorResponse(error);
  }
}

