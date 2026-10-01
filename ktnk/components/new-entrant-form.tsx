"use client";

import { Pencil, Plus, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CompanyMaster, NewEntrantRecord } from "@/lib/types";
import { isWorkingDate, workingDateOptions, shortDateWithWeekday, parseLocalDate } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { InputBackButton, InputSelectionSummary } from "@/components/schedule-form-fields";
import { EntrantFields } from "@/components/entrant-fields";
import { MutationNotice } from "@/components/ui/mutation-notice";
import { emptyEntrantDraft, entrantPerson, entrantDraftError, entrantToDraft, PRIMARY_COMPANY_CHOICE } from "@/lib/entrant-form-model";

type Step = "company" | "date" | "details" | "success";
function displayDate(value: string) {
  const date = parseLocalDate(value);
  return date ? new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(date) : "日付未選択";
}

export function NewEntrantForm({ today, initialDate = "", initialCompany = "", initialMaster }: { today: string; initialDate?: string; initialCompany?: string; initialMaster: CompanyMaster }) {
  const [master, setMaster] = useState(initialMaster);
  const [step, setStep] = useState<Step>(initialDate && initialCompany ? "details" : "company");
  const [entryDate, setEntryDate] = useState(initialDate);
  const [primaryCompany, setPrimaryCompany] = useState(initialCompany);
  const defaultChoice = (company: string) => (master.secondariesByPrimary[company] ?? []).length ? "" : PRIMARY_COMPANY_CHOICE;
  const [draft, setDraft] = useState(() => emptyEntrantDraft((initialMaster.secondariesByPrimary[initialCompany] ?? []).length ? "" : PRIMARY_COMPANY_CHOICE));
  const [submitted, setSubmitted] = useState<NewEntrantRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [customDate, setCustomDate] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const requestId = useRef<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const secondaryOptions = master.secondariesByPrimary[primaryCompany] ?? [];
  const dateOptions = useMemo(() => workingDateOptions(today), [today]);

  useEffect(() => { if (message || step === "success") resultRef.current?.focus(); }, [message, step]);
  useEffect(() => {
    const clear = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setEntryDate(initialDate); setPrimaryCompany(initialCompany);
      setStep(initialDate && initialCompany ? "details" : "company");
      setDraft(emptyEntrantDraft((initialMaster.secondariesByPrimary[initialCompany] ?? []).length ? "" : PRIMARY_COMPANY_CHOICE));
      setSubmitted(null); setEditing(false); setCustomDate(false); setMessage(""); setConflict(false);
      requestId.current = null;
    };
    window.addEventListener("pageshow", clear);
    return () => window.removeEventListener("pageshow", clear);
  }, [initialDate, initialCompany, initialMaster]);

  function chooseDate(date: string) {
    if (!isWorkingDate(date)) { setMessage("日曜日は入力できません。月曜〜土曜を選択してください。"); return; }
    setEntryDate(date); setMessage(""); setStep("details");
  }
  async function reload() {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const companyResponse = await apiFetch("/api/companies");
      const freshMaster = await companyResponse.json();
      if (!companyResponse.ok) throw new Error(freshMaster.error ?? "会社一覧を読み込めませんでした。");
      setMaster(freshMaster);
      let recovered = false;
      if (submitted || requestId.current) {
        const response = await apiFetch(`/api/new-entrants?id=${encodeURIComponent(submitted?.id ?? requestId.current!)}`);
        const body = await response.json();
        if (!response.ok && (submitted || response.status !== 404)) throw new Error(body.error ?? "最新の内容を読み込めませんでした。");
        if (body.record) {
          recovered = true;
          setSubmitted(body.record); setEntryDate(body.record.entry_date); setPrimaryCompany(body.record.primary_company);
          setDraft(entrantToDraft(body.record)); setEditing(true); setStep("details");
        } else {
          setDraft(current => ({ ...current, companyChoice: "", newCompany: "" }));
        }
      }
      if (!freshMaster.primaryCompanies.includes(primaryCompany) && !submitted && !recovered) {
        setPrimaryCompany(""); setDraft(emptyEntrantDraft()); setStep("company");
      }
      setMessage(""); setConflict(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "読み込みに失敗しました。"); }
    finally { pending.current = false; setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step !== "details" || pending.current) return;
    const validation = entrantDraftError(draft);
    if (validation) { setMessage(validation); return; }
    pending.current = true; setBusy(true); setMessage(""); setConflict(false);
    try {
      requestId.current ??= crypto.randomUUID();
      const person = entrantPerson(draft, editing ? submitted!.id : requestId.current);
      const response = await apiFetch("/api/new-entrants", {
        method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(editing ? { ...person, entryDate, primaryCompany, expectedUpdatedAt: submitted!.updated_at } : { entryDate, primaryCompany, people: [person] }),
      });
      const body = await response.json();
      if (!response.ok) { setConflict(response.status === 409); throw new Error(body.error ?? "保存できませんでした。"); }
      const record: NewEntrantRecord = editing ? body.record : body.records?.[0];
      if (!record?.id || !record.updated_at) throw new Error("送信結果を確認できませんでした。再送信してください。");
      if (record.secondary_company && !secondaryOptions.includes(record.secondary_company)) {
        setMaster(current => ({ ...current, secondariesByPrimary: { ...current.secondariesByPrimary, [record.primary_company]: [...(current.secondariesByPrimary[record.primary_company] ?? []), record.secondary_company!] } }));
      }
      setSubmitted(record); setEntryDate(record.entry_date); setPrimaryCompany(record.primary_company);
      setEditing(false); setStep("success"); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存できませんでした。"); }
    finally { pending.current = false; setBusy(false); }
  }
  function nextPerson() {
    setDraft(emptyEntrantDraft(submitted?.secondary_company || PRIMARY_COMPANY_CHOICE));
    requestId.current = null; setSubmitted(null); setEditing(false); setMessage(""); setConflict(false); setStep("details");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return <div className="simple-schedule min-h-screen pb-32 sm:pb-8"><main className="mx-auto max-w-2xl px-3 py-5 sm:px-4"><h1 className="page-title">新規入場</h1><form onSubmit={submit} className="space-y-4">
    <InputSelectionSummary company={primaryCompany} date={entryDate ? displayDate(entryDate) : undefined} />
    {step !== "company" && step !== "success" && !editing && <InputBackButton disabled={busy} onClick={() => { setMessage(""); setStep(step === "date" ? "company" : "date"); }} />}
    {step === "company" && <section className="panel p-5 sm:p-6"><label className="field"><span className="mb-3 text-lg font-bold">一次会社を選んでください</span><select autoFocus className="input" value={primaryCompany} onChange={event => {
      const company = event.target.value; setPrimaryCompany(company); setDraft(emptyEntrantDraft(defaultChoice(company))); requestId.current = null; setMessage("");
      if (company) setStep(isWorkingDate(entryDate) ? "details" : "date");
    }}><option value="" disabled>会社を選択</option>{master.primaryCompanies.map(company => <option key={company}>{company}</option>)}</select></label></section>}
    {step === "date" && <section className="panel p-4 sm:p-6"><h2 className="mb-5 text-lg font-bold">入場日を選んでください</h2><div className="grid grid-cols-3 gap-2">{dateOptions.map(option => <button key={option.label} type="button" className="status-option flex-col gap-1 px-2" aria-pressed={!customDate && entryDate === option.date} onClick={() => { setCustomDate(false); chooseDate(option.date); }}><span>{option.label}</span><span className="text-sm font-normal">{shortDateWithWeekday(option.date)}</span></button>)}</div><button type="button" className="btn btn-secondary mt-3 w-full" aria-expanded={customDate} onClick={() => setCustomDate(true)}>別の日付を選ぶ</button>{customDate && <div className="mt-3 space-y-3 rounded-md border border-slate-200 p-3"><label className="field"><span className="label">入場日（月曜〜土曜）</span><input className="input date-input" type="date" value={entryDate} onChange={event => setEntryDate(event.target.value)} /></label><button type="button" className="btn btn-primary w-full" disabled={!isWorkingDate(entryDate)} onClick={() => chooseDate(entryDate)}>次へ</button></div>}</section>}
    {step === "details" && <section className="panel p-5 sm:p-6"><h2 className="mb-5 text-lg font-bold">{editing ? "送信した内容を編集" : "新規入場者を登録"}</h2><fieldset disabled={busy}>
      <EntrantFields primaryCompany={primaryCompany} secondaryOptions={secondaryOptions} draft={draft} onChange={fields => setDraft(current => ({ ...current, ...fields }))} />
    </fieldset><button type="submit" className="btn btn-primary mt-5 min-h-14 w-full" disabled={busy}><Send size={18} aria-hidden="true" />{busy ? "送信中…" : editing ? "変更を送信する" : "送信する"}</button>{editing && <button type="button" className="btn btn-secondary mt-2 w-full" disabled={busy} onClick={() => { setEditing(false); setMessage(""); setConflict(false); setStep("success"); }}>編集をやめる</button>}</section>}
    {message && <div ref={resultRef} tabIndex={-1}><MutationNotice message={message} busy={busy} onReload={conflict ? () => void reload() : undefined} /></div>}
    {step === "success" && submitted && <><div ref={resultRef} tabIndex={-1} role="status" className="panel overflow-hidden"><div className="border-b border-emerald-200 bg-emerald-50 px-5 py-4"><h2 className="text-lg font-bold text-primary">送信しました</h2></div><div className="p-5"><dl className="grid gap-4">
      <div><dt className="text-sm text-slate-500">所属会社</dt><dd className="font-semibold">{submitted.secondary_company || `${submitted.primary_company}（一次会社）`}</dd></div>
      <div><dt className="text-sm text-slate-500">氏名・国籍</dt><dd className="font-semibold">{submitted.person_names}・{submitted.nationality_status === "japanese_only" ? "日本籍" : "外国籍"}</dd></div>
      {submitted.notes && <div><dt className="text-sm text-slate-500">備考</dt><dd className="whitespace-pre-wrap">{submitted.notes}</dd></div>}
    </dl><button type="button" className="btn btn-secondary mt-5 w-full" onClick={() => { setDraft(entrantToDraft(submitted)); setEditing(true); setStep("details"); }}><Pencil size={17} aria-hidden="true" />内容を編集</button>
    <button type="button" className="btn btn-secondary mt-2 w-full" onClick={() => { setEntryDate(""); setPrimaryCompany(""); setSubmitted(null); setDraft(emptyEntrantDraft()); requestId.current = null; setStep("company"); }}>別の日付・会社で登録</button></div></div><div className="submit-bar"><button type="button" className="btn btn-primary min-h-14 w-full" onClick={nextPerson}><Plus size={19} aria-hidden="true" />同じ所属会社の次の人を登録</button></div></>}
  </form></main></div>;
}
