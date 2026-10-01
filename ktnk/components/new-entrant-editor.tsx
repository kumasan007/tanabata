"use client";
import "@/components/admin/admin-controls.css";

import { Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { CompanyMaster, NewEntrantRecord } from "@/lib/types";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api-client";
import { recordMutationParams } from "@/lib/record-version";
import { EntrantFields } from "@/components/entrant-fields";
import { MutationNotice } from "@/components/ui/mutation-notice";
import { emptyEntrantDraft, entrantPerson, entrantDraftError, entrantToDraft } from "@/lib/entrant-form-model";

export function NewEntrantEditor({ record: initialRecord, master: initialMaster, onClose, onSaved }: { record: NewEntrantRecord; master: CompanyMaster; onClose: () => void; onSaved: () => void }) {
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [record, setRecord] = useState(initialRecord);
  const [master, setMaster] = useState(initialMaster);
  const [draft, setDraft] = useState(() => entrantToDraft(initialRecord));
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const pending = useRef(false);
  const requestId = useRef<string | null>(null);
  const legacy = record.person_count > 1;
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);

  async function reload() {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      let response = await apiFetch(`/api/new-entrants?id=${encodeURIComponent(adding && requestId.current ? requestId.current : record.id)}`);
      if (adding && response.status === 404) response = await apiFetch(`/api/new-entrants?id=${encodeURIComponent(record.id)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "最新の内容を読み込めませんでした。");
      const companyResponse = await apiFetch("/api/companies");
      const companies = await companyResponse.json();
      if (!companyResponse.ok) throw new Error(companies.error ?? "会社一覧を読み込めませんでした。");
      setRecord(body.record); setMaster(companies); setDraft(entrantToDraft(body.record)); setAdding(false); setError(""); setConflict(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "読み込みに失敗しました。"); }
    finally { pending.current = false; setBusy(false); }
  }
  async function submit(remove = false) {
    if (pending.current) return;
    if (!remove) { const validation = entrantDraftError(draft); if (validation) { setError(validation); return; } }
    pending.current = true; setBusy(true);
    try {
      if (remove && !await confirm("この入場者を削除しますか？", record.person_names || "この新規入場者", "削除する")) return;
      setError(""); setConflict(false);
      requestId.current ??= crypto.randomUUID();
      const person = entrantPerson(draft, adding ? requestId.current : record.id);
      const response = await apiFetch(`/api/new-entrants${remove ? `?${recordMutationParams(record.id, record.updated_at)}` : ""}`, {
        method: remove ? "DELETE" : adding ? "POST" : "PATCH", headers: { "content-type": "application/json" },
        ...(!remove ? { body: JSON.stringify(adding
          ? { entryDate: record.entry_date, primaryCompany: record.primary_company, people: [person] }
          : { ...person, entryDate: record.entry_date, primaryCompany: record.primary_company, expectedUpdatedAt: record.updated_at }) } : {}),
      });
      const body = await response.json();
      if (!response.ok) { setConflict(response.status === 409); throw new Error(body.error ?? "保存に失敗しました。"); }
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "通信に失敗しました。"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <><dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!pending.current) onClose(); }} className="admin-dashboard modal-dialog max-w-2xl !p-4">
    <form onSubmit={event => { event.preventDefault(); void submit(); }}><div className="flex items-center justify-between gap-3"><h2 id={titleId} className="text-lg font-bold">{adding ? "同じ会社に新規入場者を追加" : "新規入場者を編集"}</h2><button type="button" className="btn btn-secondary h-9 min-h-9 px-3" disabled={busy} onClick={onClose}><X size={16} />閉じる</button></div><p className="mb-4 text-sm text-slate-600">{record.entry_date} / {record.primary_company}</p>
      {legacy && !adding && <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">旧形式で登録された{record.person_count}人分のデータです。個人編集はできません。</p>}
      <fieldset disabled={busy || (legacy && !adding)}><EntrantFields primaryCompany={record.primary_company} secondaryOptions={master.secondariesByPrimary[record.primary_company] ?? []} draft={draft} onChange={fields => setDraft(current => ({ ...current, ...fields }))} /></fieldset>
      <MutationNotice message={error} busy={busy} onReload={conflict ? () => void reload() : undefined} />
      <div className="mt-4 flex flex-wrap gap-2"><button type="submit" className="btn btn-primary" disabled={busy || (legacy && !adding)}>{busy ? "処理中…" : adding ? "この人を登録" : "変更を保存"}</button>{!adding && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setAdding(true); setDraft(emptyEntrantDraft(entrantToDraft(record).companyChoice)); requestId.current = null; setError(""); setConflict(false); }}><Plus size={18} aria-hidden="true" />同じ所属会社に人を追加</button>}{adding && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setAdding(false); setDraft(entrantToDraft(record)); setError(""); setConflict(false); }}>追加をやめる</button>}{!adding && <button type="button" className="btn btn-secondary ml-auto text-red-700" disabled={busy} onClick={() => void submit(true)}>削除</button>}</div>
    </form></dialog>{confirmationDialog}</>;
}
