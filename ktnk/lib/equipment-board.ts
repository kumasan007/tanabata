import type { EquipmentFloorRow, EquipmentType } from "./types";

export type EquipmentVehicle = { id: string; vehicle_number: string; notes: string | null; sort_order: number; floor_id: string; assigned_company: string | null; updated_at: string };
export type TachiumaUnit = { id: string; name: string; notes: string | null; sort_order: number; floor_id: string; updated_at: string };
export type EquipmentStock = { floor_id: string; quantity: number; notes: string | null; updated_at: string };
export type EquipmentBoardData = {
  canEdit: boolean;
  floors: EquipmentFloorRow[];
  vehicles: EquipmentVehicle[];
  tachiumas: TachiumaUnit[];
  stocks: EquipmentStock[];
  requests: { equipment_type: EquipmentType; floor_id: string; requested_count: number; company: string }[];
};
