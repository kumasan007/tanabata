"use client";

import { isWorkingDate } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CompanyMaster, ScheduleSubmitInput, ScheduleWithSubcompanies } from "@/lib/types";
import { SubcompanyFields } from "@/components/subcompany-fields";

export function AdminScheduleEditor({ schedule, master, onClose, onSaved, workerMode = false }: {
  schedule: ScheduleWithSubcompanies;
  master: CompanyMaster | null;
  onClose: () => void;
  onSaved: () => void;
  workerMode?: boolean;
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
    aerialWorkVehicleCount: schedule.aerial_work_vehicle_count,
    aerialWorkVehicleFloor: schedule.aerial_work_vehicle_floor ?? "",
    notes: schedule.notes ?? "",
    currentSubcompanies: schedule.subcompanies.filter((row) => row.kind === "current").map((row) => ({ secondaryCompany: row.secondary_company ?? "", workerCount: row.worker_count })),
    nextSubcompanies: schedule.subcompanies.filter((row) => row.kind === "next_visit").map((row) => ({ secondaryCompany: row.secondary_company ?? "", workerCount: row.worker_count })),
  }));
  const [aerialWorkVehicleCountInput, setAerialWorkVehicleCountInput] = useState(
    schedule.aerial_work_vehicle_count === null ? "" : String(schedule.aerial_work_vehicle_count),
  );
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    setAerialWorkVehicleCountInput(
      form.aerialWorkVehicleCount === null ? "" : String(form.aerialWorkVehicleCount),
    );
  }, [form.aerialWorkVehicleCount]);
  const work = form.status === "work";
  const countField = work ? "primaryCount" : "nextPrimaryCount";
  const areaField = work ? "workArea" : "nextWorkArea";
  const contentField = work ? "workContent" : "nextWorkContent";
  const rowsField = work ? "currentSubcompanies" : "nextSubcompanies";
  const options = [...new Set([...(master?.secondariesByPrimary[schedule.primary_company] ?? []), ...schedule.subcompanies.map((row) => row.secondary_company ?? "")])].filter(Boolean);

  async function submit(remove = false) {
    if (busy) return;
    if (remove && !window.confirm(`${schedule.work_date}「${schedule.primary_company}」の予定を削除しますか？二次会社の人数内訳も削除されます。`)) return;
    if (!remove && (form.aerialWorkVehicleCount ?? 0) > 0 && (!/^\d+$/.test(aerialWorkVehicleCountInput) || Number(aerialWorkVehicleCountInput) < 1)) {
      setError("高所作業車の希望台数を1以上の整数で入力してください。");
      return;
    }
    setBusy(true); setError("");
    try {
      const endpoint = workerMode
        ? `/api/schedules${remove ? `?id=${encodeURIComponent(schedule.id)}` : ""}`
        : `/api/admin/schedules${remove ? `?id=${encodeURIComponent(schedule.id)}` : ""}`;
      const response = await fetch(endpoint, {
        method: remove ? "DELETE" : workerMode ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        ...(!remove ? { body: JSON.stringify({ ...form, id: schedule.id, overwriteExisting: true }) } : {}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "保存に失敗しました。");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "通信に失敗しました。"); }
    finally { setBusy(false); }
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
        <h2 className="text-lg font-bold">予定を編集</h2>
        <button type="button" className="btn btn-secondary h-9 min-h-9 px-3" disabled={busy} onClick={onClose}>
          <X size={16} aria-hidden="true" />
          閉じる
        </button>
      </div>
      <p className="mb-4 text-sm text-slate-600">{schedule.work_date} / {schedule.primary_company}</p>
      <fieldset disabled={busy} className="grid gap-3">
        <label className="field"><span className="label">作業予定</span><select className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ScheduleSubmitInput["status"] })}><option value="work">作業あり</option><option value="no_work">作業なし</option></select></label>
        {!work && <label className="field"><span className="label">次回来場予定日（任意）</span><input className="input" type="date" value={form.nextVisitDate ?? ""} onChange={(event) => { if (event.target.value && !isWorkingDate(event.target.value)) { setError("日曜日は入力できません。月曜〜土曜を選択してください。"); return; } setError(""); setForm({ ...form, nextVisitDate: event.target.value || null }); }} /></label>}
        <label className="field"><span className="label">一次会社人数{work ? "（必須）" : "（任意）"}</span><input className="input" type="number" min={0} step={1} required={work} value={form[countField] ?? ""} onChange={(event) => setForm({ ...form, [countField]: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <SubcompanyFields title="二次会社" rows={form[rowsField]} options={options} countRequired={work} onChange={(rows) => setForm({ ...form, [rowsField]: rows })} />
        <label className="field"><span className="label">作業エリア{work ? "（必須）" : "（任意）"}</span><input className="input" required={work} value={form[areaField]} onChange={(event) => setForm({ ...form, [areaField]: event.target.value })} /></label>
        <label className="field"><span className="label">作業内容{work ? "（必須）" : "（任意）"}</span><textarea className="textarea" required={work} value={form[contentField]} onChange={(event) => setForm({ ...form, [contentField]: event.target.value })} /></label>
        <label className="field"><span className="label">備考（任意）</span><textarea className="textarea" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        {(work || form.nextVisitDate) && <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3"><p className="label">高所作業車を使用しますか？</p><div className="grid grid-cols-2 gap-2"><button type="button" className="status-option" aria-pressed={(form.aerialWorkVehicleCount ?? 0) > 0} onClick={() => { const count = Math.max(1, form.aerialWorkVehicleCount ?? 1); setAerialWorkVehicleCountInput(String(count)); setForm({ ...form, aerialWorkVehicleCount: count }); }}>使用する</button><button type="button" className="status-option" aria-pressed={form.aerialWorkVehicleCount === 0} onClick={() => setForm({ ...form, aerialWorkVehicleCount: 0, aerialWorkVehicleFloor: "" })}>使用しない</button></div>{(form.aerialWorkVehicleCount ?? 0) > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-[8rem_1fr]"><label className="field"><span className="label">希望台数</span><input className="input" type="number" inputMode="numeric" min={1} step={1} required value={aerialWorkVehicleCountInput} onChange={(event) => { const value = event.target.value; setAerialWorkVehicleCountInput(value); if (/^\d+$/.test(value) && Number(value) >= 1) setForm({ ...form, aerialWorkVehicleCount: Number(value) }); }} /></label><label className="field"><span className="label">使用フロア（必須）</span><input className="input" required maxLength={100} value={form.aerialWorkVehicleFloor} onChange={(event) => setForm({ ...form, aerialWorkVehicleFloor: event.target.value })} /></label></div>}</div>}
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "処理中…" : "保存"}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>閉じる</button>
        <button type="button" className="btn btn-secondary ml-auto text-red-700" disabled={busy} onClick={() => void submit(true)}>この予定を削除</button>
      </div>
    </form>
  </dialog>;
}
