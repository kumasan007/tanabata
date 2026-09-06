"use client";

import { useId } from "react";
import { CopyButton } from "@/components/copy-button";
import type { SubcompanyInput } from "@/lib/types";

type Props = {
  title: string;
  rows: SubcompanyInput[];
  options: string[];
  onChange: (rows: SubcompanyInput[]) => void;
  countRequired?: boolean;
  previousCounts?: Map<string, number | null>;
};

export function SubcompanyFields({
  title,
  rows,
  options,
  onChange,
  countRequired = true,
  previousCounts,
}: Props) {
  const fieldId = useId();

  function updateRow(index: number, patch: Partial<SubcompanyInput>) {
    onChange(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <section className="grid gap-3" aria-labelledby={`${fieldId}-title`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2
          id={`${fieldId}-title`}
          className="text-base font-bold text-slate-800"
        >
          {title}
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-500">
          任意
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm leading-relaxed text-slate-500">
          {options.length === 0
            ? "選択できる二次会社はありません。"
            : "二次会社がある場合は追加してください。"}
        </p>
      ) : (
        <div className="grid gap-3">
          {rows.map((row, index) => (
            <div key={index} className="grid gap-3 border-b border-border pb-4">
              <div className="grid grid-cols-[minmax(0,1fr)_112px] items-start gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
                <div className="field min-w-0">
                  <label
                    htmlFor={`${fieldId}-company-${index}`}
                    className="label"
                  >
                    会社名{" "}
                    <span className="ml-1 text-sm font-normal text-slate-400">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </label>
                  <select
                    id={`${fieldId}-company-${index}`}
                    className="input"
                    value={row.secondaryCompany}
                    onChange={(event) =>
                      updateRow(index, {
                        secondaryCompany: event.target.value,
                        usePreviousWorkerCount: false,
                      })
                    }
                    required
                  >
                    <option value="" disabled>
                      会社を選択してください
                    </option>
                    {row.secondaryCompany &&
                    !options.includes(row.secondaryCompany) ? (
                      <option value={row.secondaryCompany}>
                        {row.secondaryCompany}
                      </option>
                    ) : null}
                    {Array.from(new Set(options)).map((company) => (
                      <option key={company} value={company}>
                        {company}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field min-w-0">
                  <label
                    htmlFor={`${fieldId}-count-${index}`}
                    className="label whitespace-nowrap"
                  >
                    人数
                    {countRequired ? (
                      <span className="required-mark" aria-label="必須">
                        *
                      </span>
                    ) : null}
                  </label>
                  <div className="relative">
                    <input
                      id={`${fieldId}-count-${index}`}
                      className="input pl-3 pr-7 tabular-nums"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      type="number"
                      value={row.workerCount ?? 0}
                      onChange={(event) =>
                        updateRow(index, {
                          usePreviousWorkerCount: false,
                          workerCount: Math.max(
                            0,
                            Number(event.target.value) || 0,
                          ),
                        })
                      }
                      required={countRequired}
                    />
                    <span
                      className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500"
                      aria-hidden="true"
                    >
                      人
                    </span>
                  </div>
                  <CopyButton
                    label={`${row.secondaryCompany || "二次会社"}の前回人数をコピー`}
                    copied={Boolean(row.usePreviousWorkerCount)}
                    disabled={previousCounts?.get(row.secondaryCompany) == null}
                    onCopy={() => {
                      const count = previousCounts?.get(row.secondaryCompany);
                      if (count != null)
                        updateRow(index, {
                          workerCount: count,
                          usePreviousWorkerCount: true,
                        });
                    }}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="btn btn-secondary h-12 px-2 text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => removeRow(index)}
                  aria-label={`${row.secondaryCompany || `${index + 1}行目の二次会社`}を削除`}
                  title="この会社を削除"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-secondary min-h-12 w-full"
        disabled={options.length === 0}
        onClick={() =>
          onChange([
            ...rows,
            {
              secondaryCompany: "",
              workerCount: 0,
              usePreviousWorkerCount: false,
            },
          ])
        }
      >
        {title}を追加する
      </button>
    </section>
  );
}
