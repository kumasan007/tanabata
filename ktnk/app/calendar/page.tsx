import { WorkerCalendar } from "@/components/worker-calendar";
import { todayInTokyoString } from "@/lib/utils";

export const dynamic = "force-dynamic";
export default function CalendarPage() { return <WorkerCalendar initialDate={todayInTokyoString()} />; }
