import type { ScheduleSubmitInput } from "@/lib/types";
import { parseLocalDate } from "@/lib/utils";

export function emptyScheduleForm(date: string): ScheduleSubmitInput {
  return {
    dates: date ? [date] : [], startDate: date, endDate: date,
    excludeWeekends: false, primaryCompany: "", primaryCount: 0,
    usePreviousPrimaryCount: false, currentSubcompanies: [], workArea: "",
    workContent: "", usesAerialWorkVehicle: false, aerialWorkVehicleNotes: "",
    aerialWorkVehicleRequests: [], usesFire: false, fireArea: "",
    usesTachiuma: false, tachiumaNotes: "", tachiumaRequests: [], notes: "",
  };
}

export function displayScheduleDate(value: string) {
  const date = parseLocalDate(value);
  return date ? new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(date) : "日付を選択";
}

export function displaySelectedScheduleDates(dates: string[] | undefined, start: string, end: string) {
  if (dates?.length) return dates.map(displayScheduleDate).join("、");
  return !end || start === end ? displayScheduleDate(start) : `${displayScheduleDate(start)}〜${displayScheduleDate(end)}`;
}

export function previousScheduleQuestion(workDate: string, today: string) {
  const current = parseLocalDate(today);
  const tomorrow = current ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1) : null;
  const tomorrowText = tomorrow ? `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}` : "";
  if (workDate === today) return "今日の作業と同じですか？";
  if (workDate === tomorrowText) return "明日の作業と同じですか？";
  return `${displayScheduleDate(workDate)}の作業と同じですか？`;
}
