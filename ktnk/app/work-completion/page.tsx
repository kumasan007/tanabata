import { WorkCompletionPage } from "@/components/work-completion-page";
import { getCompanyMaster } from "@/lib/companies";
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string; primaryCompany?: string }> }) {
  const [params, master] = await Promise.all([searchParams, getCompanyMaster()]);
  return <WorkCompletionPage companies={master.primaryCompanies} initialCompany={master.primaryCompanies.includes(params.primaryCompany ?? "") ? params.primaryCompany! : ""} />;
}
