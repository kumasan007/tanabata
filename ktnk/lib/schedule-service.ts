import { createServerClient } from "@/lib/supabase";
import type {
  ScheduleListRow,
  ScheduleGroupRow,
  ScheduleSummary,
  ScheduleSubcompanyRow,
  ScheduleWithSubcompanies,
  SubcompanyInput,
} from "@/lib/types";
import { addDays, expandDateRange, formatDateTime, parseLocalDate, todayInTokyoString, toDateString } from "@/lib/utils";
import type { ScheduleSubmitParsed } from "@/lib/validation";
import { unstable_cache } from "next/cache";
import { DATA_CACHE_TAGS, invalidateScheduleData } from "@/lib/data-cache";

const SAME_AS_PREVIOUS = "前回と同じ";

export class ScheduleAlreadyExistsError extends Error {
  constructor(public readonly dates: string[]) {
    super("同じ日・一次会社の作業内容が既に入力されています。");
    this.name = "ScheduleAlreadyExistsError";
  }
}

export async function saveScheduleSubmission(input: ScheduleSubmitParsed) {
  const dates = expandDateRange(input.startDate, input.endDate, input.excludeWeekends);
  if (dates.length === 0) {
    throw new Error("登録対象の日付がありません。");
  }

  const targetDates = dates;
  const supabase = createServerClient();
  const { data: existingSchedules, error: existingError } = await supabase
    .from("schedule_groups")
    .select("work_date")
    .eq("primary_company", input.primaryCompany)
    .in("work_date", targetDates);
  if (existingError) {
    throwSupabaseError(existingError, "既存予定の確認に失敗しました。");
  }
  if (!input.overwriteExisting && existingSchedules?.length) {
    throw new ScheduleAlreadyExistsError(
      existingSchedules.map((row) => row.work_date),
    );
  }

  const previous = usesPreviousValue(input)
    ? await getPreviousScheduleForCopy(input.primaryCompany, dates[0])
    : null;
  const resolvedSubcompanies = resolveSubcompanyInputs(
    input.currentSubcompanies,
    previous?.subcompanies ?? [],
  );

  const payloads = dates.map((workDate) => {
    const payload = {
      work_date: workDate,
      primary_company: input.primaryCompany,
      primary_count: resolvePreviousNumber(input.primaryCount, input.usePreviousPrimaryCount, previous?.primary_count, "一次会社人数"),
      work_area: emptyToNull(resolvePreviousText(input.workArea, previous?.work_area, "作業エリア")),
      work_content: emptyToNull(resolvePreviousText(input.workContent, previous?.work_content, "作業内容")),
      aerial_work_vehicle_count: input.aerialWorkVehicleCount,
      aerial_work_vehicle_floor: emptyToNull(input.aerialWorkVehicleFloor),
      notes: emptyToNull(input.notes),
    };

    const secondaryTotal = resolvedSubcompanies.reduce((sum, subcompany) => sum + (subcompany.workerCount ?? 0), 0);
    if (payload.primary_count === 0 && secondaryTotal < 1) {
      throw new Error("一次会社人数が0人の場合は、二次会社人数の合計を1人以上にしてください。");
    }
    return payload;
  });

  const { data: groups, error: upsertError } = await supabase
    .from("schedule_groups")
    .upsert(payloads, { onConflict: "work_date,primary_company" })
    .select("id,work_date");

  if (upsertError) throwSupabaseError(upsertError, "予定の保存に失敗しました。");
  const savedByDate = new Map((groups ?? []).map((group) => [group.work_date, group.id]));
  const savedIds = targetDates.map((date) => savedByDate.get(date)).filter((id): id is string => Boolean(id));
  if (savedIds.length !== targetDates.length) {
    throw new Error("保存した予定の確認に失敗しました。");
  }

  if (savedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("schedule_subcompanies")
      .delete()
      .in("schedule_group_id", savedIds);
    if (deleteError) throwSupabaseError(deleteError, "二次会社予定の削除に失敗しました。");
  }

  const subcompanyRows = targetDates.flatMap((date) => {
    const id = savedByDate.get(date);
    if (!id) return [];
    return buildSubcompanyRows(id, resolvedSubcompanies);
  });
  if (subcompanyRows.length > 0) {
    const { error: insertError } = await supabase.from("schedule_subcompanies").insert(subcompanyRows);
    if (insertError) throwSupabaseError(insertError, "二次会社予定の保存に失敗しました。");
  }

  invalidateScheduleData();
  return {
    dates: targetDates,
    savedIds,
  };
}

