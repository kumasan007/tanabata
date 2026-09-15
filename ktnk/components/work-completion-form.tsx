"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { completionTime } from "@/lib/completion-time";
import { apiFetch } from "@/lib/api-client";
import { LoadingIndicator } from "@/components/loading-indicator";
import type { WorkCompletion } from "@/lib/work-completions";

export function WorkCompletionForm({ date = "", primaryCompany, automaticDate = false, onSaved }: {
  date?: string; primaryCompany: string; automaticDate?: boolean; onSaved?: () => void;
}) {
  const [report, setReport] = useState<WorkCompletion | null>(null);
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState<"save" | "cancel" | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [submitted, setSubmitted] = useState<"report" | "notes" | null>(null);
  const [editing, setEditing] = useState(false);
  const [retry, setRetry] = useState(0);
  const pending = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const busy = action !== null;

  useEffect(() => {
    const controller = new AbortController();
    requestController.current = controller;
    pending.current = false;
    setReady(false); setReport(null); setNotes(""); setMessage(null);
    setSubmitted(null); setEditing(false); setAction(null);
    apiFetch(`/api/work-completions?${new URLSearchParams({ ...(automaticDate ? {} : { date }), primaryCompany })}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "報告状況を確認できませんでした。");
        if (controller.signal.aborted) return;
        const current = body.reports[0] ?? null;
        setReport(current); setNotes(current?.notes ?? ""); setReady(true);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessage({ text: error instanceof Error ? error.message : "報告状況を確認できませんでした。", error: true });
      });
    return () => controller.abort();
  }, [date, primaryCompany, automaticDate, retry]);

  async function save(cancel: boolean) {
    if (pending.current || !ready || (cancel && !report)) return;
    pending.current = true;
    const controller = requestController.current;
    setAction(cancel ? "cancel" : "save"); setMessage(null);
    try {
      const response = await apiFetch("/api/work-completions", {
        method: cancel ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller?.signal,
        body: JSON.stringify({ date: cancel ? report?.work_date : date || undefined, automaticDate: automaticDate && !cancel, primaryCompany, notes, expectedReportedAt: report?.reported_at }),
      });
      const body = await response.json();
      if (controller?.signal.aborted) return;
      if (response.status === 409) {
        const current = body.report ?? null;
        setReport(current); setNotes(current?.notes ?? ""); setSubmitted(null); setEditing(false);
        setMessage({ text: "報告状況が変更されました。最新の内容を確認してください。", error: true });
        onSaved?.(); return;
      }
      if (!response.ok) throw new Error(body.error ?? "保存できませんでした。");
      setReport(body.report); setNotes(body.report?.notes ?? ""); setEditing(false);
      setSubmitted(cancel ? null : report ? "notes" : "report");
      if (cancel) setMessage({ text: "作業終了報告を取り消しました。", error: false });
      onSaved?.();
    } catch (error) {
      if (!controller?.signal.aborted) setMessage({ text: error instanceof Error ? error.message : "保存できませんでした。", error: true });
    } finally {
      if (!controller?.signal.aborted) { pending.current = false; setAction(null); }
    }
  }

  return <div className="grid min-w-0 gap-4" aria-busy={busy}>
    {!automaticDate && <p className="font-bold">{date}　{primaryCompany}</p>}
    {!ready && !message && <LoadingIndicator label="報告状況を確認中…" />}
    {report && <section role="status" className="notice-success">
      <div className="flex items-start gap-2">
        <CheckCircle2 size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{submitted === "notes" ? "備考の変更を保存しました" : submitted === "report" ? "作業終了を報告しました" : "作業終了は報告済みです"}</h2>
          {submitted === "report" && <p className="mt-1">報告の送信は完了しています。</p>}
          <p className="mt-2 text-sm">報告時刻：{completionTime(report.reported_at)}</p>
          {report.notes && <p className="mt-1 whitespace-pre-wrap break-words text-sm">備考：{report.notes}</p>}
        </div>
      </div>
    </section>}
    {ready && (!report || editing) && <>
      <label className="field"><span className="label">備考<span className="ml-2 text-sm font-normal text-slate-600">任意</span></span>
        <textarea className="textarea" rows={3} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="連絡事項があれば入力してください" disabled={busy} />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn btn-primary flex-1" disabled={busy || (Boolean(report) && notes.trim() === report?.notes)} onClick={() => void save(false)}>{action === "save" ? "送信中…" : report ? "備考の変更を保存" : "作業終了を報告する"}</button>
        {editing && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setNotes(report?.notes ?? ""); setEditing(false); setMessage(null); }}>変更をやめる</button>}
      </div>
    </>}
    {ready && report && !editing && <div className="flex flex-col gap-2 sm:flex-row">
      <button type="button" className="btn btn-secondary flex-1" disabled={busy} onClick={() => { setEditing(true); setMessage(null); }}>備考を変更</button>
      <button type="button" className="btn btn-secondary flex-1 text-destructive" disabled={busy} onClick={() => void save(true)}>{action === "cancel" ? "取り消し中…" : "報告を取り消す"}</button>
    </div>}
    {message && <p role={message.error ? "alert" : "status"} className={message.error ? "notice-error" : "notice-success"}>{message.text}</p>}
    {!ready && message && <button type="button" className="btn btn-secondary" onClick={() => setRetry((value) => value + 1)}>もう一度確認する</button>}
  </div>;
}
