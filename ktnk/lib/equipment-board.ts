import type { EquipmentFloorRow, EquipmentType } from "./types";
import { createAdminServerClient } from "./supabase";
import { resolveVehicleAssignments } from "./equipment-assignment";
import { orderByFloor } from "./equipment-order";

export type EquipmentVehicle = { id: string; vehicle_number: string; notes: string | null; sort_order: number; floor_id: string; assigned_company: string | null; updated_at: string };
export type TachiumaUnit = { id: string; name: string; notes: string | null; sort_order: number; floor_id: string; updated_at: string };
export type EquipmentBoardData = {
  canEdit: boolean;
  floors: EquipmentFloorRow[];
  vehicles: EquipmentVehicle[];
  tachiumas: TachiumaUnit[];
  requests: { equipment_type: EquipmentType; floor_id: string; requested_count: number; company: string }[];
};

export async function getEquipmentBoardData(date: string, canEdit: boolean): Promise<EquipmentBoardData> {
  const db = createAdminServerClient();
  const results = await Promise.all([
    db.from("equipment_floor_master").select("id,name,sort_order").order("sort_order").order("name"),
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
  const floors = results[0].data ?? [];
  return {
    canEdit,
    floors,
    vehicles: orderByFloor(resolveVehicleAssignments(results[1].data ?? [], requests, results[3].data ?? [], date), floors),
    tachiumas: orderByFloor(results[4].data ?? [], floors),
    requests,
  } as EquipmentBoardData;
}
