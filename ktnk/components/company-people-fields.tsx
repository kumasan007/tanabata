"use client";
import Link from "next/link";
import { useId } from "react";
import type { ScheduleSubmitInput } from "@/lib/types";
export function CompanyPeopleFields({ primaryCompany, primaryCount, primaryCountCopied, previousPrimaryCount, subcompanies, previousCounts, onPrimaryCountChange, onSubcompaniesChange, showPrevious = true, }: {
    primaryCompany: string;
    primaryCount: number | null;
    primaryCountCopied: boolean;
    previousPrimaryCount: number | null | undefined;
    subcompanies: ScheduleSubmitInput["currentSubcompanies"];
    previousCounts: Map<string, number | null>;
    onPrimaryCountChange: (count: number | null, copied: boolean) => void;
    onSubcompaniesChange: (rows: ScheduleSubmitInput["currentSubcompanies"]) => void;
    showPrevious?: boolean;
}) {
    const id = useId();
    const rows = [
        ...subcompanies.map((row) => ({
            company: row.secondaryCompany,
            count: row.workerCount,
            copied: Boolean(row.usePreviousWorkerCount),
            previous: previousCounts.get(row.secondaryCompany),
            primary: false,
        })),
        { company: primaryCompany, count: primaryCount, copied: primaryCountCopied, previous: previousPrimaryCount, primary: true },
    ];
    return (<section className="overflow-hidden rounded-md border border-border" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="border-b border-border bg-slate-50 px-3 py-2 font-bold text-slate-800">
        作業する会社
      </h2>
      <div className={`grid ${showPrevious ? "grid-cols-[minmax(0,1fr)_76px_52px]" : "grid-cols-[minmax(0,1fr)_76px]"} items-center gap-2 border-b border-border bg-slate-50/60 px-3 py-1.5 text-sm font-semibold text-slate-500`}>
        <span>会社名</span><span>人数</span>{showPrevious && <span className="sr-only">前回値</span>}
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row, index) => (<div key={`${row.primary}-${row.company}`} className={`grid ${showPrevious ? "grid-cols-[minmax(0,1fr)_76px_52px]" : "grid-cols-[minmax(0,1fr)_76px]"} items-center gap-2 px-3 py-2`}>
            <span className="min-w-0 break-words text-sm font-medium text-slate-800">{row.company}</span>
            <div className="relative">
              <input id={`${id}-${index}`} aria-label={`${row.company}の人数`} className="input h-10 px-2 pr-5 text-base tabular-nums" inputMode="numeric" type="number" min={0} step={1} placeholder="0" value={row.count ?? ""} onChange={(event) => {
                const count = event.target.value === "" ? null : Math.max(0, Number(event.target.value));
                if (row.primary)
                    onPrimaryCountChange(count, false);
                else
                    onSubcompaniesChange(subcompanies.map((item) => item.secondaryCompany === row.company
                        ? { ...item, workerCount: count, usePreviousWorkerCount: false }
                        : item));
            }}/>
              <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-xs text-slate-500">人</span>
            </div>
            {showPrevious && <button type="button" className="min-h-9 rounded border border-border bg-white px-1 text-xs font-semibold text-slate-600 disabled:opacity-35" disabled={row.previous == null} aria-label={`${row.company}の前回人数をコピー`} onClick={() => {
                    if (row.previous == null)
                        return;
                    if (row.primary)
                        onPrimaryCountChange(row.previous, true);
                    else
                        onSubcompaniesChange(subcompanies.map((item) => item.secondaryCompany === row.company
                            ? { ...item, workerCount: row.previous ?? null, usePreviousWorkerCount: true }
                            : item));
                }}>
              {row.copied ? "済" : "前回"}
            </button>}
          </div>))}
      </div>
      <div className="border-t border-border bg-slate-50 p-3 text-sm">
        <p className="text-slate-600">ここにない二次会社は、新規入場から追加できます。</p>
        <Link className="btn btn-secondary mt-2 w-full" href="/new-entrants">
          新規入場から二次会社を追加
        </Link>
      </div>
    </section>);
}
