"use client";

import { useEffect, useState } from "react";
import { LoadingIndicator } from "@/components/loading-indicator";
import type { NewEntrantRecord, ScheduleWithSubcompanies } from "@/lib/types";

type Records = { schedules: ScheduleWithSubcompanies[]; entrants: NewEntrantRecord[] };
export function ExistingEntryCheck({ date, company, kind, onNew, onOtherDate, onSchedule, onEntrant }: {
  date: string; company: string; kind: "schedule" | "entrant";
  onNew: () => void; onOtherDate: () => void;
  onSchedule?: (row: ScheduleWithSubcompanies) => void;
  onEntrant?: (row: NewEntrantRecord) => void;
}) {
  const [result, setResult] = useState<Records | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError("");
    fetch(`/api/calendar?${new URLSearchParams({ from: date, to: date, primaryCompany: company })}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || body.warning) throw new Error(body.error ?? body.warning ?? "取得できませんでした。");
        if (!controller.signal.aborted) setResult(body);
      }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "取得できませんでした。"); });
    return () => controller.abort();
  }, [date, company, retry]);
  useEffect(() => {
    if (!result) return;
    const exists = kind === "schedule"
      ? result.schedules.some((row) => row.primary_company === company && row.work_date === date)
      : result.entrants.some((row) => row.primary_company === company && row.entry_date === date);
    if (!exists) onNew();
  }, [result, kind, company, date, onNew]);
  if (error) return <section className="panel p-5"><p role="alert">{error}</p><button type="button" className="btn btn-primary mt-3" onClick={() => setRetry((v) => v + 1)}>再読み込み</button><button type="button" className="btn btn-secondary ml-2" onClick={onOtherDate}>別日を入力</button></section>;
  if (!result) return <LoadingIndicator label="入力済みの内容を確認しています…" />;
  const schedules = kind === "schedule" ? result.schedules.filter((row) => row.primary_company === company && row.work_date === date) : [];
  const entrants = kind === "entrant" ? result.entrants.filter((row) => row.primary_company === company && row.entry_date === date) : [];
  const exists = schedules.length + entrants.length > 0;
  return <section className="panel space-y-4 p-5">
    <h2 className="text-lg font-bold">{exists ? "既に入力されています。" : "この日付の入力はありません。"}</h2>
    {schedules.map((row) => <article key={row.id} className="space-y-2 rounded-md bg-slate-50 p-4">
      <p className="font-semibold">{row.primary_company}・{row.status === "work" ? "作業あり" : "作業なし"}</p>
      <p>一次会社 {row.status === "work" ? row.primary_count ?? 0 : row.next_primary_count ?? 0}人</p>
      {row.subcompanies.filter((sub) => sub.kind === (row.status === "work" ? "current" : "next_visit")).map((sub) => <p key={sub.id}>{sub.secondary_company}・{sub.worker_count ?? 0}人</p>)}
      {row.next_visit_date && <p>次回来場：{row.next_visit_date}</p>}
      <p className="whitespace-pre-wrap">{row.status === "work" ? row.work_area : row.next_work_area} / {row.status === "work" ? row.work_content : row.next_work_content}</p>
      {(row.aerial_work_vehicle_count ?? 0) > 0 && <p>高所作業車：{row.aerial_work_vehicle_count}台 使用フロア：{row.aerial_work_vehicle_floor}</p>}
      {row.notes && <p className="whitespace-pre-wrap">備考：{row.notes}</p>}
      <button type="button" className="btn btn-primary w-full" onClick={() => onSchedule?.(row)}>変更する</button>
    </article>)}
    {entrants.map((row) => <article key={row.id} className="space-y-2 rounded-md bg-slate-50 p-4">
      <p className="font-semibold">{row.secondary_company}・{row.person_count}人</p>
      <p className="text-sm text-slate-600">{row.nationality_status === "includes_foreign" ? "外国籍を含む" : row.nationality_status === "japanese_only" ? "日本籍のみ" : "国籍未確認"}</p>
      {row.person_names && <p className="whitespace-pre-wrap">{row.person_names}</p>}
      {row.notes && <p className="whitespace-pre-wrap">備考：{row.notes}</p>}
      <button type="button" className="btn btn-primary w-full" onClick={() => onEntrant?.(row)}>変更する</button>
    </article>)}
    {!exists && <button type="button" className="btn btn-primary w-full" onClick={onNew}>入力へ進む</button>}
    {exists && kind === "entrant" && <button type="button" className="btn btn-secondary w-full" onClick={onNew}>同じ日に別の二次会社を入力</button>}
    <button type="button" className="btn btn-secondary w-full" onClick={onOtherDate}>別日を入力</button>
  </section>;
}
