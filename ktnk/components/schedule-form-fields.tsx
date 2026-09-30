"use client";

import { useId, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";

export function SectionHeading({ title }: { title: string }) {
  return <h2 className="mb-5 text-lg font-bold text-slate-900">{title}</h2>;
}

export function InputSelectionSummary({ company, date }: { company?: string; date?: ReactNode }) {
  if (!company && !date) return null;
  return <div className="flex min-w-0 items-baseline gap-3 break-words text-sm text-slate-600">
    {company && <p className="min-w-0 max-w-[50%] font-semibold">{company}</p>}
    {date && <p className="min-w-0 flex-1">{date}</p>}
  </div>;
}

export function InputBackButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return <button type="button" className="btn btn-secondary w-full" disabled={disabled} onClick={onClick}>戻る</button>;
}

export function WorkField({ label, value, placeholder, multiline = false, required = false, previousValue, onChange }: {
  label: string; value: string; placeholder: string; multiline?: boolean; required?: boolean;
  previousValue: string | null | undefined; onChange: (value: string) => void;
}) {
  const id = useId();
  const [same, setSame] = useState(false);
  const inputProps = { id, value, placeholder, "aria-required": required, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setSame(false); onChange(event.target.value); } };
  return <div className="field"><div className="flex flex-wrap items-center justify-between gap-x-3"><label className="label" htmlFor={id}>{label}{required ? <span className="required-mark">必須</span> : <span className="ml-2 text-sm font-normal text-slate-600">任意</span>}</label><CopyButton label={`${label}を前回からコピー`} copied={same} disabled={previousValue == null || previousValue.trim() === ""} onCopy={() => { if (previousValue != null) { setSame(true); onChange(previousValue); } }}/></div><div className="relative">{multiline ? <textarea className="textarea pr-11" rows={3} {...inputProps}/> : <input className="input pr-11" {...inputProps}/>} {value && <button type="button" className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-xl text-slate-500 hover:bg-slate-100" aria-label={`${label}を消す`} onClick={() => { setSame(false); onChange(""); }}>×</button>}</div></div>;
}
