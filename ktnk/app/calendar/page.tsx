import { WorkerCalendar } from "@/components/worker-calendar";
import { todayInTokyoString } from "@/lib/utils";
import { getCompanyMaster } from "@/lib/companies";
import { connection } from "next/server";

export default async function CalendarPage() {
  await connection();
  return <WorkerCalendar initialDate={todayInTokyoString()} initialMaster={await getCompanyMaster()} />;
}
