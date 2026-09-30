"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { SchedulePreview } from "@/components/schedule-preview";
import { ScheduleDateChange } from "@/components/schedule-date-change";
import { scheduleToCopyData } from "@/lib/schedule-copy";
import { LoadingIndicator } from "@/components/loading-indicator";
import type { NewEntrantRecord, ScheduleWithSubcompanies } from "@/lib/types";
import { shortDateWithWeekday } from "@/lib/utils";
import { calendarApiParams } from "@/lib/calendar-dates";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

type Records = { schedules: ScheduleWithSubcompanies[]; entrants: NewEntrantRecord[] };

export function ExistingEntryCheck({ date, dates, company, kind, onNew, onOtherDate, onSchedule, onEntrant, onOverwrite, onSkip }: {
  date: string; dates?: string[]; company: string; kind: "schedule" | "entrant";
  onNew: () => void; onOtherDate: () => void;
  onSchedule?: (row: ScheduleWithSubcompanies) => void;
  onEntrant?: (row: NewEntrantRecord) => void;
  onOverwrite?: () => void;
  onSkip?: (dates: string[]) => void;
}) {
  const requested = useMemo(() => dates?.length ? [...dates].sort() : [date], [date, dates]);
  const requestedKey = requested.join(",");
  const [result, setResult] = useState<Records | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();

  async function removeSchedule(row: ScheduleWithSubcompanies) {
    if (!await confirm("この予定を削除しますか？", `${shortDateWithWeekday(row.work_date)}「${row.primary_company}」\n人数内訳や設備情報も削除されます。`, "削除する")) return;
    setDeletingId(row.id); setError("");
    try {
      const response = await apiFetch(`/api/schedules?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "予定を削除できませんでした。");
      onOtherDate();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "予定を削除できませんでした。"); }
    finally { setDeletingId(null); }
  }

  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError("");
    apiFetch(`/api/calendar?${calendarApiParams({ from: requested[0], to: requested.at(-1)!, primaryCompany: company, kind })}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || body.warning) throw new Error(body.error ?? body.warning ?? "取得できませんでした。");
        if (!controller.signal.aborted) setResult(body);
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "取得できませんでした。"); });
    return () => controller.abort();
  }, [company, kind, requestedKey, retry]);

  const requestedSet = useMemo(() => new Set(requested), [requestedKey]);
  const schedules = result && kind === "schedule" ? result.schedules.filter((row) => row.primary_company === company && requestedSet.has(row.work_date)) : [];
  const entrants = result && kind === "entrant" ? result.entrants.filter((row) => row.primary_company === company && requestedSet.has(row.entry_date)) : [];
  const exists = schedules.length + entrants.length > 0;

  useEffect(() => { if (result && !exists) onNew(); }, [result, exists, onNew]);

  if (error) return <section className="panel p-5"><p role="alert">{error}</p><button type="button" className="btn btn-primary mt-3" onClick={() => setRetry((v) => v + 1)}>再読み込み</button></section>;
  if (!result || !exists) return <LoadingIndicator label="入力済みの内容を確認しています…" />;
  const existingDates = schedules.map((row) => row.work_date);

  return <><section className="panel space-y-4 p-5">
    <p className="text-lg font-bold">{existingDates.map(shortDateWithWeekday).join("、")}には、すでに作業が入力されています。</p>
    {schedules.map((row) => <article key={row.id} className="space-y-2 rounded-md bg-slate-50 p-4">
      <SchedulePreview primaryCompany={row.primary_company} schedule={scheduleToCopyData(row)!} notes={row.notes} hideZeroSecondaryCompanies />
      {requested.length === 1 && <div className="grid grid-cols-2 gap-2 [&>div]:col-span-2">
        <ScheduleDateChange id={row.id} originalDate={row.work_date} onSaved={onOtherDate} disabled={deletingId === row.id} />
        <button type="button" className="btn btn-primary w-full" disabled={deletingId === row.id} onClick={() => onSchedule?.(row)}>内容を変更</button>
      </div>}
      {requested.length === 1 && <button type="button" className="btn btn-secondary w-full text-red-700" disabled={deletingId === row.id} onClick={() => void removeSchedule(row)}>{deletingId === row.id ? "削除中…" : "予定を削除"}</button>}
    </article>)}
    {entrants.map((row) => <article key={row.id} className="space-y-2 rounded-md bg-slate-50 p-4">
      <p className="font-semibold">{row.secondary_company || "一次会社所属"}・{row.person_count}人</p>
      <button type="button" className="btn btn-primary w-full" onClick={() => onEntrant?.(row)}>変更する</button>
    </article>)}
    {kind === "schedule" && requested.length > 1 && <div className="grid gap-3">
      <button type="button" className="btn btn-primary w-full" onClick={onOverwrite}>既存の入力を上書きして、すべて登録</button>
      <button type="button" className="btn btn-secondary w-full" onClick={() => onSkip?.(existingDates)}>入力済みの日を除いて登録</button>
    </div>}
    {exists && kind === "entrant" && <button type="button" className="btn btn-secondary w-full" onClick={onNew}>同じ日に別の所属会社を入力</button>}
    {requested.length === 1 && <button type="button" className="btn btn-secondary w-full" onClick={onOtherDate}>別の日付に新しく入力</button>}
  </section>{confirmationDialog}</>;
}
