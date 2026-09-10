"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CompanyMaster, NewEntrantRecord } from "@/lib/types";

const PRIMARY = "__primary__";
const NEW_COMPANY = "__new_company__";

export function NewEntrantEditor({ record, master, onClose, onSaved }: { record: NewEntrantRecord; master: CompanyMaster; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const secondaryOptions = useMemo(() => master.secondariesByPrimary[record.primary_company] ?? [], [master, record.primary_company]);
  const initialCompany = record.secondary_company ? secondaryOptions.includes(record.secondary_company) ? record.secondary_company : NEW_COMPANY : PRIMARY;
  const [companyChoice, setCompanyChoice] = useState(initialCompany);
  const [newCompany, setNewCompany] = useState(initialCompany === NEW_COMPANY ? record.secondary_company ?? "" : "");
  const [personName, setPersonName] = useState(record.person_names ?? "");
  const [nationalityStatus, setNationalityStatus] = useState(record.nationality_status ?? "");
  const [notes, setNotes] = useState(record.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const legacy = record.person_count > 1;
  useEffect(() => { dialog.current?.showModal(); }, []);

  async function submit(remove = false) {
    if (busy) return;
    if (remove && !window.confirm(`${personName || "この新規入場者"}を削除しますか？`)) return;
    const secondaryCompany = companyChoice === PRIMARY ? "" : companyChoice === NEW_COMPANY ? newCompany.trim() : companyChoice;
    if (!remove && companyChoice === NEW_COMPANY && !secondaryCompany) { setError("新しい二次会社名を入力してください。"); return; }
    if (!remove && !personName.trim()) { setError("氏名を入力してください。"); return; }
    if (!remove && !nationalityStatus) { setError("日本人か外国人かを選択してください。"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/new-entrants${remove ? `?id=${encodeURIComponent(record.id)}` : ""}`, {
        method: remove ? "DELETE" : "PATCH", headers: { "content-type": "application/json" },
        ...(!remove ? { body: JSON.stringify({ id: record.id, entryDate: record.entry_date, primaryCompany: record.primary_company, secondaryCompany, personName, nationalityStatus, notes }) } : {}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "保存に失敗しました。");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "通信に失敗しました。"); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} className="admin-dashboard m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-md border border-border p-4 backdrop:bg-black/40">
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">新規入場者を編集</h2><button type="button" className="btn btn-secondary h-9 min-h-9 px-3" onClick={onClose}><X size={16} />閉じる</button></div><p className="mb-4 text-sm text-slate-600">{record.entry_date} / {record.primary_company}</p>
      {legacy && <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">旧形式で登録された{record.person_count}人分のデータです。内容を保持するため、個人編集はできません。</p>}
      <fieldset disabled={busy || legacy} className="grid gap-3"><div className="field"><span className="label">所属会社（必須）</span><div className="flex flex-col gap-2 sm:flex-row"><select className="input min-w-0 flex-1" value={companyChoice === NEW_COMPANY ? "" : companyChoice} onChange={(event) => { setCompanyChoice(event.target.value); setNewCompany(""); }} disabled={companyChoice === NEW_COMPANY}>{secondaryOptions.map((company) => <option key={company}>{company}</option>)}<option value={PRIMARY}>{record.primary_company}</option></select><button type="button" className="btn btn-secondary h-[46px] min-h-[46px] shrink-0 px-3" onClick={() => { setCompanyChoice(NEW_COMPANY); setNewCompany(""); }}><Plus size={18} aria-hidden="true" />新しい二次会社を追加</button></div>{companyChoice === NEW_COMPANY && <div className="mt-2 flex gap-2"><input autoFocus className="input min-w-0 flex-1" aria-label="新しい二次会社名" value={newCompany} maxLength={200} onChange={(event) => setNewCompany(event.target.value)} placeholder="新しい二次会社名" /><button type="button" className="btn btn-secondary h-[46px] min-h-[46px] w-[46px] shrink-0 p-0" onClick={() => { setCompanyChoice(initialCompany === NEW_COMPANY ? PRIMARY : initialCompany); setNewCompany(""); }} aria-label="追加を取り消す"><X size={18} /></button></div>}</div>
        <label className="field"><span className="label">氏名（必須）</span><input className="input" required value={personName} onChange={(event) => setPersonName(event.target.value)} /></label><fieldset className="field"><legend className="label">国籍（必須）</legend><div className="grid grid-cols-2 gap-2"><button type="button" className="status-option" aria-pressed={nationalityStatus === "japanese_only"} onClick={() => setNationalityStatus("japanese_only")}>日本人</button><button type="button" className="status-option" aria-pressed={nationalityStatus === "includes_foreign"} onClick={() => setNationalityStatus("includes_foreign")}>外国人</button></div></fieldset><label className="field"><span className="label">備考（任意）</span><textarea className="textarea" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-4 flex gap-2"><button type="submit" className="btn btn-primary" disabled={busy || legacy}>保存</button><button type="button" className="btn btn-secondary" onClick={onClose}>閉じる</button><button type="button" className="btn btn-secondary ml-auto text-red-700" disabled={busy} onClick={() => void submit(true)}>削除</button></div>
    </form></dialog>;
}
