import type { RefObject } from "react";
import { displayScheduleDate, displaySelectedScheduleDates } from "@/lib/schedule-form-model";

export type ScheduleSubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; dates: string[] }
  | { status: "error"; message: string };

export function ScheduleSubmitStatus({ state, dates, startDate, endDate, totalCount, busy, disabled, resultRef, onContinue, onReset }: {
  state: ScheduleSubmitState;
  dates?: string[];
  startDate: string;
  endDate: string;
  totalCount: number;
  busy: boolean;
  disabled: boolean;
  resultRef: RefObject<HTMLDivElement | null>;
  onContinue: () => void;
  onReset: () => void;
}) {
  if (state.status === "success") return <div ref={resultRef} tabIndex={-1} role="status" className="notice-success p-5"><h2 className="text-lg font-bold text-primary">作業予定を送信しました</h2><p className="mt-2 text-base">{state.dates.map(displayScheduleDate).join("、")}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" className="btn btn-primary" onClick={onContinue}>引き続き入力</button><button type="button" className="btn btn-secondary" onClick={onReset}>新しく入力</button></div></div>;
  return <div className="submit-bar">{state.status === "error" && <div ref={resultRef} tabIndex={-1} role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{state.message}</div>}<div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{displaySelectedScheduleDates(dates, startDate, endDate)}</p><p className="mt-1 text-sm text-slate-600">合計 {totalCount} 人</p></div><button type="submit" className="btn btn-primary min-h-14 px-5" disabled={busy || disabled}>{busy ? "送信中…" : "予定を送信"}</button></div></div>;
}
