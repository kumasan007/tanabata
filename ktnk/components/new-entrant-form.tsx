"use client";

import { Building2, ChevronDown, Pencil, Plus, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CompanyMaster } from "@/lib/types";
import { isWorkingDate, workingDateOptions, shortDateWithWeekday, parseLocalDate } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

type Step = "company" | "date" | "details" | "success";
type Nationality = "japanese_only" | "includes_foreign" | "";
type Draft = { companyChoice: string; newCompany: string; personName: string; nationalityStatus: Nationality; notes: string };
type SubmittedPerson = { id: string; secondaryCompany: string; personName: string; nationalityStatus: Exclude<Nationality, "">; notes: string };
const PRIMARY = "__primary__";
const NEW_COMPANY = "__new_company__";
const emptyDraft = (companyChoice = ""): Draft => ({ companyChoice, newCompany: "", personName: "", nationalityStatus: "", notes: "" });

function displayDate(value: string) {
  const date = parseLocalDate(value);
  return date ? new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(date) : "日付未選択";
}

export function NewEntrantForm({ today, initialDate = "", initialCompany = "", initialMaster }: { today: string; initialDate?: string; initialCompany?: string; initialMaster: CompanyMaster }) {
  const [master, setMaster] = useState(initialMaster);
  const [step, setStep] = useState<Step>(initialDate && initialCompany ? "details" : "company");
  const [entryDate, setEntryDate] = useState(initialDate);
  const [primaryCompany, setPrimaryCompany] = useState(initialCompany);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [submitted, setSubmitted] = useState<SubmittedPerson | null>(null);
  const [editingSubmitted, setEditingSubmitted] = useState(false);
  const [customDate, setCustomDate] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const secondaryOptions = useMemo(() => master.secondariesByPrimary[primaryCompany] ?? [], [master, primaryCompany]);
  const dateOptions = useMemo(() => workingDateOptions(today), [today]);

  useEffect(() => {
    const clearRestoredInput = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setEntryDate(initialDate); setPrimaryCompany(initialCompany);
      setStep(initialDate && initialCompany ? "details" : "company");
      setDraft(emptyDraft()); setSubmitted(null); setEditingSubmitted(false);
      setCustomDate(false); setMessage(""); setBusy(false);
    };
    window.addEventListener("pageshow", clearRestoredInput);
    return () => window.removeEventListener("pageshow", clearRestoredInput);
  }, [initialDate, initialCompany]);

  function chooseDate(date: string) {
    if (!isWorkingDate(date)) { setMessage("日曜日は入力できません。月曜〜土曜を選択してください。"); return; }
    setEntryDate(date); setMessage(""); setStep("details");
  }

  function draftCompany() {
    if (draft.companyChoice === PRIMARY) return "";
    if (draft.companyChoice === NEW_COMPANY) return draft.newCompany.trim();
    return draft.companyChoice.trim();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step !== "details" || busy) return;
    const secondaryCompany = draftCompany();
    if (!draft.companyChoice || (draft.companyChoice === NEW_COMPANY && !secondaryCompany)) { setMessage("所属会社を選択または入力してください。"); return; }
    if (!draft.personName.trim()) { setMessage("氏名を入力してください。"); return; }
    if (!draft.nationalityStatus) { setMessage("日本籍か外国籍かを選択してください。"); return; }
    setBusy(true); setMessage("");
    try {
      const person = { secondaryCompany, personName: draft.personName.trim(), nationalityStatus: draft.nationalityStatus, notes: draft.notes.trim() };
      const response = await apiFetch("/api/new-entrants", {
        method: editingSubmitted ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editingSubmitted ? { ...person, id: submitted?.id, entryDate, primaryCompany } : { entryDate, primaryCompany, people: [person] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "保存できませんでした。");
      const record = editingSubmitted ? body.record : body.records?.[0];
      if (!record?.id) throw new Error("送信結果を確認できませんでした。");
      if (secondaryCompany && !secondaryOptions.includes(secondaryCompany)) {
        setMaster((current) => ({ ...current, secondariesByPrimary: { ...current.secondariesByPrimary, [primaryCompany]: [...secondaryOptions, secondaryCompany] } }));
      }
      setSubmitted({ id: record.id, ...person });
      setEditingSubmitted(false); setStep("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }

  function editSubmitted() {
    if (!submitted) return;
    const existing = secondaryOptions.includes(submitted.secondaryCompany);
    setDraft({ companyChoice: submitted.secondaryCompany ? existing ? submitted.secondaryCompany : NEW_COMPANY : PRIMARY, newCompany: existing ? "" : submitted.secondaryCompany, personName: submitted.personName, nationalityStatus: submitted.nationalityStatus, notes: submitted.notes });
    setEditingSubmitted(true); setMessage(""); setStep("details");
  }

  function continueRegistration() {
    setDraft(emptyDraft(submitted?.secondaryCompany || PRIMARY));
    setSubmitted(null); setEditingSubmitted(false); setMessage(""); setStep("details");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <div className="simple-schedule min-h-screen pb-32 sm:pb-8"><main className="mx-auto max-w-2xl px-3 py-5 sm:px-4"><h1 className="page-title">新規入場</h1><form onSubmit={submit} className="space-y-4">
    {(primaryCompany || entryDate) && <div className="min-w-0 space-y-1 break-words text-sm text-slate-600">{primaryCompany && <p className="font-semibold">{primaryCompany}</p>}{entryDate && <p>{displayDate(entryDate)}</p>}</div>}
    {step !== "company" && step !== "success" && !editingSubmitted && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setStep(step === "date" ? "company" : "date")}>戻る</button>}

    {step === "company" && <section className="panel p-5 sm:p-6"><h2 className="mb-5 text-lg font-bold">一次会社を選んでください</h2><div className="relative"><select autoFocus className="input appearance-none pr-12" value={primaryCompany} onChange={(event) => { setPrimaryCompany(event.target.value); setMessage(""); if (event.target.value) setStep(isWorkingDate(entryDate) ? "details" : "date"); }}><option value="" disabled>会社を選択</option>{master.primaryCompanies.map((company) => <option key={company}>{company}</option>)}</select><ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={21} aria-hidden="true" /></div></section>}

    {step === "date" && <section className="panel p-4 sm:p-6"><h2 className="mb-5 text-lg font-bold">入場日を選んでください</h2><div className="grid grid-cols-3 gap-2">{dateOptions.map((option) => <button key={option.label} type="button" className="status-option flex-col gap-1 px-2" aria-pressed={!customDate && entryDate === option.date} onClick={() => { setCustomDate(false); chooseDate(option.date); }}><span>{option.label}</span><span className="text-sm font-normal">{shortDateWithWeekday(option.date)}</span></button>)}</div><button type="button" className="btn btn-secondary mt-3 w-full" aria-expanded={customDate} onClick={() => setCustomDate(true)}>任意の日付を選ぶ</button>{customDate && <div className="mt-3 min-w-0 w-full space-y-3 overflow-hidden rounded-md border border-slate-200 bg-slate-50/70 p-3"><label className="field min-w-0 overflow-hidden"><span className="label">入場日（月曜〜土曜）</span><input className="input date-input" type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label><button type="button" className="btn btn-primary w-full" disabled={!isWorkingDate(entryDate)} onClick={() => chooseDate(entryDate)}>次へ</button></div>}</section>}

    {step === "details" && <section className="panel p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-primary"><Building2 size={20} /></span><div><h2 className="text-lg font-bold">新規入場者を登録</h2>{editingSubmitted && <p className="text-sm text-slate-600">送信済みの内容を編集中です</p>}</div></div><div className="grid gap-5">
      <div className="field"><span className="label">所属会社<span className="required-mark">必須</span></span><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch"><div className="relative min-w-0"><select autoFocus className="input h-14 appearance-none pr-12" value={draft.companyChoice === NEW_COMPANY ? "" : draft.companyChoice} onChange={(event) => setDraft({ ...draft, companyChoice: event.target.value, newCompany: "" })} disabled={draft.companyChoice === NEW_COMPANY}><option value="" disabled>所属会社を選択</option>{secondaryOptions.map((company) => <option key={company} value={company}>{company}</option>)}<option value={PRIMARY}>{primaryCompany}（一次会社）</option></select><ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={21} aria-hidden="true" /></div><button type="button" className="btn btn-secondary min-h-14 w-full border-dashed px-4 sm:w-auto" onClick={() => setDraft({ ...draft, companyChoice: NEW_COMPANY, newCompany: "" })}><Plus size={18} aria-hidden="true" /><span>新しい二次会社を追加</span></button></div>
      {draft.companyChoice === NEW_COMPANY && <div className="mt-2 flex gap-2"><input autoFocus className="input min-w-0 flex-1" aria-label="新しい二次会社名" value={draft.newCompany} maxLength={200} onChange={(event) => setDraft({ ...draft, newCompany: event.target.value })} placeholder="新しい二次会社名" /><button type="button" className="btn btn-secondary h-14 min-h-14 w-14 shrink-0 p-0" onClick={() => setDraft({ ...draft, companyChoice: "", newCompany: "" })} aria-label="追加を取り消す"><X size={19} /></button></div>}</div>
      <label className="field"><span className="label">氏名<span className="required-mark">必須</span></span><input className="input" value={draft.personName} maxLength={200} onChange={(event) => setDraft({ ...draft, personName: event.target.value })} placeholder="氏名を入力" /></label>
      <fieldset className="field"><legend className="label">国籍<span className="required-mark">必須</span></legend><div className="grid grid-cols-2 gap-3"><button type="button" className="status-option" aria-pressed={draft.nationalityStatus === "japanese_only"} onClick={() => setDraft({ ...draft, nationalityStatus: "japanese_only" })}>日本籍</button><button type="button" className="status-option" aria-pressed={draft.nationalityStatus === "includes_foreign"} onClick={() => setDraft({ ...draft, nationalityStatus: "includes_foreign" })}>外国籍</button></div></fieldset>
      <label className="field"><span className="label">備考<span className="ml-2 text-sm font-normal text-slate-600">任意</span></span><textarea className="textarea" rows={2} value={draft.notes} maxLength={2000} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    </div>{message && <p role="alert" className="mt-4 notice-error">{message}</p>}<button type="submit" className="btn btn-primary mt-5 min-h-14 w-full" disabled={busy}><Send size={18} aria-hidden="true" />{busy ? "送信中…" : editingSubmitted ? "変更を送信する" : "送信する"}</button>{editingSubmitted && <button type="button" className="btn btn-secondary mt-2 w-full" disabled={busy} onClick={() => { setEditingSubmitted(false); setMessage(""); setStep("success"); }}>編集をやめる</button>}</section>}

    {step === "success" && submitted && <><section role="status" className="panel overflow-hidden"><div className="border-b border-emerald-200 bg-emerald-50 px-5 py-4"><h2 className="text-lg font-bold text-primary">送信しました</h2><p className="mt-1 text-sm text-emerald-900">登録内容を確認してください</p></div><div className="p-5"><dl className="grid gap-4"><div><dt className="text-sm font-semibold text-slate-500">入場日</dt><dd className="mt-1 font-semibold">{displayDate(entryDate)}</dd></div><div><dt className="text-sm font-semibold text-slate-500">一次会社</dt><dd className="mt-1 font-semibold">{primaryCompany}</dd></div><div><dt className="text-sm font-semibold text-slate-500">所属会社</dt><dd className="mt-1 font-semibold">{submitted.secondaryCompany || `${primaryCompany}（一次会社）`}</dd></div><div><dt className="text-sm font-semibold text-slate-500">氏名・国籍</dt><dd className="mt-1 font-semibold">{submitted.personName}・{submitted.nationalityStatus === "japanese_only" ? "日本籍" : "外国籍"}</dd></div>{submitted.notes && <div><dt className="text-sm font-semibold text-slate-500">備考</dt><dd className="mt-1 whitespace-pre-wrap">{submitted.notes}</dd></div>}</dl><button type="button" className="btn btn-secondary mt-5 w-full" onClick={editSubmitted}><Pencil size={17} aria-hidden="true" />内容を編集</button></div></section><div className="submit-bar"><button type="button" className="btn btn-primary min-h-14 w-full" onClick={continueRegistration}><Plus size={19} aria-hidden="true" />引き続き登録</button></div></>}
  </form></main></div>;
}
