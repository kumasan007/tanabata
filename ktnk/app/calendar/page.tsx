import { WorkerCalendar } from "@/components/worker-calendar";
import { datesInMonth } from "@/lib/calendar-dates";
import { isWorkingDate, todayInTokyoString } from "@/lib/utils";
import { getCompanyMaster } from "@/lib/companies";
import { getCalendarSummary } from "@/lib/calendar-summary";
import { monthRange } from "@/lib/calendar-dates";
import { getSchedules } from "@/lib/schedule-service";
import { getNewEntrants } from "@/lib/new-entrants";
import { getWorkCompletions } from "@/lib/work-completions";
import { connection } from "next/server";

export default async function CalendarPage() {
  await connection();
  const initialDate = todayInTokyoString();
  const range = monthRange(initialDate.slice(0, 7));
  const selectedDate = isWorkingDate(initialDate) ? initialDate : datesInMonth(initialDate.slice(0, 7)).find(date => date > initialDate) ?? datesInMonth(initialDate.slice(0, 7))[0];
  const [initialMaster, initialSummary, initialDetail] = await Promise.all([
    getCompanyMaster(),
    getCalendarSummary(range.from, range.to).catch(() => null),
    Promise.all([
      getSchedules({ dateFrom: selectedDate, dateTo: selectedDate }),
      getNewEntrants(selectedDate, selectedDate),
      getWorkCompletions(selectedDate, selectedDate),
    ]).then(([schedules, entrants, completions]) => ({ date: selectedDate, schedules, entrants, completions })).catch(() => null),
  ]);
  return <WorkerCalendar initialDate={initialDate} initialMaster={initialMaster} initialSummary={initialSummary} initialDetail={initialDetail} />;
}
