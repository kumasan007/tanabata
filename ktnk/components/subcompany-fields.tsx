"use client";

import { Plus, Trash2 } from "lucide-react";
import type { SubcompanyInput } from "@/lib/types";

type Props = {
  title: string;
  rows: SubcompanyInput[];
  options: string[];
  onChange: (rows: SubcompanyInput[]) => void;
};

export function SubcompanyFields({ title, rows, options, onChange }: Props) {
  function updateRow(index: number, patch: Partial<SubcompanyInput>) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
          二次会社なし
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((row, index) => (
            <div key={index} className="compact-panel grid gap-3 p-3">
              <div className="grid grid-cols-[1fr_88px_40px] gap-2">
                <label className="field">
                  <span className="label">二次会社</span>
                  <select
                    className="input"
                    value={row.secondaryCompany}
                    onChange={(event) => updateRow(index, { secondaryCompany: event.target.value })}
                  >
                    <option value="">選択</option>
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">
                    人数
                    <span className="required-mark" aria-label="必須">*</span>
                  </span>
                  <input
                    className="input px-2 text-right"
                    inputMode="numeric"
                    min={0}
                    type="number"
                    value={row.workerCount ?? 0}
                    onChange={(event) =>
                      updateRow(index, {
                        workerCount: event.target.value === "" ? 0 : Number(event.target.value),
                      })
                    }
                    required
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary mt-7 h-12 px-0"
                  onClick={() => removeRow(index)}
                  aria-label="削除"
                  title="削除"
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-secondary h-14 w-full border-2 border-dashed text-base"
        onClick={() => onChange([...rows, { secondaryCompany: "", workerCount: 0 }])}
      >
        <Plus size={22} aria-hidden="true" />
        {title}を追加する
      </button>
    </section>
  );
}
