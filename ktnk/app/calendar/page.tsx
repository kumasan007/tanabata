import { WorkerCalendar } from "@/components/worker-calendar";
import { todayInTokyoString } from "@/lib/utils";
import { getCompanyMaster } from "@/lib/companies";
import { getCalendarSummary } from "@/lib/calendar-summary";
import { monthRange } from "@/lib/calendar-dates";
import { connection } from "next/server";

export default async function CalendarPage() {
  await connection();
  const initialDate = todayInTokyoString();
  const range = monthRange(initialDate.slice(0, 7));
  const [initialMaster, initialSummary] = await Promise.all([
    getCompanyMaster(),
    getCalendarSummary(range.from, range.to).catch(() => null),
  ]);
  return <WorkerCalendar initialDate={initialDate} initialMaster={initialMaster} initialSummary={initialSummary} />;
}
