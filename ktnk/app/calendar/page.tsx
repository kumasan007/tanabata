import { WorkerCalendar } from "@/components/worker-calendar";
import { todayInTokyoString } from "@/lib/utils";
import { getCompanyMaster } from "@/lib/companies";

export const revalidate = 3600;
export default async function CalendarPage() {
  return <WorkerCalendar initialDate={todayInTokyoString()} initialMaster={await getCompanyMaster()} />;
}
