import { readAllRows } from "@/lib/read-all-rows";
import { createServerClient } from "@/lib/supabase";
import type {
  ScheduleGroupRow,
  ScheduleSummary,
  ScheduleSubcompanyRow,
  ScheduleWithSubcompanies,
  SubcompanyInput,
} from "@/lib/types";
import { addDays, expandDateRange, parseLocalDate, todayInTokyoString, toDateString } from "@/lib/utils";
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

export async function saveScheduleSubmission(input: ScheduleSubmitParsed, expectedId?: string) {
  const dates = input.dates?.length
    ? [...new Set(input.dates)].sort()
    : expandDateRange(input.startDate, input.endDate, input.excludeWeekends);
  if (dates.length === 0) {
    throw new Error("登録対象の日付がありません。");
  }

  const targetDates = dates;
  const supabase = createServerClient();
  const previous = usesPreviousValue(input)
    ? await getPreviousScheduleForCopy(input.primaryCompany, targetDates[0])
    : null;
  const resolvedSubcompanies = resolveSubcompanyInputs(
    input.currentSubcompanies,
    previous?.subcompanies ?? [],
  );
  const secondaryTotal = resolvedSubcompanies.reduce(
    (sum, subcompany) => sum + (subcompany.workerCount ?? 0),
    0,
  );

  const payloads = targetDates.map((workDate) => {
    const payload = {
      work_date: workDate,
      primary_company: input.primaryCompany,
      primary_count: resolvePreviousNumber(input.primaryCount, input.usePreviousPrimaryCount, previous?.primary_count, "一次会社人数"),
      work_area: emptyToNull(resolvePreviousText(input.workArea, previous?.work_area, "作業エリア")),
      work_content: emptyToNull(resolvePreviousText(input.workContent, previous?.work_content, "作業内容")),
      uses_aerial_work_vehicle: input.usesAerialWorkVehicle,
      aerial_work_vehicle_notes: input.usesAerialWorkVehicle ? emptyToNull(input.aerialWorkVehicleNotes) : null,
      uses_fire: input.usesFire,
      fire_area: input.usesFire ? emptyToNull(input.fireArea) : null,
      uses_tachiuma: input.usesTachiuma,
      tachiuma_notes: input.usesTachiuma ? emptyToNull(input.tachiumaNotes) : null,
      notes: emptyToNull(input.notes),
    };

    if (payload.primary_count === 0 && secondaryTotal < 1) {
      throw new Error("一次会社人数が0人の場合は、二次会社人数の合計を1人以上にしてください。");
    }
    return payload;
  });

  const subcompanies = resolvedSubcompanies
    .map((sub) => ({ secondary_company: emptyToNull(sub.secondaryCompany), worker_count: sub.workerCount }))
    .filter((sub) => sub.secondary_company || (sub.worker_count !== null && sub.worker_count > 0));
  const { data, error } = await supabase.rpc("save_schedule_atomically", {
    p_groups: payloads, p_subcompanies: subcompanies,
    p_overwrite: input.overwriteExisting, p_skip_existing: input.skipExisting,
    p_expected_id: expectedId ?? null,
  });
  if (error) {
    if (error.message === "SCHEDULE_ALREADY_EXISTS") {
      let conflicts = dates;
      try { const parsed: unknown = JSON.parse(error.details ?? "[]");
        if (Array.isArray(parsed) && parsed.length && parsed.every((date) => typeof date === "string")) conflicts = parsed;
      } catch { /* Keep requested dates when the DB response has no details. */ }
      throw new ScheduleAlreadyExistsError(conflicts);
    }
    if (error.message === "SCHEDULE_NOT_FOUND") throw new Error("予定は削除されています。カレンダーを更新してください。");
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("予定保存用の追加SQL（202609150001_save_schedule_atomically.sql）を実行してください。");
    }
    throwSupabaseError(error, "予定の保存に失敗しました。");
  }
  const result = data as { dates: string[]; savedIds: string[] } | null;
  if (!result?.dates?.length || result.dates.length !== result.savedIds?.length) {
    invalidateScheduleData();
    throw new Error("保存した予定の確認に失敗しました。");
  }
  invalidateScheduleData();
  return result;
}

export async function deleteSchedule(id: string) {
  const { data, error } = await createServerClient()
    .from("schedule_groups")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throwSupabaseError(error, "予定の削除に失敗しました。");
  if (!data?.length) return false;
  invalidateScheduleData();
  return true;
}

export type ScheduleSearchParams = {
  dateFrom?: string | null;
  dateTo?: string | null;
  primaryCompany?: string | null;
  secondaryCompany?: string | null;
  exactPrimaryCompany?: boolean;
};

async function querySchedules(params: ScheduleSearchParams) {
  const supabase = createServerClient();

  let query = supabase
    .from("schedule_groups")
    .select(
      `
      id, work_date, primary_company, primary_count, work_area,
      work_content, uses_aerial_work_vehicle, aerial_work_vehicle_notes, uses_fire, fire_area, uses_tachiuma, tachiuma_notes,
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
    query = params.exactPrimaryCompany
      ? query.eq("primary_company", params.primaryCompany)
      : query.ilike("primary_company", `%${escapeLike(params.primaryCompany)}%`);
  }

  const { data, error } = await readAllRows(query);
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
    exactPrimaryCompany: boolean,
  ) => querySchedules({ dateFrom, dateTo, primaryCompany, secondaryCompany, exactPrimaryCompany }),
  ["schedules-v2"],
  { tags: [DATA_CACHE_TAGS.schedules], revalidate: 5 * 60 },
);

export async function getSchedules(params: ScheduleSearchParams) {
  return getCachedSchedules(
    params.dateFrom ?? "",
    params.dateTo ?? "",
    params.primaryCompany?.trim() ?? "",
    params.secondaryCompany?.trim() ?? "",
    params.exactPrimaryCompany ?? false,
  );
}

async function queryPreviousScheduleForCopy(primaryCompany: string, workDate: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("schedule_groups")
    .select(
      `
      id, work_date, primary_company, primary_count, work_area,
      work_content, uses_aerial_work_vehicle, aerial_work_vehicle_notes, uses_fire, fire_area, uses_tachiuma, tachiuma_notes,
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

async function queryWorkScheduleOnDate(primaryCompany: string, workDate: string) {
  const { data, error } = await createServerClient()
    .from("schedule_groups")
    .select(`
      id, work_date, primary_company, primary_count, work_area,
      work_content, uses_aerial_work_vehicle, aerial_work_vehicle_notes, uses_fire, fire_area, uses_tachiuma, tachiuma_notes,
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
      work_content, uses_aerial_work_vehicle, aerial_work_vehicle_notes, uses_fire, fire_area, uses_tachiuma, tachiuma_notes,
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
      usesAerialWorkVehicle: schedule.uses_aerial_work_vehicle,
      aerialWorkVehicleNotes: schedule.aerial_work_vehicle_notes ?? "",
      usesFire: schedule.uses_fire,
      fireArea: schedule.fire_area ?? "",
      usesTachiuma: schedule.uses_tachiuma,
      tachiumaNotes: schedule.tachiuma_notes ?? "",
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
  row: ScheduleGroupRow & {
    schedule_subcompanies?: ScheduleSubcompanyRow[];
  },
): ScheduleWithSubcompanies {
  const { schedule_subcompanies, ...group } = row;
  return {
    ...group,
    subcompanies: (schedule_subcompanies ?? []).sort((a, b) => a.sort_order - b.sort_order),
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
