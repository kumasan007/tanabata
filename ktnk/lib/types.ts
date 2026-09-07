export type ScheduleStatus = "work" | "no_work";
export type SubcompanyKind = "current" | "next_visit";

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

export type PreviousSchedule = {
  workDate: string;
  primaryCount: number | null;
  workArea: string | null;
  workContent: string | null;
  subcompanies: { secondaryCompany: string; workerCount: number | null }[];
};

export type ScheduleSubmitInput = {
  startDate: string;
  endDate: string;
  excludeWeekends: boolean;
  status: ScheduleStatus;
  primaryCompany: string;
  primaryCount: number | null;
  usePreviousPrimaryCount?: boolean;
  currentSubcompanies: SubcompanyInput[];
  workArea: string;
  workContent: string;
  nextVisitDate: string | null;
  nextPrimaryCount: number | null;
  usePreviousNextPrimaryCount?: boolean;
  nextSubcompanies: SubcompanyInput[];
  nextWorkArea: string;
  nextWorkContent: string;
  notes: string;
  overwriteExisting?: boolean;
};

export type ScheduleGroupRow = {
  id: string;
  work_date: string;
  status: ScheduleStatus;
  primary_company: string;
  primary_count: number | null;
  work_area: string | null;
  work_content: string | null;
  next_visit_date: string | null;
  next_primary_count: number | null;
  next_work_area: string | null;
  next_work_content: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleSubcompanyRow = {
  id: string;
  schedule_group_id: string;
  kind: SubcompanyKind;
  secondary_company: string | null;
  worker_count: number | null;
  sort_order: number;
};

export type ScheduleWithSubcompanies = ScheduleGroupRow & {
  subcompanies: ScheduleSubcompanyRow[];
};

export type ScheduleListRow = {
  workDate: string;
  status: string;
  primaryCompany: string;
  primaryCount: number | "";
  secondaryCompany: string;
  secondaryCount: number | "";
  workArea: string;
  workContent: string;
  nextVisitDate: string;
  nextPrimaryCount: number | "";
  nextSecondaryCompany: string;
  nextSecondaryCount: number | "";
  nextWorkArea: string;
  nextWorkContent: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleSummary = {
  id: string;
  workDate: string;
  status: string;
  workArea: string;
  workContent: string;
  nextVisitDate: string;
  nextWorkArea: string;
  nextWorkContent: string;
  companyText: string;
  notes: string;
};

export type NewEntrantRecord = {
  id: string;
  entry_date: string;
  primary_company: string;
  secondary_company: string;
  person_count: number;
  person_names: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
