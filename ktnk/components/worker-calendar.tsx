"use client";

import { monthRange, shiftMonth, datesInMonth } from "@/lib/calendar-dates";
import type { CalendarSummaryData } from "@/lib/calendar-summary";
import { CalendarClientCache } from "@/lib/calendar-client-cache";
import type { WorkCompletion } from "@/lib/work-completions";
import { LoadingIndicator, LoadingOverlay } from "@/components/loading-indicator";
import { CalendarDay } from "@/components/calendar-day";
import { isWorkingDate } from "@/lib/utils";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RefreshCw } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { CalendarSchedule, CalendarEntrant, CompanyMaster, NewEntrantRecord, ScheduleWithSubcompanies } from "@/lib/types";

const loadCalendarDetails = () => import("@/components/calendar-details");
const CalendarDetails = dynamic(() => import("@/components/calendar-details").then((module) => module.CalendarDetails), { loading: () => <LoadingIndicator /> });
const AdminScheduleEditor = dynamic(() => import("@/components/admin-schedule-editor").then((module) => module.AdminScheduleEditor));
const NewEntrantEditor = dynamic(() => import("@/components/new-entrant-editor").then((module) => module.NewEntrantEditor));
const DETAILS_PREFERENCE_KEY = "calendar-supplement-expanded";

