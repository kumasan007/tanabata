"use client";

import { useId, useRef, useState } from "react";

export function AddSecondaryCompany({ primaryCompany, onAdded }: {
  primaryCompany: string;
  onAdded: (company: string) => void;
}) {
  const id = useId();
  const pending = useRef(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function add() {
    if (pending.current || !name.trim()) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/companies/secondary", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ primaryCompany, secondaryCompany: name }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "追加に失敗しました。");
      onAdded(body.secondaryCompany);
      setName(""); setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "通信に失敗しました。"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="mt-3">
    {!open ? <button type="button" className="btn btn-secondary w-full" onClick={() => setOpen(true)}>会社名が見つからない場合：新規登録</button> : (
      <div className="grid gap-3 rounded-md border border-border bg-slate-50 p-3">
        <p className="text-sm">「{primaryCompany}」の二次会社として登録します。次回からも選択できます。</p>
        <label className="field" htmlFor={id}><span className="label">新しい二次会社名</span><input id={id} className="input" maxLength={200} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void add(); } }} /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void add()}>{busy ? "登録中…" : "登録して追加"}</button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>キャンセル</button>
        </div>
      </div>
    )}
  </div>;
}