export type ScheduleSearchParams = {
  dateFrom?: string | null;
  dateTo?: string | null;
  primaryCompany?: string | null;
  secondaryCompany?: string | null;
};

async function querySchedules(params: ScheduleSearchParams) {
  const supabase = createServerClient();

  let query = supabase
    .from("schedule_groups")
    .select(
      `
      id, work_date, primary_company, primary_count, work_area,
      work_content, aerial_work_vehicle_count, aerial_work_vehicle_floor,
      notes, created_at, updated_at,
      schedule_subcompanies (
        id, schedule_group_id, secondary_company, worker_count, sort_order
      )
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

const getCachedSchedules = unstable_cache(
  async (
    dateFrom: string,
    dateTo: string,
    primaryCompany: string,
    secondaryCompany: string,
  ) => querySchedules({ dateFrom, dateTo, primaryCompany, secondaryCompany }),
  ["schedules-v1"],
  { tags: [DATA_CACHE_TAGS.schedules], revalidate: 5 * 60 },
);

export async function getSchedules(params: ScheduleSearchParams) {
  return getCachedSchedules(
    params.dateFrom ?? "",
    params.dateTo ?? "",
    params.primaryCompany?.trim() ?? "",
    params.secondaryCompany?.trim() ?? "",
  );
}

async function queryPreviousScheduleForCopy(primaryCompany: string, workDate: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("schedule_groups")
    .select(
      `
      id, work_date, primary_company, primary_count, work_area,
      work_content, aerial_work_vehicle_count, aerial_work_vehicle_floor,
      notes, created_at, updated_at,
      schedule_subcompanies (
        id, schedule_group_id, secondary_company, worker_count, sort_order
      )
    `,
    )
    .eq("primary_company", primaryCompany)
    .lt("work_date", workDate)
    .order("work_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throwSupabaseError(error, "前回の予定取得に失敗しました。");
  return data ? normalizeScheduleRow(data) : null;
}

const getCachedPreviousSchedule = unstable_cache(
  queryPreviousScheduleForCopy,
  ["previous-schedule-v1"],
  { tags: [DATA_CACHE_TAGS.schedules], revalidate: 5 * 60 },
);

export async function getPreviousScheduleForCopy(primaryCompany: string, workDate: string) {
  return getCachedPreviousSchedule(primaryCompany, workDate);
}

async function queryNextScheduleForCopy(primaryCompany: string, workDate: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("schedule_groups")
    .select(
      `
      id, work_date, primary_company, primary_count, work_area,
      work_content, aerial_work_vehicle_count, aerial_work_vehicle_floor,
      notes, created_at, updated_at,
      schedule_subcompanies (
        id, schedule_group_id, secondary_company, worker_count, sort_order
      )
    `,
    )
    .eq("primary_company", primaryCompany)
    .gte("work_date", workDate)
    .order("work_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throwSupabaseError(error, "次回の予定取得に失敗しました。");
  return data ? normalizeScheduleRow(data) : null;
}

const getCachedNextSchedule = unstable_cache(
  queryNextScheduleForCopy,
  ["next-schedule-v1"],
  { tags: [DATA_CACHE_TAGS.schedules], revalidate: 5 * 60 },
);

export async function getNextScheduleForCopy(primaryCompany: string, workDate: string) {
  return getCachedNextSchedule(primaryCompany, workDate);
}

async function queryWorkScheduleOnDate(primaryCompany: string, workDate: string) {
  const { data, error } = await createServerClient()
    .from("schedule_groups")
    .select(`
      id, work_date, primary_company, primary_count, work_area,
      work_content, aerial_work_vehicle_count, aerial_work_vehicle_floor,
      notes, created_at, updated_at,
      schedule_subcompanies (
        id, schedule_group_id, secondary_company, worker_count, sort_order
      )
    `)
    .eq("primary_company", primaryCompany)
    .eq("work_date", workDate)
    .maybeSingle();
  if (error) throwSupabaseError(error, "本日の予定取得に失敗しました。");
  return data ? normalizeScheduleRow(data) : null;
}

const getCachedWorkScheduleOnDate = unstable_cache(
  queryWorkScheduleOnDate,
  ["work-schedule-on-date-v1"],
  { tags: [DATA_CACHE_TAGS.schedules], revalidate: 5 * 60 },
);

export async function getWorkScheduleOnDate(primaryCompany: string, workDate: string) {
  return getCachedWorkScheduleOnDate(primaryCompany, workDate);
}

async function queryScheduleSummariesByPrimaryCompany(primaryCompany: string): Promise<ScheduleSummary[]> {
  const supabase = createServerClient();
  const dateFrom = todayInTokyoString();
  const startDate = parseLocalDate(dateFrom);
  const dateTo = startDate ? toDateString(addDays(startDate, 6)) : dateFrom;

  const { data, error } = await supabase
    .from("schedule_groups")
    .select(
      `
      id, work_date, primary_company, primary_count, work_area,
      work_content, aerial_work_vehicle_count, aerial_work_vehicle_floor,
      notes, created_at, updated_at,
      schedule_subcompanies (
        id, schedule_group_id, secondary_company, worker_count, sort_order
      )
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
      .map((sub) => {
        const company = sub.secondary_company ?? "二次会社なし";
        const count = sub.worker_count === null ? "" : `${sub.worker_count}人`;
        return count ? `${company} ${count}` : company;
      });

    return {
      id: schedule.id,
      workDate: schedule.work_date,
      workArea: schedule.work_area ?? "",
      workContent: schedule.work_content ?? "",
      aerialWorkVehicleCount: schedule.aerial_work_vehicle_count ?? 0,
      aerialWorkVehicleFloor: schedule.aerial_work_vehicle_floor ?? "",
      companyText: subs.join("、"),
      notes: schedule.notes ?? "",
    };
  });
}

