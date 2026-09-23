export type CompanyMaster = {
  primaryCompanies: string[];
  secondariesByPrimary: Record<string, string[]>;
  primaryTradeRolesByPrimary: Record<string, string[]>;
  loadedAt: string;
};

export type CompanyMasterRow = {
  id: string;
  primary_company: string;
  secondary_company: string | null;
  primary_trade_roles: string[] | null;
  sort_order: number;
};

export type SubcompanyInput = {
  secondaryCompany: string;
  workerCount: number | null;
  usePreviousWorkerCount?: boolean;
};

export type EquipmentType = "aerial_work_vehicle" | "tachiuma";
export type EquipmentRequestInput = { floorId: string; floorName?: string; count: number | null };
export type EquipmentFloorRow = { id: string; name: string; sort_order: number };
export type ScheduleEquipmentRequestRow = {
  id: string;
  schedule_group_id: string;
  equipment_type: EquipmentType;
  floor_id: string;
  requested_count: number;
  sort_order: number;
  equipment_floor_master?: EquipmentFloorRow | EquipmentFloorRow[] | null;
};

export type PreviousSchedule = {
  workDate: string;
  primaryCount: number | null;
  workArea: string | null;
  workContent: string | null;
  usesAerialWorkVehicle?: boolean;
  aerialWorkVehicleNotes?: string | null;
  aerialWorkVehicleRequests?: EquipmentRequestInput[];
  usesFire?: boolean;
  fireArea?: string | null;
  usesTachiuma?: boolean;
  tachiumaNotes?: string | null;
  tachiumaRequests?: EquipmentRequestInput[];
  subcompanies: { secondaryCompany: string; workerCount: number | null }[];
};

export type ScheduleSubmitInput = {
  dates?: string[];
  startDate: string;
  endDate: string;
  excludeWeekends: boolean;
  primaryCompany: string;
  primaryCount: number | null;
  usePreviousPrimaryCount?: boolean;
  currentSubcompanies: SubcompanyInput[];
  workArea: string;
  workContent: string;
  usesAerialWorkVehicle: boolean;
  aerialWorkVehicleNotes: string;
  aerialWorkVehicleRequests: EquipmentRequestInput[];
  usesFire: boolean;
  fireArea: string;
  usesTachiuma: boolean;
  tachiumaNotes: string;
  tachiumaRequests: EquipmentRequestInput[];
  notes: string;
  overwriteExisting?: boolean;
  skipExisting?: boolean;
};

export type ScheduleGroupRow = {
  id: string;
  work_date: string;
  primary_company: string;
  primary_count: number | null;
  work_area: string | null;
  work_content: string | null;
  uses_aerial_work_vehicle: boolean;
  aerial_work_vehicle_notes: string | null;
  uses_fire: boolean;
  fire_area: string | null;
  uses_tachiuma: boolean;
  tachiuma_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleSubcompanyRow = {
  id: string;
  schedule_group_id: string;
  secondary_company: string | null;
  worker_count: number | null;
  sort_order: number;
};

export type ScheduleWithSubcompanies = ScheduleGroupRow & {
  subcompanies: ScheduleSubcompanyRow[];
  equipmentRequests: ScheduleEquipmentRequestRow[];
};

export type ScheduleSummary = {
  id: string;
  workDate: string;
  workArea: string;
  workContent: string;
  usesAerialWorkVehicle: boolean;
  aerialWorkVehicleNotes: string;
  usesFire: boolean;
  fireArea: string;
  usesTachiuma: boolean;
  tachiumaNotes: string;
  companyText: string;
  notes: string;
};

export type NewEntrantRecord = {
  id: string;
  entry_date: string;
  primary_company: string;
  secondary_company: string | null;
  person_count: number;
  person_names: string | null;
  nationality_status: "japanese_only" | "includes_foreign" | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarSchedule = Pick<ScheduleWithSubcompanies, "id" | "work_date" | "primary_company" | "uses_aerial_work_vehicle" | "uses_fire" | "uses_tachiuma"> & {
  total_workers: number;
  work_area?: string | null;
  work_content?: string | null;
  aerial_work_vehicle_notes?: string | null;
  fire_area?: string | null;
  tachiuma_notes?: string | null;
  schedule_equipment_requests?: Array<Pick<ScheduleEquipmentRequestRow, "equipment_type" | "requested_count"> & { equipment_floor_master?: EquipmentFloorRow | EquipmentFloorRow[] | null }>;
};
export type CalendarEntrant = Pick<NewEntrantRecord, "entry_date" | "primary_company" | "secondary_company" | "person_count">;
