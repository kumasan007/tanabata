import { readAllRows } from "@/lib/read-all-rows";
import { unstable_cache } from "next/cache";
import { createServerClient } from "@/lib/supabase";
import { DATA_CACHE_TAGS } from "@/lib/data-cache";
import { getWorkCompletions, type WorkCompletion } from "@/lib/work-completions";
import type { CalendarSchedule, CalendarEntrant } from "@/lib/types";

export const getCalendarSchedules = unstable_cache(async (from: string, to: string, company: string): Promise<CalendarSchedule[]> => {
  let query = createServerClient().from("schedule_groups").select(
    `id,work_date,primary_company,primary_count,uses_aerial_work_vehicle,uses_fire,uses_tachiuma,
    ${company ? "work_area,work_content,aerial_work_vehicle_notes,tachiuma_notes,fire_area," : ""}schedule_subcompanies(worker_count)`,
  ).order("work_date").order("id");
  if (from) query = query.gte("work_date", from);
  if (to) query = query.lte("work_date", to);
  if (company) query = query.eq("primary_company", company);
  const { data, error } = await readAllRows(query);
  if (error) throw new Error(error.message);
  // The conditional select only adds the text shown by the company calendar.
  const rows = (data ?? []) as unknown as (Omit<CalendarSchedule, "total_workers"> & {
    primary_count: number | null; schedule_subcompanies: { worker_count: number | null }[];
  })[];
  return rows.map(({ primary_count, schedule_subcompanies, ...row }) => ({
    ...row,
    total_workers: (primary_count ?? 0) + schedule_subcompanies.reduce((sum, sub) => sum + (sub.worker_count ?? 0), 0),
  }));
}, ["calendar-schedules-v2"], { tags: [DATA_CACHE_TAGS.schedules], revalidate: 300 });

export const getCalendarEntrants = unstable_cache(async (from: string, to: string, company: string): Promise<CalendarEntrant[]> => {
  const { data, error } = await createServerClient().rpc("get_calendar_entrant_summary", {
    p_from: from, p_to: to, p_company: company,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}, ["calendar-entrants-v4"], { tags: [DATA_CACHE_TAGS.entrants], revalidate: 300 });

export type CalendarSummaryData = { schedules: CalendarSchedule[]; entrants: CalendarEntrant[]; completions: WorkCompletion[]; warning: string };

export async function getCalendarSummary(from: string, to: string, company = ""): Promise<CalendarSummaryData> {
  let warning = "";
  const [schedules, entrants, completions] = await Promise.all([
    getCalendarSchedules(from, to, company),
    getCalendarEntrants(from, to, company),
    getWorkCompletions(from, to, company, true).catch((error) => {
      warning = error instanceof Error ? error.message : "作業終了報告を取得できませんでした。";
      return [];
    }),
  ]);
  return { schedules, entrants, completions, warning };
}