export function WorkerCalendar({ initialDate, initialMaster, initialSummary }: { initialDate: string; initialMaster: CompanyMaster; initialSummary?: CalendarSummaryData | null }) {
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(isWorkingDate(initialDate) ? initialDate : datesInMonth(initialDate.slice(0, 7)).find((date) => date > initialDate) ?? datesInMonth(initialDate.slice(0, 7))[0]);
  const [company, setCompany] = useState("");
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [master, setMaster] = useState<CompanyMaster>(initialMaster);
  const [schedules, setSchedules] = useState<CalendarSchedule[]>(initialSummary?.schedules ?? []);
  const [entrants, setEntrants] = useState<CalendarEntrant[]>(initialSummary?.entrants ?? []);
  const [completions, setCompletions] = useState<WorkCompletion[]>(initialSummary?.completions ?? []);
  const [detail, setDetail] = useState<{ date: string; schedules: ScheduleWithSubcompanies[]; entrants: NewEntrantRecord[]; completions: WorkCompletion[] }>({ date: "", schedules: [], entrants: [], completions: [] });
  const [detailLoadedKey, setDetailLoadedKey] = useState("");
  const [detailMessage, setDetailMessage] = useState("");
  const summaryCache = useRef(new CalendarClientCache<{ schedules: CalendarSchedule[]; entrants: CalendarEntrant[]; completions: WorkCompletion[]; warning?: string }>());
  const detailCache = useRef(new CalendarClientCache<{ schedules: ScheduleWithSubcompanies[]; entrants: NewEntrantRecord[]; completions: WorkCompletion[]; warning?: string }>());
  const cacheVersion = useRef(0);

  useEffect(() => {
    setDetailsExpanded(window.localStorage.getItem(DETAILS_PREFERENCE_KEY) !== "false");
  }, []);

  const toggleDetails = useCallback(() => {
    setDetailsExpanded((current) => {
      const next = !current;
      window.localStorage.setItem(DETAILS_PREFERENCE_KEY, String(next));
      return next;
    });
  }, []);
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [completionBusy, setCompletionBusy] = useState(false);
  const completionPending = useRef(false);
  const [editing, setEditing] = useState<ScheduleWithSubcompanies | null>(null);
  const [editingEntrant, setEditingEntrant] = useState<NewEntrantRecord | null>(null);
  const [message, setMessage] = useState(initialSummary?.warning ?? "");
  const [version, setVersion] = useState(0);
  const [masterRefreshVersion, setMasterRefreshVersion] = useState(0);
  const masterVersion = useRef(0);
  const selectedDaySectionRef = useRef<HTMLElement>(null);
  const range = monthRange(month);
  const requestKey = JSON.stringify([month, company, version]);
  const [loadedKey, setLoadedKey] = useState(initialSummary ? JSON.stringify([initialDate.slice(0, 7), "", 0]) : "");
  const initialSummaryPending = useRef(Boolean(initialSummary));
  const loading = loadedKey !== requestKey;
  useEffect(() => {
    const controller = new AbortController();
    if (initialSummaryPending.current) {
      initialSummaryPending.current = false;
      if (initialSummary && !initialSummary.warning) summaryCache.current.set(JSON.stringify([initialDate.slice(0, 7), "", 0]), initialSummary);
    }
    if (cacheVersion.current !== version) {
      summaryCache.current.clear();
      detailCache.current.clear();
      cacheVersion.current = version;
    }
    const cached = summaryCache.current.get(requestKey);
    if (cached) {
      setSchedules(cached.schedules); setEntrants(cached.entrants); setCompletions(cached.completions);
      setMessage(cached.warning ?? ""); setLoadedKey(requestKey);
      return;
    }
    const params = new URLSearchParams({ from: range.from, to: range.to, view: "summary" });
    if (company) params.set("primaryCompany", company);
    setMessage("");
    Promise.all([
      apiFetch(`/api/calendar?${params}`, { cache: "no-store", signal: controller.signal }),
      masterRefreshVersion !== masterVersion.current
        ? apiFetch("/api/companies", { cache: "no-store", signal: controller.signal })
        : Promise.resolve(null),
    ]).then(async ([response, masterResponse]) => {
      const [body, nextMaster] = await Promise.all([response.json(), masterResponse?.json()]);
      if (!response.ok) throw new Error(body.error);
      if (masterResponse && !masterResponse.ok) throw new Error(nextMaster.error);
      if (controller.signal.aborted) return;
      if (nextMaster) {
        setMaster(nextMaster);
        masterVersion.current = masterRefreshVersion;
      }
      if (!body.warning) summaryCache.current.set(requestKey, body);
      setCompletions(body.completions ?? []); setSchedules(body.schedules ?? []); setEntrants(body.entrants ?? []); setMessage(body.warning ?? "");
    }).catch((error) => {
      if (!controller.signal.aborted) { setCompletions([]); setSchedules([]); setEntrants([]); setMessage(error instanceof Error ? error.message : "取得できませんでした。"); }
    }).finally(() => { if (!controller.signal.aborted) setLoadedKey(requestKey); });
    return () => controller.abort();
  }, [month, company, version, range.from, range.to, requestKey, initialDate, initialSummary, masterRefreshVersion]);
  const hasSelectedRecords = schedules.some(row => row.work_date === selectedDate)
    || entrants.some(row => row.entry_date === selectedDate)
    || completions.some(row => row.work_date === selectedDate);
  useEffect(() => {
    if (hasSelectedRecords) void loadCalendarDetails().catch(() => {});
  }, [hasSelectedRecords]);
  const detailKey = JSON.stringify([selectedDate, company, version]);
  const detailLoading = detailLoadedKey !== detailKey;
  useEffect(() => {
    const controller = new AbortController();
    const cached = detailCache.current.get(detailKey);
    if (cached) {
      setDetail({ date: selectedDate, ...cached });
      setDetailMessage(cached.warning ?? ""); setDetailLoadedKey(detailKey);
      return;
    }
    const params = new URLSearchParams({ from: selectedDate, to: selectedDate });
    if (company) params.set("primaryCompany", company);
    setDetailMessage("");
    apiFetch(`/api/calendar?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (controller.signal.aborted) return;
        if (!body.warning) detailCache.current.set(detailKey, body);
        setDetail({ date: selectedDate, schedules: body.schedules ?? [], entrants: body.entrants ?? [], completions: body.completions ?? [] });
        setDetailMessage(body.warning ?? "");
      }).catch((error) => {
        if (!controller.signal.aborted) {
          setDetail({ date: selectedDate, schedules: [], entrants: [], completions: [] });
          setDetailMessage(error instanceof Error ? error.message : "予定を取得できませんでした。");
        }
      }).finally(() => { if (!controller.signal.aborted) setDetailLoadedKey(detailKey); });
    return () => controller.abort();
  }, [selectedDate, company, version, detailKey]);
  useEffect(() => {
    if (!pendingEditId || detailLoading) return;
    const row = detail.schedules.find((item) => item.id === pendingEditId);
    if (row) setEditing(row);
    else setDetailMessage((current) => current || "予定が変更または削除されました。最新の内容を確認してください。");
    setPendingEditId(null);
  }, [pendingEditId, detailLoading, detail]);
  const editSummary = useCallback((row: CalendarSchedule) => {
    if (completionPending.current) return;
    setSelectedDate(row.work_date);
    setPendingEditId(row.id);
  }, []);
  const days = useMemo(() => datesInMonth(month), [month]);
  const hasLoaded = loadedKey !== "";
  const scheduleMap = useMemo(() => Object.groupBy(schedules.filter((row) => !company || row.primary_company === company), (row) => row.work_date), [schedules, company]);
  const saveCompletion = useCallback(async function saveCompletion(date: string, primaryCompany: string, report?: WorkCompletion, notes?: string) {
    if (completionPending.current) return;
    completionPending.current = true;
    setCompletionBusy(true);
    setMessage("");
    try {
      const response = await apiFetch("/api/work-completions", {
        method: report && notes === undefined ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, primaryCompany, notes: notes ?? "", expectedReportedAt: report?.reported_at }),
      });
      const body = await response.json();
      if (response.ok || response.status === 409) {
        const update = (current: WorkCompletion[]) => [
          ...current.filter((item) => item.work_date !== date || item.primary_company !== primaryCompany),
          ...(body.report ? [body.report as WorkCompletion] : []),
        ];
        setCompletions(update);
        setDetail((current) => ({ ...current, completions: date === current.date ? update(current.completions) : current.completions }));
        summaryCache.current.clear();
        detailCache.current.clear();
      }
      if (!response.ok) throw new Error(body.error || "作業終了報告を保存できませんでした。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作業終了報告を保存できませんでした。");
    } finally {
      completionPending.current = false;
      setCompletionBusy(false);
    }
  }, []);
  const entrantMap = useMemo(() => Object.groupBy(entrants.filter((row) => !company || row.primary_company === company), (row) => row.entry_date), [entrants, company]);
  const firstDayOffset = (new Date(`${month}-01T00:00:00`).getDay() + 6) % 7 % 6;
  const weekdays = ["月", "火", "水", "木", "金", "土"];

  function selectMonth(nextMonth: string) {
    if (completionPending.current || !/^\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth)) return;
    setMonth(nextMonth);
    setSelectedDate(datesInMonth(nextMonth)[0]);
  }

  const selectDate = useCallback((date: string) => {
    if (completionPending.current) return;
    setSelectedDate(date);
    window.requestAnimationFrame(() => {
      selectedDaySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return <div className="min-h-screen pb-10">
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4">
      <h1 className="page-title">カレンダー</h1>
      <div className="panel flex min-w-0 flex-wrap items-center gap-2 p-2 sm:p-3">
        <div className="min-w-0 w-full sm:w-auto">
          <label className="sr-only" htmlFor="calendar-month">表示月</label>
          <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-stretch gap-1.5 sm:grid-cols-[auto_10rem_auto]">
            <button type="button" className="btn btn-secondary h-10 min-h-0 w-10 px-0 py-1 sm:w-auto sm:px-3" disabled={completionBusy} onClick={() => selectMonth(shiftMonth(month, -1))} aria-label="前月を表示">
              <ChevronLeft size={18} aria-hidden="true" />
              <span className="hidden sm:inline">前月</span>
            </button>
            <div className="relative h-10 min-w-0 overflow-hidden rounded-md border border-input bg-white">
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-2 text-sm font-semibold text-slate-800 sm:text-base">{Number(month.slice(0, 4))}年{Number(month.slice(5))}月</span>
              <input id="calendar-month" aria-label="表示する月" className="calendar-month" type="month" disabled={completionBusy} value={month} onChange={(e) => selectMonth(e.target.value)} />
            </div>
            <button type="button" className="btn btn-secondary h-10 min-h-0 w-10 px-0 py-1 sm:w-auto sm:px-3" disabled={completionBusy} onClick={() => selectMonth(shiftMonth(month, 1))} aria-label="次月を表示">
              <span className="hidden sm:inline">次月</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <label className="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-64"><span className="shrink-0 text-sm font-semibold text-slate-700">一次会社</span><select className="input h-10 min-h-0 px-3 text-base" disabled={completionBusy} value={company} onChange={(e) => setCompany(e.target.value)}><option value="">すべて</option>{master?.primaryCompanies.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      {message && <p role="alert" className="mt-4 notice-error">{message}</p>}
      {!hasLoaded && loading ? <div className="panel mt-4 min-h-80"><LoadingIndicator label="カレンダーを読み込み中…" className="min-h-80" /></div> : <section className="panel relative mt-4 overflow-x-auto" aria-busy={loading}>
        {loading && <LoadingOverlay label="カレンダーを更新中…" />}
        <div className={`grid grid-cols-6 border-b border-border bg-slate-50 text-center text-xs font-semibold text-slate-500 ${company ? "min-w-[56rem]" : ""}`}>
          {weekdays.map((weekday, index) => <div key={weekday} className={`py-2 ${index === 5 ? "bg-sky-50/70 text-sky-700" : ""}`}>{weekday}</div>)}
        </div>
        <div className={`grid grid-cols-6 bg-border/70 gap-px ${company ? "min-w-[56rem]" : ""}`}>
          {Array.from({ length: firstDayOffset }, (_, index) => <div key={`blank-${index}`} className="min-h-20 bg-slate-50" />)}
          {days.map((date) => <CalendarDay key={date} date={date} selected={selectedDate === date} company={company}
            schedules={scheduleMap[date]} entrants={entrantMap[date]}
            loading={loading} completionBusy={completionBusy} onSelect={selectDate} onEdit={editSummary} />)}

        </div>
      </section>}

      <section ref={selectedDaySectionRef} className="mt-4 scroll-mt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="whitespace-nowrap text-lg font-bold">{Number(selectedDate.slice(5, 7))}月{Number(selectedDate.slice(8, 10))}日の予定</h2>
            <button type="button" className="btn btn-secondary h-9 min-h-0 w-9 p-0" disabled={loading || detailLoading || completionBusy} onClick={() => { setMasterRefreshVersion((value) => value + 1); setVersion((value) => value + 1); }} aria-label={loading ? "予定を更新中" : "予定を更新"} title="予定を更新">
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-secondary h-9 min-h-0 gap-1 px-2" onClick={toggleDetails} aria-pressed={detailsExpanded} aria-label={detailsExpanded ? "設備・注意事項を隠す" : "設備・注意事項を表示"} title={detailsExpanded ? "設備・注意事項を隠す" : "設備・注意事項を表示"}>
              {detailsExpanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
              <span className="hidden text-xs sm:inline">{detailsExpanded ? "補足を隠す" : "補足を表示"}</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[{ label: "作業入力", pathname: "/schedule" }, { label: "新規入場", pathname: "/new-entrants" }].map((item) => (
              <Link
                prefetch={false}
                key={item.pathname}
                className="btn btn-primary h-9 min-h-0 px-2.5 py-1 text-sm"
                href={{ pathname: item.pathname, query: { date: selectedDate, ...(company ? { primaryCompany: company } : {}) } }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        {detailMessage && <p role="alert" className="mb-3 notice-error">{detailMessage}</p>}
        {detailLoading ? <LoadingIndicator label="予定を読み込み中…" className="min-h-32" /> : detail.schedules.length === 0 && detail.entrants.length === 0 && detail.completions.length === 0 ? !detailMessage && <div className="panel p-5 text-slate-500">予定はありません。</div> : <div className={`grid gap-2 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${loading ? "pointer-events-none opacity-60" : ""}`} aria-busy={loading}>
          <CalendarDetails detail={detail} master={master} selectedDate={selectedDate} isToday={selectedDate === initialDate} completionBusy={completionBusy} detailsExpanded={detailsExpanded}
            onEdit={setEditing} onEditEntrant={setEditingEntrant} onCompletion={saveCompletion} />
        </div>}
      </section>
    </main>
    {editing && <AdminScheduleEditor schedule={editing} master={master} workerMode onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setVersion((v) => v + 1); }} />}
    {editingEntrant && <NewEntrantEditor record={editingEntrant} master={master} onClose={() => setEditingEntrant(null)} onSaved={() => { setEditingEntrant(null); setMasterRefreshVersion((v) => v + 1); setVersion((v) => v + 1); }} />}
  </div>;
}
