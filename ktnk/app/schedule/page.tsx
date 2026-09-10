import { ScheduleForm } from "@/components/schedule-form";
import { isWorkingDate, todayInTokyoString } from "@/lib/utils";
import { getCompanyMaster } from "@/lib/companies";

export const revalidate = 3600;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const today = todayInTokyoString();
  const requestedDate = (await searchParams).date;
  const initialDate =
    typeof requestedDate === "string" && isWorkingDate(requestedDate)
      ? requestedDate
      : "";
  return (
    <ScheduleForm
      today={today}
      initialDate={initialDate}
      initialCompanyMaster={await getCompanyMaster()}
    />
  );
}
