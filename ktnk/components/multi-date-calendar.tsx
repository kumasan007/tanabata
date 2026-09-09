"use client";

import { useMemo, useState } from "react";
import { addDays, isWorkingDate, parseLocalDate, shortDateWithWeekday, toDateString } from "@/lib/utils";

export function MultiDateCalendar({ value, today, onChange, onConfirm }: {
  value: string[];
  today: string;
  onChange: (dates: string[]) => void;
  onConfirm: () => void;
}) {
  const initial = parseLocalDate(value[0] || today) ?? new Date();
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const selected = useMemo(() => new Set(value), [value]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let day = 1; day <= last.getDate(); day++) cells.push(toDateString(new Date(month.getFullYear(), month.getMonth(), day)));

  function choose(date: string) {
    if (!isWorkingDate(date)) return;
    if (rangeStart === "") {
      setRangeStart(date);
      return;
    }
    if (rangeStart) {
      const from = parseLocalDate(rangeStart)!;
      const to = parseLocalDate(date)!;
      const start = from <= to ? from : to;
      const end = from <= to ? to : from;
      const next = new Set(selected);
      for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
        const candidate = toDateString(cursor);
        if (isWorkingDate(candidate)) next.add(candidate);
      }
      onChange([...next].sort());
      setRangeStart(null);
      return;
    }
    const next = new Set(selected);
    if (next.has(date)) next.delete(date); else next.add(date);
    onChange([...next].sort());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn btn-secondary px-3" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>前月</button>
        <strong>{month.getFullYear()}年{month.getMonth() + 1}月</strong>
        <button type="button" className="btn btn-secondary px-3" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>翌月</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {"日月火水木金土".split("").map((day) => <span key={day} className="py-1 font-semibold text-slate-500">{day}</span>)}
        {cells.map((date, index) => date ? (
          <button
            key={date}
            type="button"
            disabled={!isWorkingDate(date)}
            aria-pressed={selected.has(date)}
            onClick={() => choose(date)}
            className="status-option min-h-11 p-1 disabled:border-transparent disabled:bg-transparent disabled:text-slate-300"
          >
            {Number(date.slice(-2))}
          </button>
        ) : <span key={`blank-${index}`} />)}
      </div>
      <button
        type="button"
        className="btn btn-secondary w-full"
        aria-pressed={rangeStart !== null}
        onClick={() => setRangeStart(rangeStart ? null : "")}
      >
        {rangeStart === null ? "期間を追加" : rangeStart === "" ? "開始日を選んでください" : `${shortDateWithWeekday(rangeStart)}から終了日を選択`}
      </button>
      {rangeStart === "" && <p className="text-sm text-slate-600">カレンダーで期間の開始日を選んでください。</p>}
      <p className="text-sm leading-6 text-slate-600">選択中：{value.length ? value.map(shortDateWithWeekday).join("、") : "なし"}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-secondary" disabled={!value.length} onClick={() => onChange([])}>すべて解除</button>
        <button type="button" className="btn btn-primary" disabled={!value.length} onClick={onConfirm}>次へ</button>
      </div>
    </div>
  );
}