const getCachedScheduleSummaries = unstable_cache(
  queryScheduleSummariesByPrimaryCompany,
  ["schedule-summaries-v1"],
  { tags: [DATA_CACHE_TAGS.schedules], revalidate: 5 * 60 },
);

export async function getScheduleSummariesByPrimaryCompany(primaryCompany: string): Promise<ScheduleSummary[]> {
  return getCachedScheduleSummaries(primaryCompany);
}

export function schedulesToListRows(schedules: ScheduleWithSubcompanies[]): ScheduleListRow[] {
  const rows: ScheduleListRow[] = [];

  for (const schedule of schedules) {
    const currentSubs = schedule.subcompanies.sort((a, b) => a.sort_order - b.sort_order);
    const subs = currentSubs.length > 0 ? currentSubs : [null];
    for (const sub of subs) {
      rows.push({
          workDate: schedule.work_date,
          primaryCompany: schedule.primary_company,
          primaryCount: schedule.primary_count ?? "",
          secondaryCompany: sub?.secondary_company ?? "",
          secondaryCount: sub?.worker_count ?? "",
          workArea: schedule.work_area ?? "",
          workContent: schedule.work_content ?? "",
          aerialWorkVehicleCount: schedule.aerial_work_vehicle_count ?? "",
          aerialWorkVehicleFloor: schedule.aerial_work_vehicle_floor ?? "",
          notes: schedule.notes ?? "",
          createdAt: formatDateTime(schedule.created_at),
          updatedAt: formatDateTime(schedule.updated_at),
      });
    }
  }

  return rows;
}

function buildSubcompanyRows(scheduleGroupId: string, subcompanies: SubcompanyInput[]) {
  return subcompanies
    .map((subcompany, index) => ({
      schedule_group_id: scheduleGroupId,
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
    if (!previous || previous.worker_count === null) {
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
    input.usePreviousPrimaryCount ||
    input.currentSubcompanies.some((subcompany) => subcompany.usePreviousWorkerCount)
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
