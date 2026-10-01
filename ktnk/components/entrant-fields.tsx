"use client";

import { useId } from "react";
import { InputAction } from "@/components/ui/input-action";
import { NEW_COMPANY_CHOICE, PRIMARY_COMPANY_CHOICE, type EntrantDraft } from "@/lib/entrant-form-model";

export function EntrantFields({ primaryCompany, secondaryOptions, draft, onChange }: {
  primaryCompany: string; secondaryOptions: string[]; draft: EntrantDraft;
  onChange: (fields: Partial<EntrantDraft>) => void;
}) {
  const id = useId();
  const options = [...new Set([...secondaryOptions,
    ...(!["", NEW_COMPANY_CHOICE, PRIMARY_COMPANY_CHOICE].includes(draft.companyChoice) ? [draft.companyChoice] : []),
  ])];
  return <div className="grid gap-5">
    <div className="field">
      <label className="label" htmlFor={`${id}-company`}>所属会社<span className="required-mark">必須</span></label>
      {draft.companyChoice === NEW_COMPANY_CHOICE ? <InputAction id={`${id}-company`} autoFocus aria-required="true" maxLength={200}
        value={draft.newCompany} onChange={event => onChange({ newCompany: event.target.value })} placeholder="新しい二次会社名"
        actionLabel="一覧から選ぶ" onAction={() => onChange({ companyChoice: "", newCompany: "" })} /> :
        <select id={`${id}-company`} autoFocus={!draft.companyChoice} className="input" aria-required="true" value={draft.companyChoice}
          onChange={event => onChange({ companyChoice: event.target.value })}>
          <option value="" disabled>所属会社を選択</option>
          <option value={PRIMARY_COMPANY_CHOICE}>{primaryCompany}（一次会社）</option>
          {options.map(company => <option key={company} value={company}>{company}</option>)}
          <option value={NEW_COMPANY_CHOICE}>一覧にない二次会社</option>
        </select>}
    </div>
    <label className="field"><span className="label">氏名<span className="required-mark">必須</span></span>
      <input className="input" autoFocus={Boolean(draft.companyChoice) && draft.companyChoice !== NEW_COMPANY_CHOICE} aria-required="true" maxLength={200} autoComplete="off" value={draft.personName}
        onChange={event => onChange({ personName: event.target.value })} placeholder="氏名を入力" />
    </label>
    <fieldset className="field"><legend className="label">国籍<span className="required-mark">必須</span></legend>
      <div className="grid grid-cols-2 gap-3">
        {([['japanese_only', '日本籍'], ['includes_foreign', '外国籍']] as const).map(([value, label]) =>
          <label key={value} className={`status-option relative cursor-pointer focus-within:ring-2 focus-within:ring-emerald-600 focus-within:ring-offset-2 ${draft.nationalityStatus === value ? "border-primary bg-primary text-white" : ""}`}>
            <input type="radio" name={`${id}-nationality`} className="sr-only" checked={draft.nationalityStatus === value}
              onChange={() => onChange({ nationalityStatus: value })} />{label}
          </label>)}
      </div>
    </fieldset>
    <label className="field"><span className="label">備考<span className="ml-2 text-sm font-normal text-slate-600">任意</span></span>
      <textarea className="textarea" rows={2} maxLength={2000} value={draft.notes} onChange={event => onChange({ notes: event.target.value })} />
    </label>
  </div>;
}
