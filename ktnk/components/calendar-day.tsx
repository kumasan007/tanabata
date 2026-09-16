"use client";
import { memo } from "react";
import { Pencil } from "lucide-react";
import type { CalendarSchedule, CalendarEntrant } from "@/lib/types";
import type { WorkCompletion } from "@/lib/work-completions";
const EMPTY: never[] = [];
export const CalendarDay = memo(function CalendarDay({ date, selected, isToday, company, schedules, entrants, completions, loading, completionBusy, onSelect, onEdit, onCompletion }: {
  date: string; selected: boolean; isToday: boolean; company: string;
  schedules?: CalendarSchedule[]; entrants?: CalendarEntrant[]; completions?: WorkCompletion[];
  loading: boolean; completionBusy: boolean;
  onSelect: (date: string) => void; onEdit: (row: CalendarSchedule) => void;
  onCompletion: (date: string, company: string, report?: WorkCompletion) => Promise<void>;
}) {
  const daySchedules = schedules ?? EMPTY;
  const dayEntrants = entrants ?? EMPTY;
  const dayCompletions = completions ?? EMPTY;
  function totalWorkers(row: CalendarSchedule) { return row.total_workers; }
  function entrantSummary(rows: CalendarEntrant[]) {
    return { people: rows.reduce((sum, row) => sum + row.person_count, 0), companies: new Set(rows.map((row) => row.secondary_company || row.primary_company)).size };
  }
  function completionControls(primaryCompany: string) {
    const report = dayCompletions.find((row) => row.primary_company === primaryCompany);
    if (!report && !isToday) return null;
    return <div className="mt-1">{report ? <div className="rounded bg-emerald-100 p-2 text-emerald-900"><div className="flex items-start justify-between gap-2"><p className="font-bold">✓ 作業終了済み</p>{isToday && <button type="button" className="shrink-0 rounded border border-emerald-600 bg-white px-1.5 py-0.5 text-xs font-semibold disabled:opacity-50" disabled={completionBusy || loading} onClick={(event) => { event.stopPropagation(); void onCompletion(date, primaryCompany, report); }}>取り消し</button>}</div></div> : <button type="button" className="rounded border border-emerald-600 bg-white px-1 py-0.5 font-semibold disabled:opacity-50" disabled={completionBusy || loading} onClick={(event) => { event.stopPropagation(); void onCompletion(date, primaryCompany); }}>作業終了</button>}</div>;
  }
            const entrantStats = entrantSummary(dayEntrants);
            const total = daySchedules.reduce((sum, row) => sum + totalWorkers(row), 0);
            const totalAerialVehicles = daySchedules.reduce(
              (sum, row) => sum + (row.aerial_work_vehicle_count ?? 0),
              0,
            );
            const fireCompanyCount = daySchedules.filter((row) => row.uses_fire).length;
            const tachiumaCompanyCount = daySchedules.filter((row) => row.uses_tachiuma).length;
            const isSaturday = new Date(`${date}T00:00:00`).getDay() === 6;
            return <div key={date} onClick={() => onSelect(date)} className={`min-h-20 min-w-0 cursor-pointer p-1.5 text-left align-top transition hover:bg-emerald-50 sm:min-h-24 sm:p-2 ${selected ? "relative z-10 bg-emerald-50 ring-2 ring-inset ring-primary" : isSaturday ? "bg-sky-50/70" : "bg-white"}`}>
              <button type="button" onClick={(event) => { event.stopPropagation(); onSelect(date); }} aria-pressed={selected} className="block w-full text-left text-sm font-bold">{Number(date.slice(-2))}</button>
              {!company && daySchedules.length > 0 && <span className="mt-1 flex flex-col text-sm font-semibold leading-5 text-emerald-900"><span>{daySchedules.length}社</span><span>{total}人</span>{totalAerialVehicles > 0 && <span className="text-sky-800"><span className="hidden sm:inline">高車：</span>{totalAerialVehicles}台</span>}{fireCompanyCount > 0 && <span className="text-red-700">火気：{fireCompanyCount}社</span>}{tachiumaCompanyCount > 0 && <span className="text-emerald-700">立ち馬：{tachiumaCompanyCount}社</span>}</span>}
              {dayCompletions.length > 0 && <span className="mt-1 block rounded bg-emerald-700 px-1 py-0.5 text-xs font-bold text-white">{company ? "✓ 終了済み" : `終了 ${dayCompletions.length}社`}</span>}
              {!company && dayEntrants.length > 0 && <span className="block text-xs font-semibold leading-5 text-amber-700 sm:text-sm">新規 {entrantStats.companies}社・{entrantStats.people}人</span>}
              {company && daySchedules.map((row) => {
                const area = row.work_area;
                const content = row.work_content;
                return <div key={row.id} className="mt-1 min-w-0 rounded bg-emerald-100 p-1 text-[10px] leading-4 text-emerald-950 sm:text-xs">
                  <div className="mb-1 flex items-center justify-end gap-0.5">
                    {(row.aerial_work_vehicle_count ?? 0) > 0 && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 font-bold leading-none text-white shadow-sm" title="高所作業車あり">高</span>}
                    {row.uses_fire && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-600 font-bold leading-none text-white shadow-sm" title="火気使用あり">火</span>}
                    {row.uses_tachiuma && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 font-bold leading-none text-white shadow-sm" title="立ち馬使用あり">立</span>}
                    <button type="button" className="rounded p-0.5 hover:bg-white/70" disabled={loading || completionBusy} onClick={(event) => { event.stopPropagation(); onEdit(row); }} aria-label={`${date}の予定を編集`} title="予定を編集"><Pencil size={12} aria-hidden="true" /></button>
                  </div>
                  {completionControls(row.primary_company)}<p className="font-bold">{totalWorkers(row)}人</p>
                  <p className="truncate" title={area ?? ""}>{area || "エリア未入力"}</p>
                  <p className="line-clamp-2 break-words" title={content ?? ""}>{content || "作業内容未入力"}</p>
                  {(row.aerial_work_vehicle_count ?? 0) > 0 && <p className="truncate font-semibold text-sky-800">高車：{row.aerial_work_vehicle_count}台</p>}
                  {row.uses_fire && <p className="truncate font-semibold text-red-700">火気：使用</p>}
                  {row.uses_tachiuma && <p className="truncate font-semibold text-emerald-700">立ち馬：使用</p>}
                  {row.uses_tachiuma && row.tachiuma_notes && <p className="truncate text-emerald-700" title={row.tachiuma_notes}>{row.tachiuma_notes}</p>}
                </div>;
              })}
              {company && dayEntrants.length > 0 && <div className="mt-1 min-w-0 rounded bg-amber-100 p-1 text-[10px] leading-4 text-amber-900 sm:text-xs"><p className="truncate font-semibold">新規入場</p><p>{entrantStats.companies}社・{entrantStats.people}人</p></div>}
            </div>;

});
