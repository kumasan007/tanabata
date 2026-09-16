import { isWorkingDate, parseLocalDate, todayInTokyoString } from "@/lib/utils";

export function monthRange(month: string) {
  const [year, value] = month.split("-").map(Number);
  const last = new Date(year, value, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
export function shiftMonth(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
export function datesInMonth(month: string) {
  const range = monthRange(month);
  const result: string[] = [];
  for (let day = 1; day <= Number(range.to.slice(-2)); day++) result.push(`${month}-${String(day).padStart(2, "0")}`);
  return result.filter(isWorkingDate);
}

export function calendarQueryRange(from: string | null, to: string | null) {
  if ((from && !parseLocalDate(from)) || (to && !parseLocalDate(to))) return null;
  const defaults = monthRange((from || to || todayInTokyoString()).slice(0, 7));
  const range = { from: from || defaults.from, to: to || defaults.to };
  if (range.from > range.to || Date.parse(range.to) - Date.parse(range.from) > 365 * 86_400_000) return null;
  return range;
}
