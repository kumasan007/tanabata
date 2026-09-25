"use client";
import { memo, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { CopyValue } from "@/components/copy-value";
import { completionTime } from "@/lib/completion-time";
import { parseTachiumaValue } from "@/lib/schedule-fields";
import type { CalendarEntrant, CompanyMaster, NewEntrantRecord, ScheduleWithSubcompanies } from "@/lib/types";
import type { WorkCompletion } from "@/lib/work-completions";
export const CalendarDetails = memo(function CalendarDetails({ detail, master, selectedDate, isToday, completionBusy, detailsExpanded, onEdit: setEditing, onEditEntrant: setEditingEntrant, onCompletion: saveCompletion }: {
  detail: { schedules: ScheduleWithSubcompanies[]; entrants: NewEntrantRecord[]; completions: WorkCompletion[] };
  master: CompanyMaster; selectedDate: string; isToday: boolean; completionBusy: boolean; detailsExpanded: boolean;
  onEdit: (row: ScheduleWithSubcompanies) => void; onEditEntrant: (row: NewEntrantRecord) => void;
  onCompletion: (date: string, company: string, report?: WorkCompletion, notes?: string) => Promise<void>;
}) {
  const { confirm, dialog: confirmationDialog } = useConfirmDialog();
  const [notesEditor, setNotesEditor] = useState<{ report: WorkCompletion; notes: string } | null>(null);
  const selectedCompletions = detail.completions;
  const completionMap = useMemo(() => new Map(detail.completions.map((row) => [row.primary_company, row])), [detail.completions]);
  const companyPriority = useMemo(
    () => new Map(master.primaryCompanies.map((primaryCompany, index) => [primaryCompany, index])),
    [master],
  );
  const { selectedSchedules, selectedEntrantGroups, scheduledCompanies } = useMemo(() => {
    const compareCompanyPriority = <T extends { primary_company: string }>(left: T, right: T) =>
      (companyPriority.get(left.primary_company) ?? Number.MAX_SAFE_INTEGER) -
        (companyPriority.get(right.primary_company) ?? Number.MAX_SAFE_INTEGER) ||
      left.primary_company.localeCompare(right.primary_company, "ja");
    const selectedSchedules = [...detail.schedules].sort(compareCompanyPriority);
    const selectedEntrants = [...detail.entrants].sort(compareCompanyPriority);
    const selectedEntrantGroups = Object.entries(Object.groupBy(selectedEntrants, (row) => row.primary_company))
      .map(([primaryCompany, rows]) => ({ primaryCompany, rows: rows ?? [] }))
      .sort((left, right) => compareCompanyPriority({ primary_company: left.primaryCompany }, { primary_company: right.primaryCompany }));
    return { selectedSchedules, selectedEntrantGroups, scheduledCompanies: new Set(selectedSchedules.map((row) => row.primary_company)) };
  }, [detail.schedules, detail.entrants, companyPriority]);
  function completionControls(primaryCompany: string) {
    const report = completionMap.get(primaryCompany);
    if (!report && !isToday) return null;
    return <div className="mt-1.5 grid gap-1 border-t border-border pt-1.5">
      {report ? <div className="rounded bg-emerald-100 px-2 py-1.5 text-emerald-900">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold">✓ 作業終了済み</p>
          {isToday && <div className="flex items-center gap-1"><IconButton label="備考を編集" className="h-8 w-8 border-emerald-700" disabled={completionBusy} onClick={(event) => { event.stopPropagation(); setNotesEditor({ report, notes: report.notes ?? "" }); }}><Pencil size={13} aria-hidden="true" /></IconButton><button type="button" className="inline-flex min-h-8 shrink-0 items-center justify-center rounded border border-emerald-700 bg-white px-2 text-xs font-semibold disabled:opacity-50" disabled={completionBusy} onClick={async (event) => { event.stopPropagation(); if (await confirm("作業終了報告を取り消しますか？", `${primaryCompany}の作業終了報告を取り消します。`, "取り消す")) void saveCompletion(selectedDate, primaryCompany, report); }}>取り消し</button></div>}
        </div>
        <p className="text-xs">報告時刻：{completionTime(report.reported_at)}</p>{report.notes && <p className="whitespace-pre-wrap break-words text-xs">備考：{report.notes}</p>}
      </div> : <button type="button" className="btn btn-secondary min-h-9 px-2 py-1 text-sm" disabled={completionBusy} onClick={(event) => { event.stopPropagation(); void saveCompletion(selectedDate, primaryCompany); }}>作業終了</button>}
    </div>;
  }
  function totalWorkers(row: ScheduleWithSubcompanies) {
    return (row.primary_count ?? 0) +
      row.subcompanies.reduce((sum, sub) => sum + (sub.worker_count ?? 0), 0);
  }

  function entrantSummary(rows: CalendarEntrant[]) {
    return {
      people: rows.reduce((sum, row) => sum + row.person_count, 0),
      companies: new Set(rows.map((row) => row.secondary_company || row.primary_company)).size,
    };
  }

  return <>
          {selectedSchedules.map((row) => {
            const subs = row.subcompanies.filter((sub) => (sub.worker_count ?? 0) > 0);
            const area = row.work_area;
            const content = row.work_content;
            const tachiumaNotes = parseTachiumaValue(row.tachiuma_notes).area;
            const tradeRoles = master.primaryTradeRolesByPrimary[row.primary_company] ?? [];
            const totalWorkerCount = totalWorkers(row);
            return <article key={row.id} className="panel min-w-0 p-3 text-sm">
              <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <p className="min-w-0 truncate font-bold" title={row.primary_company}>
                  <CopyValue value={row.primary_company} label="一次会社" compact stopPropagation />
                </p>
                {tradeRoles.length > 0 && (
                  <span className="max-w-full truncate text-xs font-normal text-slate-400" title={tradeRoles.join("・")}>
                    <CopyValue value={tradeRoles.join("・")} label="職種" compact stopPropagation />
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {row.uses_aerial_work_vehicle && <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-sm font-bold leading-none text-white shadow-sm" title="高所作業車あり">高</span>}
                {row.uses_tachiuma && <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold leading-none text-white shadow-sm" title="立ち馬使用あり">立</span>}
                {row.uses_fire && <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-sm font-bold leading-none text-white shadow-sm" title="火気使用あり">火</span>}
                <button type="button" className="btn btn-secondary h-11 min-h-11 w-11 p-0" disabled={completionBusy} onClick={() => setEditing(row)} aria-label={`${row.primary_company}の予定を編集`} title="予定を編集"><Pencil size={15} aria-hidden="true" /></button>
              </div>
              </div>
              <p className="mt-2 truncate text-slate-700" title={area ?? ""}>{area ? <CopyValue value={area} label="作業エリア" compact stopPropagation /> : "エリア未入力"}</p>
              <p className="truncate text-slate-600" title={content ?? ""}>{content ? <CopyValue value={content} label="作業内容" compact stopPropagation /> : "作業内容未入力"}</p>
              <details className="mt-2 rounded-md border border-border bg-slate-50">
                  <summary className="cursor-pointer px-2.5 py-2 font-semibold text-slate-700 marker:text-emerald-700">
                    合計 <CopyValue value={totalWorkerCount} label="合計人数" compact stopPropagation>{totalWorkerCount}人</CopyValue>
                  </summary>
                  <div className="grid gap-1.5 border-t border-border p-2.5">
                    {(row.primary_count ?? 0) > 0 && <div className="flex min-w-0 items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words">
                        <CopyValue value={row.primary_company} label="一次会社名" compact stopPropagation />
                        <span className="ml-1 text-xs text-slate-400">一次</span>
                      </span>
                      <span className="shrink-0 font-semibold text-primary">
                        <CopyValue value={row.primary_count ?? 0} label="一次会社人数" compact stopPropagation>{row.primary_count ?? 0}人</CopyValue>
                      </span>
                    </div>}
                    {subs.map((sub) => (
                      <div key={sub.id} className="flex min-w-0 items-baseline justify-between gap-3">
                        <span className="min-w-0 break-words">
                          {sub.secondary_company ? <CopyValue value={sub.secondary_company} label="二次会社名" compact stopPropagation /> : "会社名未入力"}
                          <span className="ml-1 text-xs text-slate-400">二次</span>
                        </span>
                        <span className="shrink-0 font-semibold text-primary">
                          <CopyValue value={sub.worker_count ?? 0} label="二次会社人数" compact stopPropagation>{sub.worker_count ?? 0}人</CopyValue>
                        </span>
                      </div>
                    ))}
                  </div>
              </details>
              {detailsExpanded && (row.uses_aerial_work_vehicle || row.uses_tachiuma || row.uses_fire || row.notes) && <div className="mt-2 grid gap-1 px-0.5">
                {row.uses_aerial_work_vehicle && <p className="text-sky-800">高車：<CopyValue value={equipmentText(row, "aerial_work_vehicle") || row.aerial_work_vehicle_notes || "使用あり"} label="高車の希望内容" compact stopPropagation /></p>}
                {row.uses_tachiuma && <p className="text-emerald-800">立ち馬：<CopyValue value={equipmentText(row, "tachiuma") || tachiumaNotes || "使用"} label="立ち馬の希望内容" compact stopPropagation /></p>}
                {row.uses_fire && row.fire_area && <p className="text-rose-800">火気連絡事項：{row.fire_area}</p>}
                {row.notes && <p className="whitespace-pre-wrap break-words border-t border-border pt-1.5 text-xs text-slate-500">備考：<CopyValue value={row.notes} label="備考" compact stopPropagation /></p>}
              </div>}
              {completionControls(row.primary_company)}
            </article>;
          })}
          {selectedEntrantGroups.map(({ primaryCompany, rows }) => {
            const summary = entrantSummary(rows);
            const companyGroups = Object.entries(Object.groupBy(rows, (row) => row.secondary_company || primaryCompany));
            return <article key={`entrant-${primaryCompany}`} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-bold"><CopyValue value={primaryCompany} label="一次会社名" compact stopPropagation />　新規入場</p>
              <details className="mt-2 rounded-md border border-amber-200 bg-white/70">
                <summary className="cursor-pointer px-3 py-2 font-semibold text-amber-900">{summary.companies}社・{summary.people}人</summary>
                <div className="grid gap-3 border-t border-amber-200 p-3">
                  {companyGroups.map(([companyName, companyRows]) => <div key={companyName}>
                    <p className="font-semibold">{companyName === primaryCompany ? `${primaryCompany}（一次会社所属）` : <CopyValue value={companyName} label="所属会社名" compact stopPropagation />}　{entrantSummary(companyRows ?? []).people}人</p>
                    <div className="mt-1 grid gap-1">{(companyRows ?? []).map((row) => <div key={row.id} className="flex min-w-0 items-center gap-2 rounded bg-amber-50 px-2 py-1.5"><button type="button" className="min-w-0 flex-1 text-left" disabled={completionBusy} onClick={() => setEditingEntrant(row)}><span className="break-words font-medium">{row.person_names || "氏名未入力"}</span>{row.person_count > 1 && <span className="ml-1 text-xs text-amber-800">（旧形式 {row.person_count}人）</span>}</button><button type="button" className="btn btn-secondary h-8 min-h-8 w-8 shrink-0 p-0" disabled={completionBusy} onClick={() => setEditingEntrant(row)} aria-label={`${row.person_names || "新規入場者"}を編集`}><Pencil size={14} /></button></div>)}</div>
                  </div>)}
                </div>
              </details>
            </article>;
          })}
          {selectedCompletions.filter((report) => !scheduledCompanies.has(report.primary_company)).map((report) => <article key={`completion-${report.primary_company}`} className="panel p-3 text-sm"><p className="font-bold">{report.primary_company}</p>{completionControls(report.primary_company)}</article>)}
          {notesEditor && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !completionBusy) setNotesEditor(null); }}><section role="dialog" aria-modal="true" aria-labelledby="completion-notes-title" className="panel w-full max-w-md p-5 shadow-xl"><h2 id="completion-notes-title" className="text-lg font-bold">作業終了の備考を編集</h2><p className="mt-1 text-sm text-slate-600">{notesEditor.report.primary_company}</p><label className="field mt-4"><span className="label">備考<span className="ml-2 text-sm font-normal text-slate-600">任意</span></span><textarea className="textarea" maxLength={2000} value={notesEditor.notes} onChange={(event) => setNotesEditor({ ...notesEditor, notes: event.target.value })} /></label><div className="mt-4 flex justify-end gap-2"><button type="button" className="btn btn-secondary" disabled={completionBusy} onClick={() => setNotesEditor(null)}>キャンセル</button><button type="button" className="btn btn-primary" disabled={completionBusy || notesEditor.notes.trim() === (notesEditor.report.notes ?? "")} onClick={async () => { await saveCompletion(selectedDate, notesEditor.report.primary_company, notesEditor.report, notesEditor.notes); setNotesEditor(null); }}>保存</button></div></section></div>}
          {confirmationDialog}
  </>;
});

function equipmentText(row: ScheduleWithSubcompanies, type: "aerial_work_vehicle" | "tachiuma") {
  return (row.equipmentRequests ?? []).filter(item => item.equipment_type === type).map(item => {
    const floor = Array.isArray(item.equipment_floor_master) ? item.equipment_floor_master[0] : item.equipment_floor_master;
    return `${floor?.name ?? "フロア"} ${item.requested_count}台`;
  }).join("、");
}
