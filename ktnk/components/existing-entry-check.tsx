"use client";

import { useEffect, useMemo, useState } from "react";
import { LoadingIndicator } from "@/components/loading-indicator";
import type { NewEntrantRecord, ScheduleWithSubcompanies } from "@/lib/types";
import { shortDateWithWeekday } from "@/lib/utils";

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

  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError("");
    fetch(`/api/calendar?${new URLSearchParams({ from: requested[0], to: requested.at(-1)!, primaryCompany: company, kind })}`, { signal: controller.signal, cache: "no-store" })
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

  return <section className="panel space-y-4 p-5">
    <p className="text-lg font-bold">{existingDates.map(shortDateWithWeekday).join("、")}には、すでに作業が入力されています。</p>
    {schedules.map((row) => <article key={row.id} className="space-y-2 rounded-md bg-slate-50 p-4">
      <p className="font-semibold">{shortDateWithWeekday(row.work_date)}・{row.primary_company}</p>
      <p>{row.primary_company}・{row.primary_count ?? 0}人</p>
      {row.subcompanies.map((sub) => <p key={sub.id}>{sub.secondary_company}・{sub.worker_count ?? 0}人</p>)}
      <p className="whitespace-pre-wrap">{row.work_area} / {row.work_content}</p>
      {(row.aerial_work_vehicle_count ?? 0) > 0 && <p>高所作業車：{row.aerial_work_vehicle_count}台 使用フロア：{row.aerial_work_vehicle_floor}</p>}
      {requested.length === 1 && <button type="button" className="btn btn-primary w-full" onClick={() => onSchedule?.(row)}>内容を変更する</button>}
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
    {requested.length === 1 && <button type="button" className="btn btn-secondary w-full" onClick={onOtherDate}>別の日付を入力</button>}
  </section>;
}
