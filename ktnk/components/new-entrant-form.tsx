"use client";

import { ExistingEntryCheck } from "@/components/existing-entry-check";
import { useMemo, useState } from "react";
import type { CompanyMaster } from "@/lib/types";
import { isWorkingDate, workingDateOptions, shortDateWithWeekday, parseLocalDate } from "@/lib/utils";

type Step = "existing" | "company" | "date" | "details" | "confirm" | "success";
type EntrantForm = { entryDate: string; primaryCompany: string; secondaryCompany: string; personCount: number | null; personNames: string; nationalityStatus: "japanese_only" | "includes_foreign" | ""; notes: string };

function displayDate(value: string) {
  const date = parseLocalDate(value);
  return date ? new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(date) : "日付を選択";
}

function SectionHeading({ title }: { title: string }) {
  return <h2 className="mb-5 text-lg font-bold text-slate-900">{title}</h2>;
}

export function NewEntrantForm({ today, initialMaster }: { today: string; initialMaster: CompanyMaster }) {
  const [master, setMaster] = useState<CompanyMaster>(initialMaster);
  const [form, setForm] = useState<EntrantForm>({ entryDate: "", primaryCompany: "", secondaryCompany: "", personCount: null, personNames: "", nationalityStatus: "", notes: "" });
  const [step, setStep] = useState<Step>("company");
  const [customDate, setCustomDate] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState("");
  const secondaryOptions = useMemo(() => master?.secondariesByPrimary[form.primaryCompany] ?? [], [master, form.primaryCompany]);
  const dateOptions = useMemo(() => workingDateOptions(today), [today]);

  function chooseCompany(company: string) {
    setForm((current) => ({ ...current, primaryCompany: company, secondaryCompany: "" }));
    setMessage("");
    if (company) setStep("date");
  }

  function chooseDate(date: string) {
    setAcknowledged("");
    setForm((current) => ({ ...current, entryDate: date }));
    setMessage("");
    if (isWorkingDate(date)) setStep("existing");
    else if (date) setMessage("日曜日は入力できません。月曜〜土曜を選択してください。");
  }

  async function showConfirmation() {
    if (busy) return;
    if (!form.secondaryCompany.trim()) { setMessage("新規入場する二次会社を入力してください。"); return; }
    if (form.personCount == null || form.personCount < 1) { setMessage("新規入場者を1人以上入力してください。"); return; }
    if (!form.nationalityStatus) { setMessage("日本籍のみか、外国籍を含むかを選択してください。"); return; }
    if (!form.personNames.trim()) { setMessage("氏名を入力してください。"); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/new-entrants?${new URLSearchParams({ from: form.entryDate, to: form.entryDate })}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "入力済みの内容を確認できませんでした。");
      const key = JSON.stringify([form.entryDate, form.primaryCompany, form.secondaryCompany.trim()]);
      if (body.records.some((row: { primary_company: string; secondary_company: string }) => row.primary_company === form.primaryCompany && row.secondary_company === form.secondaryCompany.trim()) && acknowledged !== key) {
        setMessage("この二次会社は既に入力されています。内容を確認し、「変更する」を選択してください。");
        setStep("existing"); return;
      }
      setStep("confirm");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "確認できませんでした。"); }
    finally { setBusy(false); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step !== "confirm") return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/new-entrants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "保存できませんでした。");
      const primary = form.primaryCompany;
      const secondary = form.secondaryCompany.trim();
      setMaster((current) => current ? { ...current, secondariesByPrimary: { ...current.secondariesByPrimary, [primary]: [...new Set([...(current.secondariesByPrimary[primary] ?? []), secondary])] } } : current);
      setStep("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }

  function resetForm(keepCompany = false) {
    setForm({ entryDate: "", primaryCompany: keepCompany ? form.primaryCompany : "", secondaryCompany: "", personCount: null, personNames: "", nationalityStatus: "", notes: "" });
    setCustomDate(false); setMessage(""); setStep(keepCompany ? "date" : "company");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setMessage("");
    if (step === "date") setStep("company");
    if (step === "details" || step === "existing") setStep("date");
    if (step === "confirm") setStep("details");
  }

  return <div className="simple-schedule min-h-screen pb-32 sm:pb-8">
    <main className="mx-auto max-w-2xl px-3 py-5 sm:px-4">
      <form onSubmit={submit} className="space-y-4">
        {step !== "company" && step !== "success" && <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={goBack}>戻る</button>
          <p className="min-w-0 text-right break-words">{form.primaryCompany}<span className="block">{displayDate(form.entryDate)}</span></p>
        </div>}

        {step === "company" && <section className="panel p-5 sm:p-6">
          <SectionHeading title="一次会社を選んでください" />
          <label className="field"><span className="sr-only">一次会社</span><select autoFocus className="input" value={form.primaryCompany} disabled={!master} onChange={(event) => chooseCompany(event.target.value)}><option value="" disabled>{master ? "会社を選択" : "読み込み中…"}</option>{master?.primaryCompanies.map((company) => <option key={company} value={company}>{company}</option>)}</select></label>
          {message && <p role="alert" className="mt-3 text-red-700">{message}</p>}
        </section>}

        {step === "existing" && <ExistingEntryCheck key={`${form.primaryCompany}-${form.entryDate}`} date={form.entryDate} company={form.primaryCompany} kind="entrant" onOtherDate={() => setStep("date")} onNew={() => { setForm((current) => ({ ...current, secondaryCompany: "", personCount: null, personNames: "", nationalityStatus: "", notes: "" })); setStep("details"); }} onEntrant={(row) => { setAcknowledged(JSON.stringify([row.entry_date, row.primary_company, row.secondary_company])); setForm({ entryDate: row.entry_date, primaryCompany: row.primary_company, secondaryCompany: row.secondary_company, personCount: row.person_count, personNames: row.person_names ?? "", nationalityStatus: row.nationality_status ?? "", notes: row.notes ?? "" }); setStep("details"); }} />}
        {step === "date" && <section className="panel p-5 sm:p-6">
          <SectionHeading title="入場日を選んでください" />
          <div className="grid grid-cols-3 gap-2">{dateOptions.map((option) => <button key={option.label} type="button" className="status-option flex-col gap-1 px-2" aria-pressed={!customDate && form.entryDate === option.date} onClick={() => { setCustomDate(false); chooseDate(option.date); }}><span>{option.label}</span><span className="text-sm font-normal">{shortDateWithWeekday(option.date)}</span></button>)}</div>
          <button type="button" className="btn btn-secondary mt-3 w-full" aria-expanded={customDate} aria-controls="custom-entry-date" onClick={() => setCustomDate(true)}>任意の日付を選ぶ</button>
          {customDate && <div id="custom-entry-date" className="mt-3 min-w-0 w-full space-y-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4"><label className="field min-w-0"><span className="label">入場日（月曜〜土曜）</span><input autoFocus className="input max-w-full" type="date" value={form.entryDate} onChange={(event) => setForm({ ...form, entryDate: event.target.value })} /></label><button type="button" className="btn btn-primary w-full" disabled={!isWorkingDate(form.entryDate)} onClick={() => chooseDate(form.entryDate)}>次へ</button></div>}
        </section>}

        {step === "details" && <section className="panel p-5 sm:p-6">
          <SectionHeading title="新規入場者を入力してください" />
          <div className="grid gap-5">
            <label className="field"><span className="label">二次会社<span className="required-mark">必須</span></span><input autoFocus className="input" required list="secondary-company-options" value={form.secondaryCompany} onChange={(e) => setForm({ ...form, secondaryCompany: e.target.value })} placeholder="選択または会社名を入力" /><datalist id="secondary-company-options">{secondaryOptions.map((company) => <option key={company} value={company} />)}</datalist><span className="text-sm leading-6 text-slate-500">未登録の会社名は、送信時にこの一次会社の二次会社へ追加されます。</span></label>
            <label className="field"><span className="label">初めて入る人数<span className="required-mark">必須</span></span><div className="relative"><input className="input pr-10 tabular-nums" type="number" inputMode="numeric" required min={1} step={1} value={form.personCount ?? ""} placeholder="1" onChange={(e) => setForm({ ...form, personCount: e.target.value === "" ? null : Math.max(1, Number(e.target.value)) })} /><span className="pointer-events-none absolute right-4 top-4 text-sm text-slate-600">人</span></div></label>
            <fieldset className="field"><legend className="label">国籍確認<span className="required-mark">必須</span></legend><div className="grid grid-cols-2 gap-3"><button type="button" className="status-option" aria-pressed={form.nationalityStatus === "japanese_only"} onClick={() => setForm({ ...form, nationalityStatus: "japanese_only" })}>日本籍のみ</button><button type="button" className="status-option" aria-pressed={form.nationalityStatus === "includes_foreign"} onClick={() => setForm({ ...form, nationalityStatus: "includes_foreign" })}>外国籍を含む</button></div></fieldset>
            <label className="field"><span className="label">氏名<span className="required-mark">必須</span></span><textarea className="textarea" rows={3} required value={form.personNames} onChange={(e) => setForm({ ...form, personNames: e.target.value })} placeholder="複数の場合は改行して入力" /></label>
            <label className="field"><span className="label">備考<span className="ml-2 text-sm font-normal text-slate-600">任意</span></span><textarea className="textarea" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="連絡事項や注意点など" /></label>
          </div>
          {message && <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{message}</p>}
          <button type="button" className="btn btn-primary mt-5 w-full" disabled={busy} onClick={showConfirmation}>{busy ? "入力済みの内容を確認中…" : "次へ"}</button>
        </section>}

        {step === "confirm" && <><section className="panel p-5 sm:p-6">
          <SectionHeading title="この内容で送信します" />
          <p className="mb-4 font-semibold text-primary">{displayDate(form.entryDate)}・新規入場</p>
          <div className="rounded-xl bg-slate-50 p-4"><p className="break-words text-lg font-bold">{form.primaryCompany}</p><p className="mt-1 break-words text-lg">{form.secondaryCompany}</p><dl className="mt-4 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 text-sm leading-6"><dt className="text-slate-500">人数</dt><dd className="font-semibold">{form.personCount}人</dd><dt className="text-slate-500">国籍</dt><dd>{form.nationalityStatus === "includes_foreign" ? "外国籍を含む" : "日本籍のみ"}</dd><dt className="text-slate-500">氏名</dt><dd className="whitespace-pre-wrap break-words">{form.personNames}</dd><dt className="text-slate-500">備考</dt><dd className="whitespace-pre-wrap break-words">{form.notes || "未入力"}</dd></dl></div>
          <button type="button" className="btn btn-secondary mt-5 w-full" onClick={() => setStep("details")}>内容を編集</button>
        </section><div className="submit-bar">{message && <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{message}</p>}<div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{displayDate(form.entryDate)}・新規入場</p><p className="mt-1 text-sm text-slate-600">{form.secondaryCompany}・{form.personCount}人</p></div><button type="submit" className="btn btn-primary min-h-14 px-5" disabled={busy}>{busy ? "送信中…" : "予定を送信"}</button></div></div></>}

        {step === "success" && <section role="status" className="panel border-emerald-200 bg-emerald-50 p-5"><h2 className="text-lg font-bold text-primary">新規入場予定を送信しました</h2><p className="mt-2 text-base">{displayDate(form.entryDate)}・{form.secondaryCompany}・{form.personCount}人</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" className="btn btn-primary" onClick={() => resetForm(true)}>同じ一次会社で続けて入力</button><button type="button" className="btn btn-secondary" onClick={() => resetForm(false)}>別の一次会社を入力</button></div></section>}

        {step !== "details" && step !== "confirm" && message && <p role="alert" className="px-1 text-sm text-red-700">{message}</p>}
        {step !== "company" && step !== "success" && <p className="px-1 text-sm leading-6 text-slate-500">同じ日付・二次会社の再送信は上書きされます。</p>}
      </form>
    </main>
  </div>;
}
