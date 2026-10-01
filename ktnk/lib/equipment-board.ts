import type { EquipmentFloorRow, EquipmentType } from "./types";
import { createAdminServerClient } from "./supabase";
import { resolveVehicleAssignments, type VehicleAssignmentHistory } from "./equipment-assignment";
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
  const { data, error } = await createAdminServerClient().rpc("get_equipment_board_snapshot", { p_date: date });
  if (error) throw error;
  const { floors, vehicles, tachiumas, requests, history } = data as Omit<EquipmentBoardData, "canEdit"> & { history: VehicleAssignmentHistory[] };
  return {
    canEdit,
    floors,
    vehicles: orderByFloor(resolveVehicleAssignments(vehicles, requests, history, date), floors),
    tachiumas: orderByFloor(tachiumas, floors),
    requests,
  };
}
