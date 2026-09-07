"use client";

import Link from "next/link";
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

export function WorkerCalendar({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
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

  return <div className="min-h-screen pb-10">
    <header className="border-b border-border bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4"><Link href="/" className="text-xl font-bold">作業カレンダー</Link><div className="flex gap-2"><Link href="/schedule" className="btn btn-secondary">作業入力</Link><Link href="/new-entrants" className="btn btn-secondary">新規入場</Link></div></div></header>
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4">
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <button className="btn btn-secondary" onClick={() => setMonth(shiftMonth(month, -1))}>前月</button>
        <label className="field"><span className="label">表示月</span><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <button className="btn btn-secondary" onClick={() => setMonth(shiftMonth(month, 1))}>次月</button>
        <label className="field min-w-56 sm:ml-auto"><span className="label">一次会社</span><select className="input" value={company} onChange={(e) => setCompany(e.target.value)}><option value="">すべて</option>{master?.primaryCompanies.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      {message && <p role="alert" className="mt-4 text-red-700">{message}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {days.map((date) => { const daySchedules = scheduleMap[date] ?? []; const dayEntrants = entrantMap[date] ?? []; const weekday = new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(new Date(`${date}T00:00:00`)); return <section key={date} className="panel min-h-28 p-3">
          <h2 className="border-b border-border pb-2 font-bold">{Number(date.slice(-2))}日（{weekday}）</h2>
          {daySchedules.map((row) => { const subs = row.subcompanies.filter((sub) => sub.kind === (row.status === "work" ? "current" : "next_visit")); const total = (row.status === "work" ? row.primary_count ?? 0 : row.next_primary_count ?? 0) + subs.reduce((sum, sub) => sum + (sub.worker_count ?? 0), 0); return <article key={row.id} className="mt-2 rounded bg-emerald-50 p-2 text-sm">
            <p className="font-bold">{row.primary_company} <span className="font-normal">{row.status === "work" ? `${total}人` : "作業なし"}</span></p>
            <p>{row.status === "work" ? row.work_area : `次回 ${row.next_visit_date ?? "未定"}`}</p><p className="whitespace-pre-wrap">{row.status === "work" ? row.work_content : row.next_work_content}</p>
            {subs.length > 0 && <p className="text-slate-600">{subs.map((sub) => `${sub.secondary_company} ${sub.worker_count ?? 0}人`).join("、")}</p>}
            {row.notes && <p className="mt-1 border-t border-emerald-200 pt-1 text-slate-600">備考：{row.notes}</p>}
            <button className="mt-2 font-semibold text-primary underline" onClick={() => setEditing(row)}>この予定を修正</button>
          </article>; })}
          {dayEntrants.map((row) => <article key={row.id} className="mt-2 rounded bg-amber-50 p-2 text-sm"><p className="font-bold">新規入場：{row.secondary_company}</p><p>{row.person_count}人{row.is_new_company ? "・会社も新規" : ""}</p>{row.person_names && <p className="whitespace-pre-wrap">{row.person_names}</p>}</article>)}
          {daySchedules.length === 0 && dayEntrants.length === 0 && <p className="mt-2 text-sm text-slate-400">予定なし</p>}
        </section>; })}
      </div>
    </main>
    {editing && <AdminScheduleEditor schedule={editing} master={master} workerMode onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setVersion((v) => v + 1); }} />}
  </div>;
}
