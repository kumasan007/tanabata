import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminFromRequest, createAdminServerClient } from "@/lib/supabase";
import { resolveVehicleAssignments } from "@/lib/equipment-assignment";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return NextResponse.json({ error: "日付が正しくありません。" }, { status: 400 });
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return NextResponse.json({ error: "機材情報を取得するためのサーバー設定が不足しています。SUPABASE_URL と SUPABASE_SECRET_KEY（または SUPABASE_SERVICE_ROLE_KEY）を設定してください。" }, { status: 503 });
  }
  try {
    const db = createAdminServerClient();
    const results = await Promise.all([
      db.from("equipment_floor_master").select("id,name,sort_order").order("sort_order", { ascending: false }),
      db.from("aerial_work_vehicles").select("id,vehicle_number,notes,sort_order,floor_id,assigned_company,updated_at").order("sort_order").order("vehicle_number"),
      db.from("schedule_equipment_requests").select("equipment_type,floor_id,requested_count,schedule_groups!inner(primary_company,work_date)").eq("schedule_groups.work_date", date),
      db.from("equipment_movements").select("vehicle_id,to_floor_id,to_company,work_date,moved_at").not("work_date", "is", null).lte("work_date", date).order("work_date", { ascending: false }).order("moved_at", { ascending: false }),
      db.from("tachiuma_units").select("id,name,notes,sort_order,floor_id,updated_at").order("sort_order").order("name"),
    ]);
    const error = results.find(result => result.error)?.error;
    if (error) throw error;
    const requests = (results[2].data ?? []).map(row => {
        const group = Array.isArray(row.schedule_groups) ? row.schedule_groups[0] : row.schedule_groups;
        return { equipment_type: row.equipment_type, floor_id: row.floor_id, requested_count: row.requested_count, company: group.primary_company };
      });
    return NextResponse.json({
      canEdit: assertAdminFromRequest(request), floors: results[0].data,
      vehicles: resolveVehicleAssignments(results[1].data ?? [], requests, results[3].data ?? [], date), tachiumas: results[4].data ?? [], requests,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(code)
      ? "機材管理に必要なテーブル・項目を確認できません。フロア希望用SQLと機材配置用SQLの適用状況を確認してください。"
      : code === "42501" || code === "PGRST301" || code === "PGRST302"
        ? "機材情報の取得権限を確認できません。Supabaseのサーバー用キーの設定を確認してください。"
        : "機材情報を取得できませんでした。Supabaseの接続先・サーバー用キーを確認し、再度更新してください。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const uuid = z.string().uuid();
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_vehicle"), vehicleId: uuid.nullable(), number: z.string().trim().min(1).max(30), notes: z.string().trim().max(500), floorId: uuid, company: z.string().trim().min(1).max(200).nullable(), expected: z.string().datetime({ offset: true }).nullable() }),
  z.object({ action: z.literal("reorder_vehicles"), vehicleIds: z.array(uuid).max(500) }),
  z.object({ action: z.literal("delete_vehicle"), vehicleId: uuid, expected: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal("register_vehicle"), floorId: uuid, number: z.string().trim().min(1).max(30) }),
  z.object({ action: z.literal("move_vehicle"), floorId: uuid, vehicleId: uuid, expected: z.string().datetime({ offset: true }), company: z.string().trim().min(1).max(200).nullable(), date: z.string().date() }),
  z.object({ action: z.literal("set_stock"), floorId: uuid, quantity: z.number().int().min(0).max(9999), notes: z.string().trim().max(500), expected: z.string().nullable() }),
  z.object({ action: z.literal("save_tachiuma"), unitId: uuid.nullable(), name: z.string().trim().min(1).max(50), notes: z.string().trim().max(500), floorId: uuid, expected: z.string().datetime({ offset: true }).nullable() }),
  z.object({ action: z.literal("delete_tachiuma"), unitId: uuid, expected: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal("reorder_tachiumas"), unitIds: z.array(uuid).max(1000) }),
  z.object({ action: z.literal("move_stock"), floorId: uuid, fromFloorId: uuid, quantity: z.number().int().min(1).max(9999), expected: z.string().min(1) }),
]);

export async function POST(request: Request) {
  if (!assertAdminFromRequest(request)) return NextResponse.json({ error: "社員ログインが必要です。" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "入力内容を確認してください。" }, { status: 400 });
  const value = parsed.data;
  const db = createAdminServerClient();
  const { error } = value.action === "save_vehicle" ? await db.rpc("save_equipment_vehicle", {
    p_vehicle: value.vehicleId, p_number: value.number, p_notes: value.notes, p_floor: value.floorId, p_company: value.company, p_expected: value.expected,
  }) : value.action === "reorder_vehicles" ? await db.rpc("reorder_equipment_vehicles", {
    p_ids: value.vehicleIds,
  }) : value.action === "delete_vehicle" ? await db.rpc("delete_equipment_vehicle", {
    p_vehicle: value.vehicleId, p_expected: value.expected,
  }) : value.action === "move_vehicle" ? await db.rpc("assign_equipment_vehicle_for_date", {
    p_vehicle: value.vehicleId, p_floor: value.floorId, p_company: value.company, p_date: value.date, p_expected: value.expected,
  }) : value.action === "set_stock" ? await db.rpc("save_tachiuma_stock", {
    p_floor: value.floorId, p_quantity: value.quantity, p_notes: value.notes, p_expected: value.expected,
  }) : value.action === "save_tachiuma" ? await db.rpc("save_tachiuma_unit", {
    p_unit: value.unitId, p_name: value.name, p_notes: value.notes, p_floor: value.floorId, p_expected: value.expected,
  }) : value.action === "delete_tachiuma" ? await db.rpc("delete_tachiuma_unit", {
    p_unit: value.unitId, p_expected: value.expected,
  }) : value.action === "reorder_tachiumas" ? await db.rpc("reorder_tachiuma_units", {
    p_ids: value.unitIds,
  }) : await db.rpc("update_equipment_position", {
    p_action: value.action, p_floor: value.floorId,
    p_vehicle: "vehicleId" in value ? value.vehicleId : null,
    p_number: "number" in value ? value.number : null,
    p_from: "fromFloorId" in value ? value.fromFloorId : null,
    p_quantity: "quantity" in value ? value.quantity : null,
    p_expected: "expected" in value ? value.expected : null,
  });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "その号車は登録済みです。" : error.code === "P0001" ? error.message : "保存できませんでした。更新して再度お試しください。" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
