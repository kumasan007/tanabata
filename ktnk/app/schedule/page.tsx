import { ScheduleForm } from "@/components/schedule-form";
import { addDays, parseLocalDate, todayInTokyoString, toDateString } from "@/lib/utils";
import { getCompanyMaster } from "@/lib/companies";

export const revalidate = 3600;

export default async function SchedulePage() {
  const today = todayInTokyoString();
  const tomorrow = toDateString(addDays(parseLocalDate(today)!, 1));
  return <ScheduleForm initialDate={tomorrow} today={today} initialCompanyMaster={await getCompanyMaster()} />;
}
