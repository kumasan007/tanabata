import { WorkCompletionPage } from "@/components/work-completion-page";
import { getCompanyMaster } from "@/lib/companies";
import { getScheduledCompletionCompanies } from "@/lib/work-completions";
import { todayInTokyoString } from "@/lib/utils";
import { connection } from "next/server";
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string; primaryCompany?: string }> }) {
  await connection();
  const [params, master, scheduledCompanies] = await Promise.all([searchParams, getCompanyMaster(), getScheduledCompletionCompanies(todayInTokyoString())]);
  const companies = master.primaryCompanies.filter((company) => scheduledCompanies.has(company));
  return <WorkCompletionPage companies={companies} initialCompany={companies.includes(params.primaryCompany ?? "") ? params.primaryCompany! : ""} />;
}
