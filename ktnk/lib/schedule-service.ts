import { createServiceClient } from "@/lib/supabase";
import type {
  ExportRow,
  ScheduleGroupRow,
  ScheduleStatus,
  ScheduleSummary,
  ScheduleSubcompanyRow,
  ScheduleWithSubcompanies,
  SubcompanyInput,
} from "@/lib/types";
import { addDays, expandDateRange, formatDateTime, parseLocalDate, todayInTokyoString, toDateString } from "@/lib/utils";
import type { ScheduleSubmitParsed } from "@/lib/validation";

export async function saveScheduleSubmission(input: ScheduleSubmitParsed) {
  const dates = expandDateRange(input.startDate, input.endDate, input.excludeWeekends);
  if (dates.length === 0) {
    throw new Error("登録対象の日付がありません。");
  }

  const supabase = createServiceClient();
  const savedIds: string[] = [];

  for (const workDate of dates) {
    const { data: existing, error: findError } = await supabase
      .from("schedule_groups")
      .select("id")
      .eq("work_date", workDate)
      .eq("primary_company", input.primaryCompany)
      .maybeSingle();

    if (findError) throw findError;

    if (existing?.id) {
      const { error: deleteError } = await supabase
        .from("schedule_subcompanies")
        .delete()
        .eq("schedule_group_id", existing.id);

      if (deleteError) throw deleteError;
    }

    const payload = {
      id: existing?.id,
      work_date: workDate,
      status: input.status,
      primary_company: input.primaryCompany,
      primary_count: input.status === "work" ? input.primaryCount : null,
      work_area: input.status === "work" ? emptyToNull(input.workArea) : null,
      work_content: input.status === "work" ? emptyToNull(input.workContent) : null,
      next_visit_date: input.status === "no_work" ? input.nextVisitDate : null,
      next_primary_count: input.status === "no_work" ? input.nextPrimaryCount : null,
      next_work_area: input.status === "no_work" ? emptyToNull(input.nextWorkArea) : null,
      next_work_content: input.status === "no_work" ? emptyToNull(input.nextWorkContent) : null,
    };

    const { data: group, error: upsertError } = await supabase
      .from("schedule_groups")
      .upsert(payload, { onConflict: "work_date,primary_company" })
      .select("id")
      .single();

    if (upsertError) throw upsertError;

    const subcompanyRows = buildSubcompanyRows(
      group.id,
      input.status === "work" ? input.currentSubcompanies : input.nextSubcompanies,
      input.status === "work" ? "current" : "next_visit",
    );

    if (subcompanyRows.length > 0) {
      const { error: insertError } = await supabase.from("schedule_subcompanies").insert(subcompanyRows);
      if (insertError) throw insertError;
    }

    savedIds.push(group.id);
  }

  return {
    dates,
    savedIds,
  };
}

export type ScheduleSearchParams = {
  dateFrom?: string | null;
  dateTo?: string | null;
  primaryCompany?: string | null;
  secondaryCompany?: string | null;
};

