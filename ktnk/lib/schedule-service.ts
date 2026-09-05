import { createServerClient } from "@/lib/supabase";
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

const SAME_AS_PREVIOUS = "前回と同じ";

export async function saveScheduleSubmission(input: ScheduleSubmitParsed) {
  const dates = expandDateRange(input.startDate, input.endDate, input.excludeWeekends);
  if (dates.length === 0) {
    throw new Error("登録対象の日付がありません。");
  }

  const supabase = createServerClient();
  const savedIds: string[] = [];

  for (const workDate of dates) {
    const previous = usesPreviousValue(input)
      ? await getPreviousScheduleForCopy(input.primaryCompany, input.status, workDate)
      : null;

    const { data: existing, error: findError } = await supabase
      .from("schedule_groups")
      .select("id")
      .eq("work_date", workDate)
      .eq("primary_company", input.primaryCompany)
      .maybeSingle();

    if (findError) throwSupabaseError(findError, "既存予定の確認に失敗しました。");

    if (existing?.id) {
      const { error: deleteError } = await supabase
        .from("schedule_subcompanies")
        .delete()
        .eq("schedule_group_id", existing.id);

      if (deleteError) throwSupabaseError(deleteError, "二次会社予定の削除に失敗しました。");
    }

    const payload = {
      id: existing?.id,
      work_date: workDate,
      status: input.status,
      primary_company: input.primaryCompany,
      primary_count: input.status === "work" ? resolvePreviousNumber(input.primaryCount, input.usePreviousPrimaryCount, previous?.primary_count, "一次会社人数") : null,
      work_area: input.status === "work" ? emptyToNull(resolvePreviousText(input.workArea, previous?.work_area, "作業エリア")) : null,
      work_content: input.status === "work" ? emptyToNull(resolvePreviousText(input.workContent, previous?.work_content, "作業内容")) : null,
      next_visit_date: input.status === "no_work" ? input.nextVisitDate : null,
      next_primary_count: input.status === "no_work" ? resolvePreviousNumber(input.nextPrimaryCount, input.usePreviousNextPrimaryCount, previous?.next_primary_count, "一次会社人数") : null,
      next_work_area: input.status === "no_work" ? emptyToNull(resolvePreviousText(input.nextWorkArea, previous?.next_work_area, "作業エリア")) : null,
      next_work_content: input.status === "no_work" ? emptyToNull(resolvePreviousText(input.nextWorkContent, previous?.next_work_content, "作業内容")) : null,
    };

    const { data: group, error: upsertError } = await supabase
      .from("schedule_groups")
      .upsert(payload, { onConflict: "work_date,primary_company" })
      .select("id")
      .single();

    if (upsertError) throwSupabaseError(upsertError, "予定の保存に失敗しました。");

    const subcompanyRows = buildSubcompanyRows(
      group.id,
      resolveSubcompanyInputs(
        input.status === "work" ? input.currentSubcompanies : input.nextSubcompanies,
        previous?.subcompanies.filter((sub) => sub.kind === (input.status === "work" ? "current" : "next_visit")) ?? [],
      ),
      input.status === "work" ? "current" : "next_visit",
    );

    if (subcompanyRows.length > 0) {
      const { error: insertError } = await supabase.from("schedule_subcompanies").insert(subcompanyRows);
      if (insertError) throwSupabaseError(insertError, "二次会社予定の保存に失敗しました。");
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
  status?: ScheduleStatus | null;
  primaryCompany?: string | null;
  secondaryCompany?: string | null;
};

export async function getSchedules(params: ScheduleSearchParams) {
  const supabase = createServerClient();

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

  if (params.status) {
    query = query.eq("status", params.status);
  }

  if (params.primaryCompany) {
    query = query.ilike("primary_company", `%${escapeLike(params.primaryCompany)}%`);
  }

  const { data, error } = await query;
  if (error) throwSupabaseError(error, "予定の取得に失敗しました。");

  let schedules = (data ?? []).map((row) => normalizeScheduleRow(row));

  if (params.secondaryCompany) {
    const needle = params.secondaryCompany;
    schedules = schedules.filter((schedule) =>
      schedule.subcompanies.some((sub) => (sub.secondary_company ?? "").includes(needle)),
    );
  }

  return schedules;
}

async function getPreviousScheduleForCopy(primaryCompany: string, status: ScheduleStatus, workDate: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("schedule_groups")
    .select(
      `
      *,
      schedule_subcompanies (*)
    `,
    )
    .eq("primary_company", primaryCompany)
    .eq("status", status)
    .lt("work_date", workDate)
    .order("work_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throwSupabaseError(error, "前回の予定取得に失敗しました。");
  return data ? normalizeScheduleRow(data) : null;
}

export async function getScheduleSummariesByPrimaryCompany(primaryCompany: string): Promise<ScheduleSummary[]> {
  const supabase = createServerClient();
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

  if (error) throwSupabaseError(error, "記入済み予定の取得に失敗しました。");

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
    .filter((row) => row.secondary_company || (row.worker_count !== null && row.worker_count > 0));
}

function resolveSubcompanyInputs(
  subcompanies: SubcompanyInput[],
  previousSubcompanies: ScheduleSubcompanyRow[],
): SubcompanyInput[] {
  return subcompanies.map((subcompany) => {
    if (!subcompany.usePreviousWorkerCount) return subcompany;

    const secondaryCompany = subcompany.secondaryCompany.trim();
    const previous = previousSubcompanies.find((row) => (row.secondary_company ?? "") === secondaryCompany);
    if (!previous) {
      throw new Error(`${secondaryCompany}の前回人数が見つかりません。`);
    }

    return {
      ...subcompany,
      workerCount: previous.worker_count,
    };
  });
}

function usesPreviousValue(input: ScheduleSubmitParsed) {
  return (
    input.workArea === SAME_AS_PREVIOUS ||
    input.workContent === SAME_AS_PREVIOUS ||
    input.nextWorkArea === SAME_AS_PREVIOUS ||
    input.nextWorkContent === SAME_AS_PREVIOUS ||
    input.usePreviousPrimaryCount ||
    input.usePreviousNextPrimaryCount ||
    input.currentSubcompanies.some((subcompany) => subcompany.usePreviousWorkerCount) ||
    input.nextSubcompanies.some((subcompany) => subcompany.usePreviousWorkerCount)
  );
}

function resolvePreviousText(value: string, previousValue: string | null | undefined, fieldName: string) {
  if (value !== SAME_AS_PREVIOUS) return value;
  if (previousValue === null || previousValue === undefined || previousValue.trim() === "") {
    throw new Error(`前回の${fieldName}が見つかりません。`);
  }
  return previousValue;
}

function resolvePreviousNumber(
  value: number | null,
  usePrevious: boolean | undefined,
  previousValue: number | null | undefined,
  fieldName: string,
) {
  if (!usePrevious) return value;
  if (previousValue === null || previousValue === undefined) {
    throw new Error(`前回の${fieldName}が見つかりません。`);
  }
  return previousValue;
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

function throwSupabaseError(error: unknown, fallback: string): never {
  if (typeof error === "object" && error !== null) {
    const fields = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const parts = [
      fallback,
      typeof fields.message === "string" ? fields.message : "",
      typeof fields.details === "string" ? fields.details : "",
      typeof fields.hint === "string" ? fields.hint : "",
      typeof fields.code === "string" ? `code: ${fields.code}` : "",
    ].filter(Boolean);

    throw new Error(parts.join(" "));
  }

  throw new Error(fallback);
}
