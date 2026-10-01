"use client";

import { useEffect, useId, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { InputAction } from "@/components/ui/input-action";
import { MutationNotice } from "@/components/ui/mutation-notice";

export function AddSecondaryCompany({ primaryCompany, onAdded, onBusyChange }: {
  primaryCompany: string;
  onAdded: (company: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const pending = useRef(false);
  const addedCallback = useRef(onAdded);
  useEffect(() => { addedCallback.current = onAdded; }, [onAdded]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function add() {
    if (pending.current || !name.trim()) return;
    pending.current = true; setBusy(true); onBusyChange?.(true); setError("");
    try {
      const response = await apiFetch("/api/companies/secondary", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ primaryCompany, secondaryCompany: name }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "追加に失敗しました。");
      addedCallback.current(body.secondaryCompany);
      setName(""); setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "通信に失敗しました。"); }
    finally { pending.current = false; setBusy(false); onBusyChange?.(false); }
  }
  return <div className="min-w-0">
    {!open ? <button type="button" className="btn btn-secondary w-full" aria-expanded={false} onClick={() => setOpen(true)}>一覧にない二次会社を追加</button> : (
      <div className="grid gap-2">
        <label className="label" htmlFor={id}>新しい二次会社名</label>
        <InputAction id={id} autoFocus maxLength={200} value={name} disabled={busy} actionLabel={busy ? "登録中…" : "登録"}
          actionDisabled={!name.trim()} onAction={() => void add()} onChange={event => setName(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void add(); } }} />
        <p className="text-sm text-slate-600">「{primaryCompany}」の二次会社として登録し、次回からも選択できます。</p>
        <MutationNotice message={error} />
        <button type="button" className="text-action justify-self-end" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>入力をやめる</button>
      </div>
    )}
  </div>;
}
