import { createServerClient } from "@/lib/supabase";
import { unstable_cache } from "next/cache";
import { DATA_CACHE_TAGS } from "@/lib/data-cache";
export type WorkCompletion = { work_date: string; primary_company: string; reported_at: string; notes: string };
const getCachedWorkCompletions = unstable_cache(async (from: string, to: string, company: string, summary: boolean) => {
  let query = createServerClient().from("work_completion_reports").select(summary ? "work_date,primary_company,reported_at" : "work_date,primary_company,reported_at,notes");
  if (from) query = query.gte("work_date", from);
  if (to) query = query.lte("work_date", to);
  if (company) query = query.eq("primary_company", company);
  const { data, error } = await query;
  if (error) throw new Error(error.code === "PGRST205" || error.code === "42P01" ? "作業終了報告のデータベース設定が必要です。" : error.message);
  const rows = (data ?? []) as unknown as WorkCompletion[];
  return summary ? rows.map((row) => ({ ...row, notes: "" })) : rows;
}, ["work-completions-v1"], { tags: [DATA_CACHE_TAGS.completions], revalidate: 300 });

export function getWorkCompletions(from?: string | null, to?: string | null, company?: string | null, summary = false) {
  return getCachedWorkCompletions(from ?? "", to ?? "", company?.trim() ?? "", summary);
}

export async function getScheduledCompletionCompanies(date: string, company?: string) {
  let query = createServerClient().from("schedule_groups")
    .select("primary_company").eq("work_date", date);
  if (company) query = query.eq("primary_company", company).limit(1);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.primary_company as string));
}
