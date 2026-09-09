"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CompanyMaster, NewEntrantRecord } from "@/lib/types";

type EntrantForm = {
  entryDate: string;
  primaryCompany: string;
  secondaryCompany: string;
  personCount: number | null;
  personNames: string;
  nationalityStatus: "japanese_only" | "includes_foreign" | "";
  notes: string;
};

type Affiliation = "primary" | "secondary";

export function NewEntrantEditor({ record, master, onClose, onSaved }: {
  record: NewEntrantRecord;
  master: CompanyMaster;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<EntrantForm>(() => ({
    entryDate: record.entry_date,
    primaryCompany: record.primary_company,
    secondaryCompany: record.secondary_company,
    personCount: record.person_count,
    personNames: record.person_names ?? "",
    nationalityStatus: record.nationality_status ?? "",
    notes: record.notes ?? "",
  }));
  const [affiliation, setAffiliation] = useState<Affiliation>(record.secondary_company ? "secondary" : "primary");
  const secondaryOptions = useMemo(
    () => [...new Set([...(master.secondariesByPrimary[record.primary_company] ?? []), record.secondary_company])],
    [master, record.primary_company, record.secondary_company],
  );

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function submit(remove = false) {
    if (busy) return;
    if (remove && !window.confirm(`${record.entry_date}「${record.secondary_company || "一次会社所属"}」の新規入場を削除しますか？`)) return;
    if (!remove && affiliation === "secondary" && !form.secondaryCompany.trim()) {
      setError("二次会社を選択または入力してください。");
      return;
    }
    if (!remove && (form.personCount == null || form.personCount < 1)) {
      setError("新規入場者を1人以上入力してください。");
      return;
    }
    if (!remove && !form.nationalityStatus) {
      setError("日本籍のみか、外国籍を含むかを選択してください。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/new-entrants${remove ? `?id=${encodeURIComponent(record.id)}` : ""}`, {
        method: remove ? "DELETE" : "PATCH",
        headers: { "content-type": "application/json" },
        ...(!remove ? { body: JSON.stringify({ ...form, id: record.id }) } : {}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "保存に失敗しました。");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return <dialog
    ref={dialog}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => {
      if (busy || event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const clickedOutside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (clickedOutside) onClose();
    }}
    className="admin-dashboard m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-md border border-border p-4 backdrop:bg-black/40"
  >
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">新規入場を編集</h2>
        <button type="button" className="btn btn-secondary h-9 min-h-9 px-3" disabled={busy} onClick={onClose}>
          <X size={16} aria-hidden="true" />
          閉じる
        </button>
      </div>
      <p className="mb-4 text-sm text-slate-600">{record.entry_date} / {record.primary_company}</p>
      <fieldset disabled={busy} className="grid gap-3">
        <fieldset className="field"><legend className="label">所属会社（必須）</legend><div className="grid grid-cols-2 gap-2"><button type="button" className="status-option" aria-pressed={affiliation === "primary"} onClick={() => { setAffiliation("primary"); setForm({ ...form, secondaryCompany: "" }); }}>一次会社所属</button><button type="button" className="status-option" aria-pressed={affiliation === "secondary"} onClick={() => setAffiliation("secondary")}>二次会社所属</button></div></fieldset>
        {affiliation === "secondary" && <label className="field"><span className="label">二次会社（必須）</span><input className="input" required list="entrant-editor-secondary-options" value={form.secondaryCompany} onChange={(event) => setForm({ ...form, secondaryCompany: event.target.value })} /><datalist id="entrant-editor-secondary-options">{secondaryOptions.filter(Boolean).map((company) => <option key={company} value={company} />)}</datalist></label>}
        <label className="field"><span className="label">初めて入る人数（必須）</span><input className="input" type="number" inputMode="numeric" min={1} step={1} required value={form.personCount ?? ""} onChange={(event) => setForm({ ...form, personCount: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <fieldset className="field"><legend className="label">国籍確認（必須）</legend><div className="grid grid-cols-2 gap-2"><button type="button" className="status-option" aria-pressed={form.nationalityStatus === "japanese_only"} onClick={() => setForm({ ...form, nationalityStatus: "japanese_only" })}>日本籍のみ</button><button type="button" className="status-option" aria-pressed={form.nationalityStatus === "includes_foreign"} onClick={() => setForm({ ...form, nationalityStatus: "includes_foreign" })}>外国籍を含む</button></div></fieldset>
        <label className="field"><span className="label">氏名（必須）</span><textarea className="textarea" rows={3} required maxLength={1000} value={form.personNames} onChange={(event) => setForm({ ...form, personNames: event.target.value })} /></label>
        <label className="field"><span className="label">備考（任意）</span><textarea className="textarea" rows={3} maxLength={2000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "処理中…" : "保存"}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>閉じる</button>
        <button type="button" className="btn btn-secondary ml-auto text-red-700" disabled={busy} onClick={() => void submit(true)}>この新規入場を削除</button>
      </div>
    </form>
  </dialog>;
}
