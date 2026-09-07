"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

export function WorkerCalendar({ initialDate }: { initialDate: string }) {
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [company, setCompany] = useState("");
  const [master, setMaster] = useState<CompanyMaster | null>(null);
  const [schedules, setSchedules] = useState<ScheduleWithSubcompanies[]>([]);
  const [entrants, setEntrants] = useState<NewEntrantRecord[]>([]);
  const [editing, setEditing] = useState<ScheduleWithSubcompanies | null>(null);
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  const range = monthRange(month);
  useEffect(() => { fetch("/api/companies").then((r) => r.json()).then(setMaster).catch(() => setMessage("会社一覧を取得できませんでした。")); }, []);
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

  function totalWorkers(row: ScheduleWithSubcompanies) {
    const kind = row.status === "work" ? "current" : "next_visit";
    return (row.status === "work" ? row.primary_count ?? 0 : row.next_primary_count ?? 0) +
      row.subcompanies.filter((sub) => sub.kind === kind).reduce((sum, sub) => sum + (sub.worker_count ?? 0), 0);
  }

  return <div className="min-h-screen pb-10">
    <header className="border-b border-border bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4"><Link href="/" className="text-xl font-bold">作業カレンダー</Link><div className="flex gap-2"><Link href="/schedule" className="btn btn-secondary">作業入力</Link><Link href="/new-entrants" className="btn btn-secondary">新規入場</Link></div></div></header>
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4">
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <button type="button" className="btn btn-secondary" onClick={() => selectMonth(shiftMonth(month, -1))}>前月</button>
        <label className="field"><span className="label">表示月</span><input className="input" type="month" value={month} onChange={(e) => selectMonth(e.target.value)} /></label>
        <button type="button" className="btn btn-secondary" onClick={() => selectMonth(shiftMonth(month, 1))}>次月</button>
        <label className="field min-w-56 sm:ml-auto"><span className="label">一次会社</span><select className="input" value={company} onChange={(e) => setCompany(e.target.value)}><option value="">すべて</option>{master?.primaryCompanies.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      {message && <p role="alert" className="mt-4 text-red-700">{message}</p>}
      <section className="panel mt-4 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-slate-50 text-center text-xs font-semibold text-slate-500">
          {weekdays.map((weekday, index) => <div key={weekday} className={`py-2 ${index === 0 ? "text-red-600" : index === 6 ? "text-blue-600" : ""}`}>{weekday}</div>)}
        </div>
        <div className="grid grid-cols-7 bg-border/70 gap-px">
          {Array.from({ length: firstDayOffset }, (_, index) => <div key={`blank-${index}`} className="min-h-20 bg-slate-50" />)}
          {days.map((date) => {
            const daySchedules = scheduleMap[date] ?? [];
            const dayEntrants = entrantMap[date] ?? [];
            const total = daySchedules.reduce((sum, row) => sum + totalWorkers(row), 0);
            return <button key={date} type="button" onClick={() => setSelectedDate(date)} aria-pressed={selectedDate === date} className={`min-h-20 bg-white p-1.5 text-left align-top transition hover:bg-emerald-50 sm:min-h-24 sm:p-2 ${selectedDate === date ? "relative z-10 bg-emerald-50 ring-2 ring-inset ring-primary" : ""}`}>
              <span className="block text-sm font-bold">{Number(date.slice(-2))}</span>
              {daySchedules.length > 0 && <span className="mt-1 block rounded bg-emerald-100 px-1 py-0.5 text-[11px] font-semibold leading-4 text-emerald-900 sm:text-xs">{daySchedules.length}社・{total}人</span>}
              {dayEntrants.length > 0 && <span className="mt-1 block text-[10px] font-semibold leading-4 text-amber-700 sm:text-xs">新規 {dayEntrants.length}社</span>}
            </button>;
          })}
        </div>
      </section>

      <section className="mt-4">
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
              <p className="truncate pr-1 font-bold" title={row.primary_company}>{row.primary_company}</p>
              <p className="mt-0.5 font-semibold text-primary">{row.status === "work" ? `${totalWorkers(row)}人` : "作業なし"}<span className="ml-2 font-normal text-slate-500">二次 {subs.length}社</span></p>
              <p className="mt-1 truncate text-slate-700" title={area ?? ""}>{area || "エリア未入力"}</p>
              <p className="truncate text-slate-600" title={content ?? ""}>{content || "作業内容未入力"}</p>
              {row.notes && <p className="mt-1 truncate border-t border-border pt-1 text-xs text-slate-500" title={row.notes}>備考：{row.notes}</p>}
            </article>;
          })}
          {selectedEntrants.map((row) => <article key={row.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"><p className="truncate font-bold">新規入場：{row.secondary_company}</p><p>{row.person_count}人{row.is_new_company ? "・会社も新規" : ""}</p></article>)}
        </div>}
      </section>
    </main>
    {editing && <AdminScheduleEditor schedule={editing} master={master} workerMode onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setVersion((v) => v + 1); }} />}
  </div>;
}
