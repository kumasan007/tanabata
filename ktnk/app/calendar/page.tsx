import { WorkerCalendar } from "@/components/worker-calendar";
import { todayInTokyoString } from "@/lib/utils";

export const dynamic = "force-dynamic";
export default function CalendarPage() { return <WorkerCalendar initialMonth={todayInTokyoString().slice(0, 7)} />; }
