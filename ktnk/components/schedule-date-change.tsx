"use client";

import { useState } from "react";
import { isWorkingDate } from "@/lib/utils";

export function ScheduleDateChange({ id, originalDate, onSaved, disabled = false, onBusyChange }: {
  id: string; originalDate: string; onSaved: () => void; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(originalDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (busy || disabled) return;
    if (!isWorkingDate(date)) { setError("月曜〜土曜の日付を選択してください。"); return; }
    setBusy(true); onBusyChange?.(true); setError("");
    try {
      const response = await fetch("/api/schedules/date", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, originalDate, date }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "日付の変更に失敗しました。");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "日付の変更に失敗しました。"); }
    finally { setBusy(false); onBusyChange?.(false); }
  }

  if (!open) return <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => setOpen(true)}>日付だけ変更</button>;
  return <div className="min-w-0 space-y-2 rounded-md border border-slate-300 p-3">
    <p className="text-sm">登録済みの内容をそのままに、{originalDate} の予定を移動します。</p>
    <label className="field min-w-0"><span className="label">変更先の日付</span><input type="date" className="input min-w-0 max-w-full" value={date} disabled={busy || disabled} onChange={(event) => setDate(event.target.value)} /></label>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-primary" disabled={busy || disabled || !date || date === originalDate} onClick={() => void save()}>{busy ? "変更中…" : "この日付に移動"}</button>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>キャンセル</button>
    </div>
    {error && <p role="alert" className="notice-error text-sm">{error}</p>}
  </div>;
}
