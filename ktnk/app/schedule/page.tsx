import { ScheduleForm } from "@/components/schedule-form";
import { isWorkingDate, todayInTokyoString } from "@/lib/utils";
import { getCompanyMaster } from "@/lib/companies";

export const revalidate = 3600;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string | string[];
    primaryCompany?: string | string[];
  }>;
}) {
  const today = todayInTokyoString();
  const params = await searchParams;
  const companyMaster = await getCompanyMaster();
  const requestedDate = params.date;
  const initialDate =
    typeof requestedDate === "string" && isWorkingDate(requestedDate)
      ? requestedDate
      : "";
  const initialCompany =
    typeof params.primaryCompany === "string" &&
    companyMaster.primaryCompanies.includes(params.primaryCompany)
      ? params.primaryCompany
      : "";
  return (
    <ScheduleForm
      today={today}
      initialDate={initialDate}
      initialCompany={initialCompany}
      initialCompanyMaster={companyMaster}
    />
  );
}