export async function getSchedules(params: ScheduleSearchParams) {
  const supabase = createServiceClient();

  let query = supabase
    .from("schedule_groups")
    .select(
      `
      *,
      schedule_subcompanies (*)
    `,
    )
    .order("work_date", { ascending: true })
    .order("primary_company", { ascending: true });

  if (params.dateFrom) {
    query = query.gte("work_date", params.dateFrom);
  }

  if (params.dateTo) {
    query = query.lte("work_date", params.dateTo);
  }

  if (params.primaryCompany) {
    query = query.ilike("primary_company", `%${escapeLike(params.primaryCompany)}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  let schedules = (data ?? []).map((row) => normalizeScheduleRow(row));

  if (params.secondaryCompany) {
    const needle = params.secondaryCompany;
    schedules = schedules.filter((schedule) =>
      schedule.subcompanies.some((sub) => (sub.secondary_company ?? "").includes(needle)),
    );
  }

  return schedules;
}

export async function getScheduleSummariesByPrimaryCompany(primaryCompany: string): Promise<ScheduleSummary[]> {
  const supabase = createServiceClient();
  const dateFrom = todayInTokyoString();
  const startDate = parseLocalDate(dateFrom);
  const dateTo = startDate ? toDateString(addDays(startDate, 6)) : dateFrom;

  const { data, error } = await supabase
    .from("schedule_groups")
    .select(
      `
      *,
      schedule_subcompanies (*)
    `,
    )
    .eq("primary_company", primaryCompany)
    .gte("work_date", dateFrom)
    .lte("work_date", dateTo)
    .order("work_date", { ascending: true })
    .limit(7);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const schedule = normalizeScheduleRow(row);
    const subs = schedule.subcompanies
      .filter((sub) => sub.kind === (schedule.status === "work" ? "current" : "next_visit"))
      .map((sub) => {
        const company = sub.secondary_company ?? "二次会社なし";
        const count = sub.worker_count === null ? "" : `${sub.worker_count}人`;
        return count ? `${company} ${count}` : company;
      });

    return {
      id: schedule.id,
      workDate: schedule.work_date,
      status: statusLabel(schedule.status),
      workArea: schedule.work_area ?? "",
      workContent: schedule.work_content ?? "",
      nextVisitDate: schedule.next_visit_date ?? "",
      nextWorkArea: schedule.next_work_area ?? "",
      nextWorkContent: schedule.next_work_content ?? "",
      companyText: subs.join("、"),
    };
  });
}

export function schedulesToExportRows(schedules: ScheduleWithSubcompanies[]): ExportRow[] {
  const rows: ExportRow[] = [];

  for (const schedule of schedules) {
    const currentSubs = schedule.subcompanies
      .filter((sub) => sub.kind === "current")
      .sort((a, b) => a.sort_order - b.sort_order);
    const nextSubs = schedule.subcompanies
      .filter((sub) => sub.kind === "next_visit")
      .sort((a, b) => a.sort_order - b.sort_order);

    if (schedule.status === "work") {
      const subs = currentSubs.length > 0 ? currentSubs : [null];
      for (const sub of subs) {
        rows.push({
          workDate: schedule.work_date,
          status: statusLabel(schedule.status),
          primaryCompany: schedule.primary_company,
          primaryCount: schedule.primary_count ?? "",
          secondaryCompany: sub?.secondary_company ?? "",
          secondaryCount: sub?.worker_count ?? "",
          workArea: schedule.work_area ?? "",
          workContent: schedule.work_content ?? "",
          nextVisitDate: "",
          nextPrimaryCount: "",
          nextSecondaryCompany: "",
          nextSecondaryCount: "",
          nextWorkArea: "",
          nextWorkContent: "",
          createdAt: formatDateTime(schedule.created_at),
          updatedAt: formatDateTime(schedule.updated_at),
        });
      }
    } else {
      const subs = nextSubs.length > 0 ? nextSubs : [null];
      for (const sub of subs) {
        rows.push({
          workDate: schedule.work_date,
          status: statusLabel(schedule.status),
          primaryCompany: schedule.primary_company,
          primaryCount: "",
          secondaryCompany: "",
          secondaryCount: "",
          workArea: "",
          workContent: "",
          nextVisitDate: schedule.next_visit_date ?? "",
          nextPrimaryCount: schedule.next_primary_count ?? "",
          nextSecondaryCompany: sub?.secondary_company ?? "",
          nextSecondaryCount: sub?.worker_count ?? "",
          nextWorkArea: schedule.next_work_area ?? "",
          nextWorkContent: schedule.next_work_content ?? "",
          createdAt: formatDateTime(schedule.created_at),
          updatedAt: formatDateTime(schedule.updated_at),
        });
      }
    }
  }

  return rows;
}

function buildSubcompanyRows(scheduleGroupId: string, subcompanies: SubcompanyInput[], kind: "current" | "next_visit") {
  return subcompanies
    .map((subcompany, index) => ({
      schedule_group_id: scheduleGroupId,
      kind,
      secondary_company: emptyToNull(subcompany.secondaryCompany),
      worker_count: subcompany.workerCount,
      sort_order: index,
    }))
    .filter((row) => row.secondary_company || row.worker_count !== null);
}

function normalizeScheduleRow(
  row: ScheduleGroupRow & { schedule_subcompanies?: ScheduleSubcompanyRow[] },
): ScheduleWithSubcompanies {
  return {
    ...row,
    subcompanies: (row.schedule_subcompanies ?? []).sort((a, b) => a.sort_order - b.sort_order),
  };
}

function emptyToNull(value: string) {
  return value.trim() === "" ? null : value;
}

function statusLabel(status: ScheduleStatus) {
  return status === "work" ? "作業あり" : "作業なし";
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}
