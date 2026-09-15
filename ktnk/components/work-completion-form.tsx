"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { WorkCompletion } from "@/lib/work-completions";
export function completionTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}
export function WorkCompletionForm({ date = "", primaryCompany, automaticDate = false, onSaved }: { date?: string; primaryCompany: string; automaticDate?: boolean; onSaved?: () => void }) {
  const [report, setReport] = useState<WorkCompletion | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setReady(false); setReport(null); setNotes(""); setMessage("");
    apiFetch(`/api/work-completions?${new URLSearchParams({ ...(automaticDate ? {} : { date }), primaryCompany })}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); if (controller.signal.aborted) return; const current = body.reports[0] ?? null; setReport(current); setNotes(current?.notes ?? ""); setReady(true); })
      .catch((error) => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [date, primaryCompany, automaticDate]);
  async function save(cancel: boolean) {
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch("/api/work-completions", { method: cancel ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: cancel ? report?.work_date : date || undefined, automaticDate: automaticDate && !cancel, primaryCompany, notes, expectedReportedAt: report?.reported_at }) });
      const body = await response.json();
      if (response.status === 409) { setReport(body.report); setMessage(body.error); onSaved?.(); return; }
      if (!response.ok) throw new Error(body.error);
      setReport(body.report); if (cancel) setNotes("");
      setMessage(cancel ? "作業終了報告を取り消しました。" : "作業終了を報告しました。"); onSaved?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }
  return <div className="grid min-w-0 gap-3">
    {!automaticDate && <p className="font-bold">{date}　{primaryCompany}</p>}
    {report && <div className="rounded-md bg-emerald-100 p-3 text-emerald-900"><p className="font-bold">すでに作業終了報告をしています。</p><p>報告時刻：{completionTime(report.reported_at)}</p>{report.notes && <p className="whitespace-pre-wrap break-words">備考：{report.notes}</p>}</div>}
    <label className="grid gap-1 text-sm font-semibold">備考<textarea className="input min-h-24" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="何かあれば入力してください" disabled={busy || !ready} /></label>
    <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-primary" disabled={busy || !ready} onClick={() => save(false)}>{busy ? "処理中…" : report ? "再度報告する" : "作業終了しました"}</button>{report && <button type="button" className="btn btn-secondary" disabled={busy || !ready} onClick={() => save(true)}>報告を取り消す</button>}</div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
