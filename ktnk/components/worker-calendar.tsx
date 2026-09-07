"use client";

import { Pencil } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AdminScheduleEditor } from "@/components/admin-schedule-editor";
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
  return result;
}

export function WorkerCalendar({ initialDate, initialMaster }: { initialDate: string; initialMaster: CompanyMaster }) {
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [company, setCompany] = useState("");
  const [master] = useState<CompanyMaster>(initialMaster);
  const [schedules, setSchedules] = useState<ScheduleWithSubcompanies[]>([]);
  const [entrants, setEntrants] = useState<NewEntrantRecord[]>([]);
  const [editing, setEditing] = useState<ScheduleWithSubcompanies | null>(null);
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  const selectedDaySectionRef = useRef<HTMLElement>(null);
  const range = monthRange(month);
  useEffect(() => {
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (company) params.set("primaryCompany", company);
    setMessage("");
    fetch(`/api/calendar?${params}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setSchedules(body.schedules ?? []); setEntrants(body.entrants ?? []); setMessage(body.warning ?? "");
    }).catch((error) => setMessage(error instanceof Error ? error.message : "取得できませんでした。"));
  }, [month, company, version]);
  const days = useMemo(() => datesInMonth(month), [month]);
  const scheduleMap = useMemo(() => Object.groupBy(schedules, (row) => row.work_date), [schedules]);
  const entrantMap = useMemo(() => Object.groupBy(entrants, (row) => row.entry_date), [entrants]);
  const selectedSchedules = scheduleMap[selectedDate] ?? [];
  const selectedEntrants = entrantMap[selectedDate] ?? [];
  const firstDayOffset = new Date(`${month}-01T00:00:00`).getDay();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  function selectMonth(nextMonth: string) {
    if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
    setMonth(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    window.requestAnimationFrame(() => {
      selectedDaySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function totalWorkers(row: ScheduleWithSubcompanies) {
    const kind = row.status === "work" ? "current" : "next_visit";
    return (row.status === "work" ? row.primary_count ?? 0 : row.next_primary_count ?? 0) +
      row.subcompanies.filter((sub) => sub.kind === kind).reduce((sum, sub) => sum + (sub.worker_count ?? 0), 0);
  }

  return <div className="min-h-screen pb-10">
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4">
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="w-full sm:w-auto">
          <label className="label" htmlFor="calendar-month">表示月</label>
          <div className="mt-2 grid min-w-0 grid-cols-2 items-stretch gap-2 sm:grid-cols-[auto_11rem_auto]">
            <button type="button" className="btn btn-secondary col-start-1 row-start-2 h-12 w-full px-3 sm:row-start-1 sm:h-14 sm:w-auto sm:px-4" onClick={() => selectMonth(shiftMonth(month, -1))}>前月</button>
            <input id="calendar-month" className="input col-span-2 col-start-1 row-start-1 h-12 max-w-full px-3 sm:col-span-1 sm:col-start-2 sm:h-14 sm:px-3.5" type="month" value={month} onChange={(e) => selectMonth(e.target.value)} />
            <button type="button" className="btn btn-secondary col-start-2 row-start-2 h-12 w-full px-3 sm:col-start-3 sm:row-start-1 sm:h-14 sm:w-auto sm:px-4" onClick={() => selectMonth(shiftMonth(month, 1))}>次月</button>
          </div>
        </div>
        <label className="field w-full sm:ml-auto sm:w-56"><span className="label">一次会社</span><select className="input" value={company} onChange={(e) => setCompany(e.target.value)}><option value="">すべて</option>{master?.primaryCompanies.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      {message && <p role="alert" className="mt-4 text-red-700">{message}</p>}
      <section className="panel mt-4 overflow-x-auto">
        <div className={`grid grid-cols-7 border-b border-border bg-slate-50 text-center text-xs font-semibold text-slate-500 ${company ? "min-w-[56rem]" : ""}`}>
          {weekdays.map((weekday, index) => <div key={weekday} className={`py-2 ${index === 0 ? "text-red-600" : index === 6 ? "text-blue-600" : ""}`}>{weekday}</div>)}
        </div>
        <div className={`grid grid-cols-7 bg-border/70 gap-px ${company ? "min-w-[56rem]" : ""}`}>
          {Array.from({ length: firstDayOffset }, (_, index) => <div key={`blank-${index}`} className="min-h-20 bg-slate-50" />)}
          {days.map((date) => {
            const daySchedules = scheduleMap[date] ?? [];
            const dayEntrants = entrantMap[date] ?? [];
            const total = daySchedules.reduce((sum, row) => sum + totalWorkers(row), 0);
            return <div key={date} onClick={() => selectDate(date)} className={`min-h-20 min-w-0 cursor-pointer bg-white p-1.5 text-left align-top transition hover:bg-emerald-50 sm:min-h-24 sm:p-2 ${selectedDate === date ? "relative z-10 bg-emerald-50 ring-2 ring-inset ring-primary" : ""}`}>
              <button type="button" onClick={(event) => { event.stopPropagation(); selectDate(date); }} aria-pressed={selectedDate === date} className="block w-full text-left text-sm font-bold">{Number(date.slice(-2))}</button>
              {!company && daySchedules.length > 0 && <span className="mt-1 block rounded bg-emerald-100 px-1 py-0.5 text-[11px] font-semibold leading-4 text-emerald-900 sm:text-xs">{daySchedules.length}社・{total}人</span>}
              {!company && dayEntrants.length > 0 && <span className="mt-1 block text-[10px] font-semibold leading-4 text-amber-700 sm:text-xs">新規 {dayEntrants.length}社</span>}
              {company && daySchedules.map((row) => {
                const area = row.status === "work" ? row.work_area : row.next_work_area;
                const content = row.status === "work" ? row.work_content : row.next_work_content;
                return <div key={row.id} className="relative mt-1 min-w-0 rounded bg-emerald-100 p-1 pr-6 text-[10px] leading-4 text-emerald-950 sm:text-xs">
                  <button type="button" className="absolute right-0.5 top-0.5 rounded p-0.5 hover:bg-white/70" onClick={(event) => { event.stopPropagation(); setSelectedDate(date); setEditing(row); }} aria-label={`${date}の予定を編集`} title="予定を編集"><Pencil size={12} aria-hidden="true" /></button>
                  <p className="font-bold">{row.status === "work" ? `${totalWorkers(row)}人` : "作業なし"}</p>
                  {row.status === "no_work" && row.next_visit_date && <p className="truncate" title={`次回 ${row.next_visit_date}`}>次回 {row.next_visit_date.slice(5).replace("-", "/")}</p>}
                  <p className="truncate" title={area ?? ""}>{area || "エリア未入力"}</p>
                  <p className="line-clamp-2 break-words" title={content ?? ""}>{content || "作業内容未入力"}</p>
                </div>;
              })}
              {company && dayEntrants.map((row) => <div key={row.id} className="mt-1 min-w-0 rounded bg-amber-100 p-1 text-[10px] leading-4 text-amber-900 sm:text-xs"><p className="truncate font-semibold" title={row.secondary_company}>新規：{row.secondary_company}</p><p>{row.person_count}人</p></div>)}
            </div>;
          })}
        </div>
      </section>

      <section ref={selectedDaySectionRef} className="mt-4 scroll-mt-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">{Number(selectedDate.slice(5, 7))}月{Number(selectedDate.slice(8, 10))}日の予定</h2>
          <span className="text-sm text-slate-500">{selectedSchedules.length}社</span>
        </div>
        {selectedSchedules.length === 0 && selectedEntrants.length === 0 ? <div className="panel p-5 text-slate-500">予定はありません。</div> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {selectedSchedules.map((row) => {
            const subs = row.subcompanies.filter((sub) => sub.kind === (row.status === "work" ? "current" : "next_visit"));
            const area = row.status === "work" ? row.work_area : `次回 ${row.next_visit_date ?? "未定"}`;
            const content = row.status === "work" ? row.work_content : row.next_work_content;
            return <article key={row.id} className="panel relative min-w-0 p-3 pr-11 text-sm">
              <button type="button" className="btn btn-secondary absolute right-2 top-2 h-8 min-h-8 w-8 p-0" onClick={() => setEditing(row)} aria-label={`${row.primary_company}の予定を編集`} title="予定を編集"><Pencil size={15} aria-hidden="true" /></button>
              <div className="flex min-w-0 items-center gap-2 pr-1">
                <p className="min-w-0 truncate font-bold" title={row.primary_company}>
                  <CopyValue value={row.primary_company} label="一次会社" />
                </p>
                {(master?.primaryTradeRolesByPrimary[row.primary_company] ?? []).length > 0 && (
                  <span className="shrink-0 truncate text-xs font-normal text-slate-400" title={(master?.primaryTradeRolesByPrimary[row.primary_company] ?? []).join("・")}>
                    {(master?.primaryTradeRolesByPrimary[row.primary_company] ?? []).join("・")}
                  </span>
                )}
              </div>
              <p className="mt-0.5 font-semibold text-primary">
                {row.status === "work" ? <CopyValue value={totalWorkers(row)} label="合計人数">{totalWorkers(row)}人</CopyValue> : "作業なし"}
                <span className="ml-2 font-normal text-slate-500">二次 {subs.length}社</span>
              </p>
              <p className="mt-1 truncate text-slate-700" title={area ?? ""}>{area ? <CopyValue value={area} label={row.status === "work" ? "作業エリア" : "次回来場"} /> : "エリア未入力"}</p>
              <p className="truncate text-slate-600" title={content ?? ""}>{content ? <CopyValue value={content} label="作業内容" /> : "作業内容未入力"}</p>
              {row.notes && <p className="mt-1 truncate border-t border-border pt-1 text-xs text-slate-500" title={row.notes}>備考：<CopyValue value={row.notes} label="備考" /></p>}
            </article>;
          })}
          {selectedEntrants.map((row) => <article key={row.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-bold">新規入場</p><p className="mt-1 break-words"><span className="font-semibold">{row.primary_company}</span><span className="mx-1 text-slate-400">→</span>{row.secondary_company}</p><p>{row.person_count}人</p></article>)}
        </div>}
      </section>
    </main>
    {editing && <AdminScheduleEditor schedule={editing} master={master} workerMode onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setVersion((v) => v + 1); }} />}
  </div>;
}

function CopyValue({ value, label, children }: { value: string | number; label: string; children?: ReactNode }) {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return <>
    <button
      type="button"
      className="max-w-full rounded px-0.5 text-left underline-offset-4 hover:bg-emerald-50 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
      title={`${label}をコピー`}
      aria-label={`${label}をコピー：${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(value));
          setNotice(`${label}をコピーしました`);
        } catch {
          setNotice("コピーできませんでした。もう一度お試しください。");
        }
      }}
    >
      {children ?? value}
    </button>
    {notice && <span role="status" className="fixed bottom-5 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 rounded-md bg-slate-800 px-4 py-3 text-sm font-medium text-white shadow-lg">{notice}</span>}
  </>;
}
