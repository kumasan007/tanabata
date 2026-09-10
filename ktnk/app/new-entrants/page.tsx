import { NewEntrantForm } from "@/components/new-entrant-form";
import { isWorkingDate, todayInTokyoString } from "@/lib/utils";
import { getCompanyMaster } from "@/lib/companies";

export const revalidate = 3600;
export default async function NewEntrantsPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string | string[];
    primaryCompany?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const master = await getCompanyMaster();
  const initialDate =
    typeof params.date === "string" && isWorkingDate(params.date)
      ? params.date
      : "";
  const initialCompany =
    typeof params.primaryCompany === "string" &&
    master.primaryCompanies.includes(params.primaryCompany)
      ? params.primaryCompany
      : "";
  return (
    <NewEntrantForm
      today={todayInTokyoString()}
      initialDate={initialDate}
      initialCompany={initialCompany}
      initialMaster={master}
    />
  );
}
