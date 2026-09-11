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

export type AerialWorkVehicleInput = {
  workArea: string;
  vehicleCount: number | null;
};

export type PreviousSchedule = {
  workDate: string;
  primaryCount: number | null;
  workArea: string | null;
  workContent: string | null;
  aerialWorkVehicleCount?: number | null;
  aerialWorkVehicleFloor?: string | null;
  aerialWorkVehicles?: AerialWorkVehicleInput[];
  usesFire?: boolean;
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
  aerialWorkVehicleCount: number | null;
  aerialWorkVehicleFloor: string;
  aerialWorkVehicles?: AerialWorkVehicleInput[];
  usesFire: boolean;
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
  aerial_work_vehicle_count: number | null;
  aerial_work_vehicle_floor: string | null;
  uses_fire: boolean;
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

export type ScheduleAerialWorkVehicleRow = {
  id: string;
  schedule_group_id: string;
  work_area: string;
  vehicle_count: number;
  sort_order: number;
};

export type ScheduleWithSubcompanies = ScheduleGroupRow & {
  subcompanies: ScheduleSubcompanyRow[];
  aerialWorkVehicles?: ScheduleAerialWorkVehicleRow[];
};

export type ScheduleListRow = {
  workDate: string;
  primaryCompany: string;
  primaryCount: number | "";
  secondaryCompany: string;
  secondaryCount: number | "";
  workArea: string;
  workContent: string;
  aerialWorkVehicleCount: number | "";
  aerialWorkVehicleFloor: string;
  usesFire: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleSummary = {
  id: string;
  workDate: string;
  workArea: string;
  workContent: string;
  aerialWorkVehicleCount: number;
  aerialWorkVehicleFloor: string;
  usesFire: boolean;
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
