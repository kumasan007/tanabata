"use client";

import { useEffect, useRef, useState } from "react";
import type { CompanyMaster, ScheduleSubmitInput, ScheduleWithSubcompanies } from "@/lib/types";
import { SubcompanyFields } from "@/components/subcompany-fields";

export function AdminScheduleEditor({ schedule, master, onClose, onSaved }: {
  schedule: ScheduleWithSubcompanies;
  master: CompanyMaster | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ScheduleSubmitInput>(() => ({
    startDate: schedule.work_date, endDate: schedule.work_date, excludeWeekends: false,
    primaryCompany: schedule.primary_company, status: schedule.status,
    primaryCount: schedule.primary_count, workArea: schedule.work_area ?? "", workContent: schedule.work_content ?? "",
    nextVisitDate: schedule.next_visit_date, nextPrimaryCount: schedule.next_primary_count,
    nextWorkArea: schedule.next_work_area ?? "", nextWorkContent: schedule.next_work_content ?? "",
    currentSubcompanies: schedule.subcompanies.filter((row) => row.kind === "current").map((row) => ({ secondaryCompany: row.secondary_company ?? "", workerCount: row.worker_count })),
    nextSubcompanies: schedule.subcompanies.filter((row) => row.kind === "next_visit").map((row) => ({ secondaryCompany: row.secondary_company ?? "", workerCount: row.worker_count })),
  }));
  useEffect(() => { dialog.current?.showModal(); }, []);
  const work = form.status === "work";
  const countField = work ? "primaryCount" : "nextPrimaryCount";
  const areaField = work ? "workArea" : "nextWorkArea";
  const contentField = work ? "workContent" : "nextWorkContent";
  const rowsField = work ? "currentSubcompanies" : "nextSubcompanies";
  const options = [...new Set([...(master?.secondariesByPrimary[schedule.primary_company] ?? []), ...schedule.subcompanies.map((row) => row.secondary_company ?? "")])].filter(Boolean);

  async function submit(remove = false) {
    if (busy) return;
    if (remove && !window.confirm(`${schedule.work_date}「${schedule.primary_company}」の予定を削除しますか？二次会社の人数内訳も削除されます。`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/schedules${remove ? `?id=${encodeURIComponent(schedule.id)}` : ""}`, {
        method: remove ? "DELETE" : "PATCH",
        headers: { "content-type": "application/json" },
        ...(remove ? {} : { body: JSON.stringify({ ...form, id: schedule.id }) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "保存に失敗しました。");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "通信に失敗しました。"); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} className="admin-dashboard m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-md border border-border p-4 backdrop:bg-black/40">
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <h2 className="text-lg font-bold">予定を編集</h2>
      <p className="mb-4 text-sm text-slate-600">{schedule.work_date} / {schedule.primary_company}</p>
      <fieldset disabled={busy} className="grid gap-3">
        <label className="field"><span className="label">作業予定</span><select className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ScheduleSubmitInput["status"] })}><option value="work">作業あり</option><option value="no_work">作業なし</option></select></label>
        {!work && <label className="field"><span className="label">次回来場予定日（任意）</span><input className="input" type="date" value={form.nextVisitDate ?? ""} onChange={(event) => setForm({ ...form, nextVisitDate: event.target.value || null })} /></label>}
        <label className="field"><span className="label">一次会社人数{work ? "（必須）" : "（任意）"}</span><input className="input" type="number" min={0} step={1} required={work} value={form[countField] ?? ""} onChange={(event) => setForm({ ...form, [countField]: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <SubcompanyFields title="二次会社" rows={form[rowsField]} options={options} countRequired={work} onChange={(rows) => setForm({ ...form, [rowsField]: rows })} />
        <label className="field"><span className="label">作業エリア{work ? "（必須）" : "（任意）"}</span><input className="input" required={work} value={form[areaField]} onChange={(event) => setForm({ ...form, [areaField]: event.target.value })} /></label>
        <label className="field"><span className="label">作業内容{work ? "（必須）" : "（任意）"}</span><textarea className="textarea" required={work} value={form[contentField]} onChange={(event) => setForm({ ...form, [contentField]: event.target.value })} /></label>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "処理中…" : "保存"}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>キャンセル</button>
        <button type="button" className="btn btn-secondary ml-auto text-red-700" disabled={busy} onClick={() => void submit(true)}>この予定を削除</button>
      </div>
    </form>
  </dialog>;
}
