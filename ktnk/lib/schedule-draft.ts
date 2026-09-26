import type { ScheduleSubmitInput } from "@/lib/types";

const KEY = "ktnk:schedule-draft:v1";
const MAX_AGE = 2 * 60 * 60_000;

export function loadScheduleDraft(): ScheduleSubmitInput | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as {
      savedAt?: number;
      form?: ScheduleSubmitInput;
    } | null;
    if (!saved?.form || !saved.savedAt || Date.now() - saved.savedAt > MAX_AGE) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return saved.form;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
}

export function saveScheduleDraft(form: ScheduleSubmitInput) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), form }));
}

export function clearScheduleDraft() {
  if (typeof window !== "undefined") sessionStorage.removeItem(KEY);
}
