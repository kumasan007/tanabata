import { unstable_cache } from "next/cache";
import { createServerClient } from "@/lib/supabase";
import { DATA_CACHE_TAGS } from "@/lib/data-cache";
import type { CalendarSchedule, CalendarEntrant } from "@/lib/types";

export const getCalendarSchedules = unstable_cache(async (from: string, to: string, company: string): Promise<CalendarSchedule[]> => {
  let query = createServerClient().from("schedule_groups").select(
    `id,work_date,primary_company,primary_count,aerial_work_vehicle_count,uses_fire,uses_tachiuma,
    ${company ? "work_area,work_content,tachiuma_notes," : ""}schedule_subcompanies(worker_count)`,
  ).order("work_date");
  if (from) query = query.gte("work_date", from);
  if (to) query = query.lte("work_date", to);
  if (company) query = query.eq("primary_company", company);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  // The conditional select only adds the text shown by the company calendar.
  const rows = (data ?? []) as unknown as (Omit<CalendarSchedule, "total_workers"> & {
    primary_count: number | null; schedule_subcompanies: { worker_count: number | null }[];
  })[];
  return rows.map(({ primary_count, schedule_subcompanies, ...row }) => ({
    ...row,
    total_workers: (primary_count ?? 0) + schedule_subcompanies.reduce((sum, sub) => sum + (sub.worker_count ?? 0), 0),
  }));
}, ["calendar-schedules-v1"], { tags: [DATA_CACHE_TAGS.schedules], revalidate: 300 });

export const getCalendarEntrants = unstable_cache(async (from: string, to: string, company: string): Promise<CalendarEntrant[]> => {
  let query = createServerClient().from("new_entrant_records")
    .select("entry_date,primary_company,secondary_company,person_count");
  if (from) query = query.gte("entry_date", from);
  if (to) query = query.lte("entry_date", to);
  if (company) query = query.eq("primary_company", company);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}, ["calendar-entrants-v1"], { tags: [DATA_CACHE_TAGS.entrants], revalidate: 300 });
