import { ScheduleForm } from "@/components/schedule-form";
import {
  addDays,
  parseLocalDate,
  todayInTokyoString,
  toDateString,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const today = todayInTokyoString();
  const tomorrow = toDateString(addDays(parseLocalDate(today)!, 1));
  return <ScheduleForm initialDate={tomorrow} today={today} />;
}
