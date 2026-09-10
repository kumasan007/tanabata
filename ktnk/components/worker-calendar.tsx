"use client";

import { LoadingIndicator } from "@/components/loading-indicator";
import { CopyValue } from "@/components/copy-value";
import { isWorkingDate } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminScheduleEditor } from "@/components/admin-schedule-editor";
import { NewEntrantEditor } from "@/components/new-entrant-editor";
import type { CompanyMaster, NewEntrantRecord, ScheduleWithSubcompanies } from "@/lib/types";

function monthRange(month: string) {
  const [year, value] = month.split("-").map(Number);
  const last = new Date(year, value, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
function shiftMonth(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function datesInMonth(month: string) {
  const range = monthRange(month);
  const result: string[] = [];
  for (let day = 1; day <= Number(range.to.slice(-2)); day++) result.push(`${month}-${String(day).padStart(2, "0")}`);
  return result.filter(isWorkingDate);
}
export function WorkerCalendar({ initialDate, initialMaster }: { initialDate: string; initialMaster: CompanyMaster }) {
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(isWorkingDate(initialDate) ? initialDate : datesInMonth(initialDate.slice(0, 7)).find((date) => date > initialDate) ?? datesInMonth(initialDate.slice(0, 7))[0]);
  const [company, setCompany] = useState("");
  const [master] = useState<CompanyMaster>(initialMaster);
  const [schedules, setSchedules] = useState<ScheduleWithSubcompanies[]>([]);
  const [entrants, setEntrants] = useState<NewEntrantRecord[]>([]);
  const [editing, setEditing] = useState<ScheduleWithSubcompanies | null>(null);
  const [editingEntrant, setEditingEntrant] = useState<NewEntrantRecord | null>(null);
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  const selectedDaySectionRef = useRef<HTMLElement>(null);
  const range = monthRange(month);
  const requestKey = JSON.stringify([month, company, version]);
  const [loadedKey, setLoadedKey] = useState("");
  const loading = loadedKey !== requestKey;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (company) params.set("primaryCompany", company);
    setMessage("");
    fetch(`/api/calendar?${params}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      if (controller.signal.aborted) return;
      setSchedules(body.schedules ?? []); setEntrants(body.entrants ?? []); setMessage(body.warning ?? "");
    }).catch((error) => {
      if (!controller.signal.aborted) { setSchedules([]); setEntrants([]); setMessage(error instanceof Error ? error.message : "取得できませんでした。"); }
    }).finally(() => { if (!controller.signal.aborted) setLoadedKey(requestKey); });
    return () => controller.abort();
  }, [month, company, version, range.from, range.to, requestKey]);
  const days = useMemo(() => datesInMonth(month), [month]);
  const scheduleMap = useMemo(() => Object.groupBy(loading ? [] : schedules.filter((row) => !company || row.primary_company === company), (row) => row.work_date), [schedules, company, loading]);
  const entrantMap = useMemo(() => Object.groupBy(loading ? [] : entrants.filter((row) => !company || row.primary_company === company), (row) => row.entry_date), [entrants, company, loading]);
  const companyPriority = useMemo(
    () => new Map(master.primaryCompanies.map((primaryCompany, index) => [primaryCompany, index])),
    [master],
  );
  const compareCompanyPriority = <T extends { primary_company: string }>(left: T, right: T) =>
    (companyPriority.get(left.primary_company) ?? Number.MAX_SAFE_INTEGER) -
      (companyPriority.get(right.primary_company) ?? Number.MAX_SAFE_INTEGER) ||
    left.primary_company.localeCompare(right.primary_company, "ja");
  const selectedSchedules = [...(scheduleMap[selectedDate] ?? [])].sort(compareCompanyPriority);
  const selectedEntrants = [...(entrantMap[selectedDate] ?? [])].sort(compareCompanyPriority);
  const firstDayOffset = (new Date(`${month}-01T00:00:00`).getDay() + 6) % 7 % 6;
  const weekdays = ["月", "火", "水", "木", "金", "土"];

  function selectMonth(nextMonth: string) {
    if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
    setMonth(nextMonth);
    setSelectedDate(datesInMonth(nextMonth)[0]);
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    window.requestAnimationFrame(() => {
      selectedDaySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function totalWorkers(row: ScheduleWithSubcompanies) {
    return (row.primary_count ?? 0) +
      row.subcompanies.reduce((sum, sub) => sum + (sub.worker_count ?? 0), 0);
  }

  return <div className="min-h-screen pb-10">
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4">
      <div className="panel flex min-w-0 flex-wrap items-end gap-3 p-3 sm:p-4">
        <div className="min-w-0 w-full sm:w-auto">
          <label className="sr-only" htmlFor="calendar-month">表示月</label>
          <div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_3rem] items-stretch gap-2 sm:grid-cols-[auto_11rem_auto]">
            <button type="button" className="btn btn-secondary h-12 w-12 px-0 sm:h-14 sm:w-auto sm:px-4" onClick={() => selectMonth(shiftMonth(month, -1))} aria-label="前月を表示">
              <ChevronLeft size={20} aria-hidden="true" />
              <span className="hidden sm:inline">前月</span>
            </button>
            <div className="relative h-12 min-w-0 overflow-hidden rounded-md border border-input bg-white sm:h-14">
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-2 text-base font-semibold text-slate-800">{Number(month.slice(0, 4))}年{Number(month.slice(5))}月</span>
              <input id="calendar-month" aria-label="表示する月" className="calendar-month" type="month" value={month} onChange={(e) => selectMonth(e.target.value)} />
            </div>
            <button type="button" className="btn btn-secondary h-12 w-12 px-0 sm:h-14 sm:w-auto sm:px-4" onClick={() => selectMonth(shiftMonth(month, 1))} aria-label="次月を表示">
              <span className="hidden sm:inline">次月</span>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
        <label className="field w-full sm:ml-auto sm:w-56"><span className="label">一次会社</span><select className="input" value={company} onChange={(e) => setCompany(e.target.value)}><option value="">すべて</option>{master?.primaryCompanies.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      {message && <p role="alert" className="mt-4 text-red-700">{message}</p>}
      {loading ? <div className="panel mt-4"><LoadingIndicator label="カレンダーを読み込み中…" /></div> : <section className="panel mt-4 overflow-x-auto">
        <div className={`grid grid-cols-6 border-b border-border bg-slate-50 text-center text-xs font-semibold text-slate-500 ${company ? "min-w-[56rem]" : ""}`}>
          {weekdays.map((weekday, index) => <div key={weekday} className={`py-2 ${index === 5 ? "bg-sky-50/70 text-sky-700" : ""}`}>{weekday}</div>)}
        </div>
        <div className={`grid grid-cols-6 bg-border/70 gap-px ${company ? "min-w-[56rem]" : ""}`}>
          {Array.from({ length: firstDayOffset }, (_, index) => <div key={`blank-${index}`} className="min-h-20 bg-slate-50" />)}
          {days.map((date) => {
            const daySchedules = scheduleMap[date] ?? [];
            const dayEntrants = entrantMap[date] ?? [];
            const total = daySchedules.reduce((sum, row) => sum + totalWorkers(row), 0);
            const totalAerialVehicles = daySchedules.reduce(
              (sum, row) => sum + (row.aerial_work_vehicle_count ?? 0),
              0,
            );
            const isSaturday = new Date(`${date}T00:00:00`).getDay() === 6;
            return <div key={date} onClick={() => selectDate(date)} className={`min-h-20 min-w-0 cursor-pointer p-1.5 text-left align-top transition hover:bg-emerald-50 sm:min-h-24 sm:p-2 ${selectedDate === date ? "relative z-10 bg-emerald-50 ring-2 ring-inset ring-primary" : isSaturday ? "bg-sky-50/70" : "bg-white"}`}>
              <button type="button" onClick={(event) => { event.stopPropagation(); selectDate(date); }} aria-pressed={selectedDate === date} className="block w-full text-left text-sm font-bold">{Number(date.slice(-2))}</button>
              {!company && daySchedules.length > 0 && <span className="mt-1 flex flex-col rounded bg-emerald-100 px-1 py-0.5 text-[11px] font-semibold leading-4 text-emerald-900 sm:text-xs"><span>{daySchedules.length}社</span><span>{total}人</span>{totalAerialVehicles > 0 && <span className="text-sky-800"><span className="hidden sm:inline">高車：</span>{totalAerialVehicles}台</span>}</span>}
              {!company && dayEntrants.length > 0 && <span className="mt-1 block text-[10px] font-semibold leading-4 text-amber-700 sm:text-xs">新規 {dayEntrants.length}社</span>}
              {company && daySchedules.map((row) => {
                const area = row.work_area;
                const content = row.work_content;
                return <div key={row.id} className="relative mt-1 min-w-0 rounded bg-emerald-100 p-1 pr-6 text-[10px] leading-4 text-emerald-950 sm:text-xs">
                  <button type="button" className="absolute right-0.5 top-0.5 rounded p-0.5 hover:bg-white/70" onClick={(event) => { event.stopPropagation(); setSelectedDate(date); setEditing(row); }} aria-label={`${date}の予定を編集`} title="予定を編集"><Pencil size={12} aria-hidden="true" /></button>
                  <p className="font-bold">{totalWorkers(row)}人</p>
                  <p className="truncate" title={area ?? ""}>{area || "エリア未入力"}</p>
                  <p className="line-clamp-2 break-words" title={content ?? ""}>{content || "作業内容未入力"}</p>
                  {(row.aerial_work_vehicle_count ?? 0) > 0 && <p className="truncate font-semibold text-sky-800">高車：{row.aerial_work_vehicle_count}台</p>}
                </div>;
              })}
              {company && dayEntrants.map((row) => <div key={row.id} className="relative mt-1 min-w-0 rounded bg-amber-100 p-1 pr-6 text-[10px] leading-4 text-amber-900 sm:text-xs"><button type="button" className="absolute right-0.5 top-0.5 rounded p-0.5 hover:bg-white/70" onClick={(event) => { event.stopPropagation(); setSelectedDate(date); setEditingEntrant(row); }} aria-label={`${row.secondary_company || "一次会社所属"}の新規入場を編集`} title="新規入場を編集"><Pencil size={12} aria-hidden="true" /></button><p className="truncate font-semibold" title={row.secondary_company || "一次会社所属"}>新規：{row.secondary_company ? <CopyValue value={row.secondary_company} label="二次会社名" compact stopPropagation /> : "一次会社所属"}</p><p><CopyValue value={row.person_count} label="新規入場人数" compact stopPropagation>{row.person_count}人</CopyValue>・{row.nationality_status === "includes_foreign" ? "外国籍含む" : row.nationality_status === "japanese_only" ? "日本籍" : "未確認"}</p></div>)}
            </div>;
          })}
        </div>
      </section>}

      <section ref={selectedDaySectionRef} className="mt-4 scroll-mt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{Number(selectedDate.slice(5, 7))}月{Number(selectedDate.slice(8, 10))}日の予定</h2>
          <span className="shrink-0 text-sm text-slate-500">{selectedSchedules.length}社</span>
        </div>
        <Link className="btn btn-primary mb-3 w-full sm:w-auto" href={`/schedule?date=${selectedDate}`}>
          この日に作業を追加する
        </Link>
        {loading ? <LoadingIndicator label="予定を読み込み中…" /> : selectedSchedules.length === 0 && selectedEntrants.length === 0 ? <div className="panel p-5 text-slate-500">予定はありません。</div> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {selectedSchedules.map((row) => {
            const subs = row.subcompanies;
            const area = row.work_area;
            const content = row.work_content;
            const tradeRoles = master.primaryTradeRolesByPrimary[row.primary_company] ?? [];
            const totalWorkerCount = totalWorkers(row);
            return <article key={row.id} className="panel relative min-w-0 p-3 pr-11 text-sm">
              <button type="button" className="btn btn-secondary absolute right-2 top-2 h-8 min-h-8 w-8 p-0" onClick={() => setEditing(row)} aria-label={`${row.primary_company}の予定を編集`} title="予定を編集"><Pencil size={15} aria-hidden="true" /></button>
              <div className="flex min-w-0 items-center gap-2 pr-1">
                <p className="min-w-0 truncate font-bold" title={row.primary_company}>
                  <CopyValue value={row.primary_company} label="一次会社" compact stopPropagation />
                </p>
                {tradeRoles.length > 0 && (
                  <span className="shrink-0 truncate text-xs font-normal text-slate-400" title={tradeRoles.join("・")}>
                    <CopyValue value={tradeRoles.join("・")} label="職種" compact stopPropagation />
                  </span>
                )}
              </div>
              <details className="mt-2 rounded-md border border-border bg-slate-50">
                  <summary className="cursor-pointer px-2.5 py-2 font-semibold text-slate-700 marker:text-emerald-700">
                    合計 <CopyValue value={totalWorkerCount} label="合計人数" compact stopPropagation>{totalWorkerCount}人</CopyValue>
                  </summary>
                  <div className="grid gap-1.5 border-t border-border p-2.5">
                    <div className="flex min-w-0 items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words">
                        <CopyValue value={row.primary_company} label="一次会社名" compact stopPropagation />
                        <span className="ml-1 text-xs text-slate-400">一次</span>
                      </span>
                      <span className="shrink-0 font-semibold text-primary">
                        <CopyValue value={row.primary_count ?? 0} label="一次会社人数" compact stopPropagation>{row.primary_count ?? 0}人</CopyValue>
                      </span>
                    </div>
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
              <p className="mt-1 truncate text-slate-700" title={area ?? ""}>{area ? <CopyValue value={area} label="作業エリア" compact stopPropagation /> : "エリア未入力"}</p>
              <p className="truncate text-slate-600" title={content ?? ""}>{content ? <CopyValue value={content} label="作業内容" compact stopPropagation /> : "作業内容未入力"}</p>
              <p className="mt-1 text-sky-800">高車：{(row.aerial_work_vehicle_count ?? 0) > 0 ? <><CopyValue value={row.aerial_work_vehicle_count ?? 0} label="高車台数" compact stopPropagation>{row.aerial_work_vehicle_count}台</CopyValue>{row.aerial_work_vehicle_floor && <>（<CopyValue value={row.aerial_work_vehicle_floor} label="高車の使用フロア" compact stopPropagation />）</>}</> : "使用なし"}</p>
              {row.notes && <p className="mt-1 truncate border-t border-border pt-1 text-xs text-slate-500" title={row.notes}>備考：<CopyValue value={row.notes} label="備考" compact stopPropagation /></p>}
            </article>;
          })}
          {selectedEntrants.map((row) => <article key={row.id} className="relative rounded-md border border-amber-200 bg-amber-50 p-3 pr-11 text-sm"><button type="button" className="btn btn-secondary absolute right-2 top-2 h-8 min-h-8 w-8 p-0" onClick={() => setEditingEntrant(row)} aria-label={`${row.secondary_company || "一次会社所属"}の新規入場を編集`} title="新規入場を編集"><Pencil size={15} aria-hidden="true" /></button><p className="font-bold">新規入場</p><p className="mt-1 break-words"><span className="font-semibold"><CopyValue value={row.primary_company} label="一次会社名" compact stopPropagation /></span>{row.secondary_company ? <><span className="mx-1 text-slate-400">→</span><CopyValue value={row.secondary_company} label="二次会社名" compact stopPropagation /></> : <span className="ml-2 text-slate-500">（一次会社所属）</span>}</p><p><CopyValue value={row.person_count} label="新規入場人数" compact stopPropagation>{row.person_count}人</CopyValue>・{row.nationality_status === "includes_foreign" ? "外国籍を含む" : row.nationality_status === "japanese_only" ? "日本籍のみ" : "国籍未確認"}</p></article>)}
        </div>}
      </section>
    </main>
    {editing && <AdminScheduleEditor schedule={editing} master={master} workerMode onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setVersion((v) => v + 1); }} />}
    {editingEntrant && <NewEntrantEditor record={editingEntrant} master={master} onClose={() => setEditingEntrant(null)} onSaved={() => { setEditingEntrant(null); setVersion((v) => v + 1); }} />}
  </div>;
}
