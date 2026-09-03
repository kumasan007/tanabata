export type ScheduleStatus = "work" | "no_work";
export type SubcompanyKind = "current" | "next_visit";

export type CompanyMaster = {
  primaryCompanies: string[];
  secondariesByPrimary: Record<string, string[]>;
  loadedAt: string;
};

export type SubcompanyInput = {
  secondaryCompany: string;
  workerCount: number | null;
};

export type ScheduleSubmitInput = {
  startDate: string;
  endDate: string;
  excludeWeekends: boolean;
  status: ScheduleStatus;
  primaryCompany: string;
  primaryCount: number | null;
  currentSubcompanies: SubcompanyInput[];
  workArea: string;
  workContent: string;
  nextVisitDate: string | null;
  nextPrimaryCount: number | null;
  nextSubcompanies: SubcompanyInput[];
  nextWorkArea: string;
  nextWorkContent: string;
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

export type ExportRow = {
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
};
