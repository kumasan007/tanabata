"use client";
import { memo } from "react";
import { Pencil } from "lucide-react";
import type { CalendarSchedule, CalendarEntrant } from "@/lib/types";
const EMPTY: never[] = [];
export const CalendarDay = memo(function CalendarDay({ date, selected, company, schedules, entrants, loading, completionBusy, onSelect, onEdit }: {
  date: string; selected: boolean; company: string;
  schedules?: CalendarSchedule[]; entrants?: CalendarEntrant[];
  loading: boolean; completionBusy: boolean;
  onSelect: (date: string) => void; onEdit: (row: CalendarSchedule) => void;
}) {
  const daySchedules = schedules ?? EMPTY;
  const dayEntrants = entrants ?? EMPTY;
  function totalWorkers(row: CalendarSchedule) { return row.total_workers; }
  function entrantSummary(rows: CalendarEntrant[]) {
    return { people: rows.reduce((sum, row) => sum + row.person_count, 0), companies: new Set(rows.map((row) => row.secondary_company || row.primary_company)).size };
  }
            const entrantStats = entrantSummary(dayEntrants);
            const total = daySchedules.reduce((sum, row) => sum + totalWorkers(row), 0);
            const aerialCompanyCount = daySchedules.filter((row) => (row.aerial_work_vehicle_count ?? 0) > 0).length;
            const fireCompanyCount = daySchedules.filter((row) => row.uses_fire).length;
            const tachiumaCompanyCount = daySchedules.filter((row) => row.uses_tachiuma).length;
            const isSaturday = new Date(`${date}T00:00:00`).getDay() === 6;
            return <div key={date} onClick={() => onSelect(date)} className={`min-h-20 min-w-0 cursor-pointer p-1.5 text-left align-top transition hover:bg-emerald-50 sm:min-h-24 sm:p-2 ${selected ? "relative z-10 bg-emerald-50 ring-2 ring-inset ring-primary" : isSaturday ? "bg-sky-50/70" : "bg-white"}`}>
              <button type="button" onClick={(event) => { event.stopPropagation(); onSelect(date); }} aria-pressed={selected} className="block w-full text-left text-sm font-bold">{Number(date.slice(-2))}</button>
              {!company && daySchedules.length > 0 && <>
                <span className="mt-1 flex flex-col text-sm font-semibold leading-5 text-emerald-900"><span>{daySchedules.length}社</span><span>{total}人</span></span>
              </>}
              {!company && (daySchedules.length > 0 || dayEntrants.length > 0) && <span className="mt-1 hidden flex-wrap gap-x-2 gap-y-1 text-sm font-semibold sm:flex">
                {aerialCompanyCount > 0 && <span className="inline-flex items-center text-sky-800" title={`高所作業車使用 ${aerialCompanyCount}社`}><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-600 text-[10px] font-bold leading-none text-white">高</span></span>}
                {tachiumaCompanyCount > 0 && <span className="inline-flex items-center gap-0.5 text-emerald-700" title={`立ち馬使用 ${tachiumaCompanyCount}社`}><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold leading-none text-white">立</span>{tachiumaCompanyCount}</span>}
                {fireCompanyCount > 0 && <span className="inline-flex items-center gap-0.5 text-red-700" title={`火気使用 ${fireCompanyCount}社`}><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold leading-none text-white">火</span>{fireCompanyCount}</span>}
                {dayEntrants.length > 0 && <span className="inline-flex items-center gap-0.5 text-amber-700" title={`新規入場 ${entrantStats.companies}社・${entrantStats.people}人`}><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold leading-none text-white">新</span>{entrantStats.people}</span>}
              </span>}
              {company && daySchedules.map((row) => {
                const area = row.work_area;
                const content = row.work_content;
                return <div key={row.id} className="mt-1 min-w-0 rounded bg-emerald-100 p-1 text-[10px] leading-4 text-emerald-950 sm:text-xs">
                  <div className="mb-1 flex items-center justify-end gap-0.5">
                    {(row.aerial_work_vehicle_count ?? 0) > 0 && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 font-bold leading-none text-white shadow-sm" title="高所作業車あり">高</span>}
                    {row.uses_tachiuma && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 font-bold leading-none text-white shadow-sm" title="立ち馬使用あり">立</span>}
                    {row.uses_fire && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-600 font-bold leading-none text-white shadow-sm" title="火気使用あり">火</span>}
                    <button type="button" className="rounded p-0.5 hover:bg-white/70" disabled={loading || completionBusy} onClick={(event) => { event.stopPropagation(); onEdit(row); }} aria-label={`${date}の予定を編集`} title="予定を編集"><Pencil size={12} aria-hidden="true" /></button>
                  </div>
                  <p className="font-bold">{totalWorkers(row)}人</p>
                  <p className="truncate" title={area ?? ""}>{area || "エリア未入力"}</p>
                  <p className="line-clamp-2 break-words" title={content ?? ""}>{content || "作業内容未入力"}</p>
                  {row.uses_tachiuma && row.tachiuma_notes && <p className="truncate font-semibold text-emerald-800" title={row.tachiuma_notes}>立ち馬：{row.tachiuma_notes}</p>}
                  {row.uses_fire && <p className="truncate font-semibold text-rose-800">火気：{row.fire_area || "使用"}</p>}
                </div>;
              })}
              {company && dayEntrants.length > 0 && <div className="mt-1 min-w-0 rounded bg-amber-100 p-1 text-[10px] leading-4 text-amber-900 sm:text-xs"><p className="truncate font-semibold">新規入場</p><p>{entrantStats.companies}社・{entrantStats.people}人</p></div>}
            </div>;

});
