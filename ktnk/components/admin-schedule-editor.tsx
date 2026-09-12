"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CompanyMaster, ScheduleSubmitInput, ScheduleWithSubcompanies } from "@/lib/types";
import { CompanyPeopleFields } from "@/components/schedule-form";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

export function AdminScheduleEditor({ schedule, master, onClose, onSaved, workerMode = false }: {
  schedule: ScheduleWithSubcompanies;
  master: CompanyMaster | null;
  onClose: () => void;
  onSaved: () => void;
  workerMode?: boolean;
}) {
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();
  const secondaryCompanies = [...new Set([
    ...(master?.secondariesByPrimary[schedule.primary_company] ?? []),
    ...schedule.subcompanies.map((row) => row.secondary_company ?? ""),
  ])].filter(Boolean);
  const savedCounts = new Map(schedule.subcompanies.map((row) => [row.secondary_company ?? "", row.worker_count]));
  const initialAerialWorkVehicles = schedule.aerialWorkVehicles?.length
    ? schedule.aerialWorkVehicles.map((row) => ({ workArea: row.work_area, vehicleCount: row.vehicle_count }))
    : (schedule.aerial_work_vehicle_count ?? 0) > 0
      ? [{ workArea: schedule.aerial_work_vehicle_floor ?? "", vehicleCount: schedule.aerial_work_vehicle_count }]
      : [];
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ScheduleSubmitInput>(() => ({
    startDate: schedule.work_date, endDate: schedule.work_date, excludeWeekends: false,
    primaryCompany: schedule.primary_company,
    primaryCount: schedule.primary_count, workArea: schedule.work_area ?? "", workContent: schedule.work_content ?? "",
    aerialWorkVehicleCount: schedule.aerial_work_vehicle_count,
    aerialWorkVehicleFloor: schedule.aerial_work_vehicle_floor ?? "",
    aerialWorkVehicles: initialAerialWorkVehicles,
    usesFire: schedule.uses_fire,
    notes: schedule.notes ?? "",
    currentSubcompanies: secondaryCompanies.map((secondaryCompany) => ({ secondaryCompany, workerCount: savedCounts.get(secondaryCompany) ?? 0 })),
  }));
  useEffect(() => { dialog.current?.showModal(); }, []);

  function setAerialVehicles(vehicles: NonNullable<ScheduleSubmitInput["aerialWorkVehicles"]>) {
    setForm((current) => ({
      ...current,
      aerialWorkVehicles: vehicles,
      aerialWorkVehicleCount: vehicles.reduce((sum, row) => sum + (row.vehicleCount ?? 0), 0),
      aerialWorkVehicleFloor: vehicles.map((row) => row.workArea).filter(Boolean).join("、"),
    }));
  }

  async function submit(remove = false) {
    if (busy) return;
    if (remove && !await confirm("この予定を削除しますか？", `${schedule.work_date}「${schedule.primary_company}」\n二次会社の人数内訳も削除されます。`, "削除する")) return;
    if (!remove && (form.aerialWorkVehicles ?? []).some((row) => (row.vehicleCount ?? 0) < 1)) {
      setError("高所作業車の希望台数を1以上の整数で入力してください。");
      return;
    }
    if (!remove && (form.aerialWorkVehicles ?? []).some((row) => !row.workArea.trim())) {
      setError("高所作業車の使用場所を入力してください。");
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

  return <><dialog
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
        <CompanyPeopleFields
          primaryCompany={form.primaryCompany}
          primaryCount={form.primaryCount}
          primaryCountCopied={false}
          previousPrimaryCount={null}
          subcompanies={form.currentSubcompanies}
          previousCounts={new Map()}
          showPrevious={false}
          onPrimaryCountChange={(primaryCount) => setForm({ ...form, primaryCount })}
          onSubcompaniesChange={(currentSubcompanies) => setForm({ ...form, currentSubcompanies })}
        />
        <label className="field"><span className="label">作業エリア（必須）</span><input className="input" required value={form.workArea} onChange={(event) => setForm({ ...form, workArea: event.target.value })} /></label>
        <label className="field"><span className="label">作業内容（必須）</span><textarea className="textarea" required value={form.workContent} onChange={(event) => setForm({ ...form, workContent: event.target.value })} /></label>
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
          <p className="label">高所作業車を使用しますか？</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="status-option" aria-pressed={(form.aerialWorkVehicles?.length ?? 0) > 0} onClick={() => { if (!form.aerialWorkVehicles?.length) setAerialVehicles([{ workArea: "", vehicleCount: 1 }]); }}>使用する</button>
            <button type="button" className="status-option" aria-pressed={(form.aerialWorkVehicles?.length ?? 0) === 0} onClick={() => setAerialVehicles([])}>使用しない</button>
          </div>
          {(form.aerialWorkVehicles ?? []).map((vehicle, index) => <div key={index} className="mt-3 grid gap-2 rounded-lg border border-sky-200 bg-white p-3 sm:grid-cols-[1fr_7rem_auto]">
            <label className="field"><span className="label">使用場所（必須）</span><input className="input" required maxLength={100} value={vehicle.workArea} placeholder="例：10階" onChange={(event) => setAerialVehicles((form.aerialWorkVehicles ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, workArea: event.target.value } : row))} /></label>
            <label className="field"><span className="label">台数</span><input className="input" type="number" inputMode="numeric" min={1} step={1} required value={vehicle.vehicleCount ?? ""} onChange={(event) => setAerialVehicles((form.aerialWorkVehicles ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, vehicleCount: event.target.value === "" ? null : Math.max(1, Number(event.target.value)) } : row))} /></label>
            <button type="button" className="btn btn-secondary self-end px-4 text-xl" aria-label={`${index + 1}件目の高所作業車を削除`} onClick={() => setAerialVehicles((form.aerialWorkVehicles ?? []).filter((_, rowIndex) => rowIndex !== index))}>×</button>
          </div>)}
          {(form.aerialWorkVehicles?.length ?? 0) > 0 && <button type="button" className="btn btn-secondary mt-3 w-full" onClick={() => setAerialVehicles([...(form.aerialWorkVehicles ?? []), { workArea: "", vehicleCount: 1 }])}>使用場所を追加</button>}
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3"><p className="label">火気の使用</p><div className="grid grid-cols-2 gap-2"><button type="button" className="status-option" aria-pressed={form.usesFire} onClick={() => setForm({ ...form, usesFire: true })}>する</button><button type="button" className="status-option" aria-pressed={!form.usesFire} onClick={() => setForm({ ...form, usesFire: false })}>しない</button></div></div>
        <label className="field"><span className="label">備考（任意）</span><textarea className="textarea" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "処理中…" : "保存"}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>閉じる</button>
        <button type="button" className="btn btn-secondary ml-auto text-red-700" disabled={busy} onClick={() => void submit(true)}>この予定を削除</button>
      </div>
    </form>
  </dialog>{confirmationDialog}</>;
}
