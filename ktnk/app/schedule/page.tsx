import { ScheduleForm } from "@/components/schedule-form";
import { todayInTokyoString } from "@/lib/utils";
import { getCompanyMaster } from "@/lib/companies";

export const revalidate = 3600;

export default async function SchedulePage() {
  const today = todayInTokyoString();
  return <ScheduleForm today={today} initialCompanyMaster={await getCompanyMaster()} />;
}
