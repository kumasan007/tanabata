import type { EquipmentFloorRow, EquipmentType } from "./types";
import { createAdminServerClient } from "./supabase";
import { resolveVehicleAssignments, type VehicleAssignmentHistory } from "./equipment-assignment";
import { orderByFloor } from "./equipment-order";
import { readAllRows } from "./read-all-rows";

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
    readAllRows(db.from("equipment_floor_master").select("id,name,sort_order").order("sort_order").order("name").order("id")),
    readAllRows(db.from("aerial_work_vehicles").select("id,vehicle_number,notes,sort_order,floor_id,assigned_company,updated_at").order("sort_order").order("vehicle_number").order("id")),
    readAllRows(db.from("schedule_equipment_requests").select("equipment_type,floor_id,requested_count,schedule_groups!inner(primary_company,work_date)").eq("schedule_groups.work_date", date).order("id")),
    readAllRows(db.rpc("get_equipment_assignment_history", { p_date: date }).order("vehicle_id").order("work_date", { ascending: false }).order("moved_at", { ascending: false }).order("id")),
    readAllRows(db.from("tachiuma_units").select("id,name,notes,sort_order,floor_id,updated_at").order("sort_order").order("name").order("id")),
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
    vehicles: orderByFloor(resolveVehicleAssignments(results[1].data ?? [], requests, (results[3].data ?? []) as VehicleAssignmentHistory[], date), floors),
    tachiumas: orderByFloor(results[4].data ?? [], floors),
    requests,
  } as EquipmentBoardData;
}
