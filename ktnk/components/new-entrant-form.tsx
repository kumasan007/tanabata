"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { CompanyMaster } from "@/lib/types";
import { isWorkingDate, workingDateOptions, shortDateWithWeekday, parseLocalDate } from "@/lib/utils";

type Step = "company" | "date" | "details" | "confirm" | "success";
type Nationality = "japanese_only" | "includes_foreign" | "";
type Person = { id: string; secondaryCompany: string; personName: string; nationalityStatus: Exclude<Nationality, "">; notes: string };
type Draft = { companyChoice: string; newCompany: string; personName: string; nationalityStatus: Nationality; notes: string };
const PRIMARY = "__primary__";
const NEW_COMPANY = "__new_company__";
const emptyDraft = (): Draft => ({ companyChoice: "", newCompany: "", personName: "", nationalityStatus: "", notes: "" });

function displayDate(value: string) {
  const date = parseLocalDate(value);
  return date ? new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(date) : "日付未選択";
}

export function NewEntrantForm({ today, initialDate = "", initialCompany = "", initialMaster }: { today: string; initialDate?: string; initialCompany?: string; initialMaster: CompanyMaster }) {
  const [master, setMaster] = useState(initialMaster);
  const [step, setStep] = useState<Step>(initialDate && initialCompany ? "details" : "company");
  const [entryDate, setEntryDate] = useState(initialDate);
  const [primaryCompany, setPrimaryCompany] = useState(initialCompany);
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const personNameInput = useRef<HTMLInputElement>(null);
  const secondaryOptions = useMemo(() => master.secondariesByPrimary[primaryCompany] ?? [], [master, primaryCompany]);
  const dateOptions = useMemo(() => workingDateOptions(today), [today]);

  function chooseDate(date: string) {
    if (!isWorkingDate(date)) { setMessage("日曜日は入力できません。月曜〜土曜を選択してください。"); return; }
    setEntryDate(date); setMessage(""); setStep("details");
  }

  function draftCompany() {
    if (draft.companyChoice === PRIMARY) return "";
    if (draft.companyChoice === NEW_COMPANY) return draft.newCompany.trim();
    return draft.companyChoice.trim();
  }

  function savePerson() {
    const company = draftCompany();
    if (!draft.companyChoice || (draft.companyChoice === NEW_COMPANY && !company)) { setMessage("所属会社を選択または入力してください。"); return; }
    if (!draft.personName.trim()) { setMessage("氏名を入力してください。"); return; }
    if (!draft.nationalityStatus) { setMessage("日本人か外国人かを選択してください。"); return; }
    const person: Person = { id: editingId ?? crypto.randomUUID(), secondaryCompany: company, personName: draft.personName.trim(), nationalityStatus: draft.nationalityStatus, notes: draft.notes.trim() };
    setPeople((current) => editingId ? current.map((item) => item.id === editingId ? person : item) : [...current, person]);
    if (company && !secondaryOptions.includes(company)) {
      setMaster((current) => ({ ...current, secondariesByPrimary: { ...current.secondariesByPrimary, [primaryCompany]: [...secondaryOptions, company] } }));
    }
    setDraft({ ...emptyDraft(), companyChoice: company ? company : PRIMARY }); setEditingId(null); setMessage("");
    requestAnimationFrame(() => personNameInput.current?.focus());
  }

  function editPerson(person: Person) {
    const existing = secondaryOptions.includes(person.secondaryCompany);
    setDraft({ companyChoice: person.secondaryCompany ? existing ? person.secondaryCompany : NEW_COMPANY : PRIMARY, newCompany: existing ? "" : person.secondaryCompany, personName: person.personName, nationalityStatus: person.nationalityStatus, notes: person.notes });
    setEditingId(person.id); setMessage("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step !== "confirm" || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/new-entrants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entryDate, primaryCompany, people }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "保存できませんでした。");
      const newCompanies = people.map((person) => person.secondaryCompany).filter((company) => company && !secondaryOptions.includes(company));
      if (newCompanies.length) setMaster((current) => ({ ...current, secondariesByPrimary: { ...current.secondariesByPrimary, [primaryCompany]: [...new Set([...secondaryOptions, ...newCompanies])] } }));
      setStep("success"); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }

  function reset(keepCompany: boolean) {
    setEntryDate(""); setPrimaryCompany(keepCompany ? primaryCompany : ""); setPeople([]); setDraft(emptyDraft()); setEditingId(null); setCustomDate(false); setMessage(""); setStep(keepCompany ? "date" : "company");
  }

  return <div className="simple-schedule min-h-screen pb-32 sm:pb-8"><main className="mx-auto max-w-2xl px-3 py-5 sm:px-4"><form onSubmit={submit} className="space-y-4">
    {step !== "company" && step !== "success" && <div className="flex items-center justify-between gap-3 text-sm text-slate-600"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setStep(step === "date" ? "company" : step === "details" ? "date" : "details")}>戻る</button><p className="min-w-0 text-right break-words">{primaryCompany}<span className="block">{displayDate(entryDate)}</span></p></div>}

    {step === "company" && <section className="panel p-5 sm:p-6"><h2 className="mb-5 text-lg font-bold">一次会社を選んでください</h2><select autoFocus className="input" value={primaryCompany} onChange={(event) => { setPrimaryCompany(event.target.value); setPeople([]); setMessage(""); if (event.target.value) setStep(isWorkingDate(entryDate) ? "details" : "date"); }}><option value="" disabled>会社を選択</option>{master.primaryCompanies.map((company) => <option key={company}>{company}</option>)}</select></section>}

    {step === "date" && <section className="panel p-4 sm:p-6"><h2 className="mb-5 text-lg font-bold">入場日を選んでください</h2><div className="grid grid-cols-3 gap-2">{dateOptions.map((option) => <button key={option.label} type="button" className="status-option flex-col gap-1 px-2" aria-pressed={!customDate && entryDate === option.date} onClick={() => { setCustomDate(false); chooseDate(option.date); }}><span>{option.label}</span><span className="text-sm font-normal">{shortDateWithWeekday(option.date)}</span></button>)}</div><button type="button" className="btn btn-secondary mt-3 w-full" aria-expanded={customDate} onClick={() => setCustomDate(true)}>任意の日付を選ぶ</button>{customDate && <div className="mt-3 min-w-0 w-full space-y-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3"><label className="field min-w-0 overflow-hidden"><span className="label">入場日（月曜〜土曜）</span><input className="input date-input" type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label><button type="button" className="btn btn-primary w-full" disabled={!isWorkingDate(entryDate)} onClick={() => chooseDate(entryDate)}>次へ</button></div>}</section>}

    {step === "details" && <><section className="panel p-5 sm:p-6"><h2 className="mb-5 text-lg font-bold">新規入場者を一人ずつ追加</h2><div className="grid gap-5">
      <div className="field"><span className="label">所属会社<span className="required-mark">必須</span></span><div className="flex flex-col gap-2 sm:flex-row"><select autoFocus className="input min-w-0 flex-1" value={draft.companyChoice === NEW_COMPANY ? "" : draft.companyChoice} onChange={(event) => setDraft({ ...draft, companyChoice: event.target.value, newCompany: "" })} disabled={draft.companyChoice === NEW_COMPANY}><option value="" disabled>所属会社を選択</option>{secondaryOptions.map((company) => <option key={company} value={company}>{company}</option>)}<option value={PRIMARY}>{primaryCompany}</option></select><button type="button" className="btn btn-secondary h-[46px] min-h-[46px] shrink-0 px-3" onClick={() => setDraft({ ...draft, companyChoice: NEW_COMPANY, newCompany: "" })}><Plus size={18} aria-hidden="true" />新しい二次会社を追加</button></div>
      {draft.companyChoice === NEW_COMPANY && <div className="mt-2 flex gap-2"><input autoFocus className="input min-w-0 flex-1" aria-label="新しい二次会社名" value={draft.newCompany} maxLength={200} onChange={(event) => setDraft({ ...draft, newCompany: event.target.value })} placeholder="新しい二次会社名" /><button type="button" className="btn btn-secondary h-[46px] min-h-[46px] w-[46px] shrink-0 p-0" onClick={() => setDraft({ ...draft, companyChoice: "", newCompany: "" })} aria-label="追加を取り消す"><X size={18} /></button></div>}</div>
      <label className="field"><span className="label">氏名<span className="required-mark">必須</span></span><input ref={personNameInput} className="input" value={draft.personName} maxLength={200} onChange={(event) => setDraft({ ...draft, personName: event.target.value })} placeholder="氏名を入力" />{!editingId && draft.companyChoice && <span className="text-sm text-slate-500">追加後も所属会社を引き継ぎます</span>}</label>
      <fieldset className="field"><legend className="label">国籍<span className="required-mark">必須</span></legend><div className="grid grid-cols-2 gap-3"><button type="button" className="status-option" aria-pressed={draft.nationalityStatus === "japanese_only"} onClick={() => setDraft({ ...draft, nationalityStatus: "japanese_only" })}>日本人</button><button type="button" className="status-option" aria-pressed={draft.nationalityStatus === "includes_foreign"} onClick={() => setDraft({ ...draft, nationalityStatus: "includes_foreign" })}>外国人</button></div></fieldset>
      <label className="field"><span className="label">備考<span className="ml-2 text-sm font-normal text-slate-600">任意</span></span><textarea className="textarea" rows={2} value={draft.notes} maxLength={2000} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    </div>{message && <p role="alert" className="mt-4 text-red-700">{message}</p>}<div className="mt-5 flex gap-2"><button type="button" className="btn btn-primary flex-1" onClick={savePerson}>{editingId ? "変更を保存" : "この人を追加"}</button>{editingId && <button type="button" className="btn btn-secondary" onClick={() => { setDraft(emptyDraft()); setEditingId(null); }}>取消</button>}</div></section>
      {people.length > 0 && <section className="panel p-4"><h3 className="font-bold">登録する新規入場者　{people.length}人</h3><div className="mt-3 grid gap-2">{people.map((person) => <div key={person.id} className="flex items-center gap-2 rounded-md border border-border p-3"><div className="min-w-0 flex-1"><p className="break-words font-semibold">{person.personName}</p><p className="break-words text-sm text-slate-600">{person.secondaryCompany || `${primaryCompany}（一次会社所属）`}・{person.nationalityStatus === "japanese_only" ? "日本人" : "外国人"}</p></div><button type="button" className="btn btn-secondary h-9 min-h-9 w-9 p-0" onClick={() => editPerson(person)} aria-label={`${person.personName}を編集`}><Pencil size={15} /></button><button type="button" className="btn btn-secondary h-9 min-h-9 w-9 p-0 text-red-700" onClick={() => setPeople((current) => current.filter((item) => item.id !== person.id))} aria-label={`${person.personName}を削除`}><Trash2 size={15} /></button></div>)}</div><button type="button" className="btn btn-primary mt-4 w-full" onClick={() => { setMessage(""); setStep("confirm"); }}>登録内容を確認</button></section>}
    </>}

    {step === "confirm" && <><section className="panel p-5 sm:p-6"><h2 className="mb-2 text-lg font-bold">この内容で送信します</h2><p className="font-semibold text-primary">{displayDate(entryDate)}・{primaryCompany}・{people.length}人</p><div className="mt-4 grid gap-2">{people.map((person) => <div key={person.id} className="rounded-md bg-slate-50 p-3"><p className="font-semibold">{person.personName}・{person.nationalityStatus === "japanese_only" ? "日本人" : "外国人"}</p><p className="text-sm text-slate-600">{person.secondaryCompany || `${primaryCompany}（一次会社所属）`}</p>{person.notes && <p className="mt-1 whitespace-pre-wrap text-sm">備考：{person.notes}</p>}</div>)}</div><button type="button" className="btn btn-secondary mt-5 w-full" onClick={() => setStep("details")}>内容を編集</button></section><div className="submit-bar">{message && <p role="alert" className="mb-3 text-red-700">{message}</p>}<button type="submit" className="btn btn-primary min-h-14 w-full" disabled={busy}>{busy ? "送信中…" : `${people.length}人の予定を送信`}</button></div></>}

    {step === "success" && <section role="status" className="panel border-emerald-200 bg-emerald-50 p-5"><h2 className="text-lg font-bold text-primary">新規入場予定を送信しました</h2><p className="mt-2">{displayDate(entryDate)}・{primaryCompany}・{people.length}人</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" className="btn btn-primary" onClick={() => reset(true)}>同じ一次会社で続けて入力</button><button type="button" className="btn btn-secondary" onClick={() => reset(false)}>別の一次会社を入力</button></div></section>}
  </form></main></div>;
}
