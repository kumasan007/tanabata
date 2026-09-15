import { createServerClient } from "@/lib/supabase";
export type WorkCompletion = { work_date: string; primary_company: string; reported_at: string; notes: string };
export async function getWorkCompletions(from?: string | null, to?: string | null, company?: string | null) {
  let query = createServerClient().from("work_completion_reports").select("work_date,primary_company,reported_at,notes");
  if (from) query = query.gte("work_date", from);
  if (to) query = query.lte("work_date", to);
  if (company) query = query.eq("primary_company", company);
  const { data, error } = await query;
  if (error) throw new Error(error.code === "PGRST205" || error.code === "42P01" ? "作業終了報告のデータベース設定が必要です。" : error.message);
  return (data ?? []) as WorkCompletion[];
}

export async function getScheduledCompletionCompanies(date: string, company?: string) {
  let query = createServerClient().from("schedule_groups")
    .select("primary_company").eq("work_date", date);
  if (company) query = query.eq("primary_company", company).limit(1);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.primary_company as string));
}
