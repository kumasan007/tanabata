"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompanyMaster, NewEntrantRecord } from "@/lib/types";
import { addDays, parseLocalDate, toDateString } from "@/lib/utils";

type Step = "company" | "date" | "details" | "confirm" | "success";
type EntrantForm = { entryDate: string; primaryCompany: string; secondaryCompany: string; personCount: number | null; personNames: string; notes: string };

function displayDate(value: string) {
  const date = parseLocalDate(value);
  return date ? new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(date) : "日付を選択";
}

function SectionHeading({ title }: { title: string }) {
  return <h2 className="mb-5 text-lg font-bold text-slate-900">{title}</h2>;
}

export function NewEntrantForm({ today }: { today: string }) {
  const [master, setMaster] = useState<CompanyMaster | null>(null);
  const [records, setRecords] = useState<NewEntrantRecord[]>([]);
  const [form, setForm] = useState<EntrantForm>({ entryDate: today, primaryCompany: "", secondaryCompany: "", personCount: null, personNames: "", notes: "" });
  const [step, setStep] = useState<Step>("company");
  const [customDate, setCustomDate] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const to = toDateString(addDays(parseLocalDate(today)!, 30));
  const secondaryOptions = useMemo(() => master?.secondariesByPrimary[form.primaryCompany] ?? [], [master, form.primaryCompany]);
  const dateOptions = useMemo(() => [
    { label: "今日", date: today },
    { label: "明日", date: toDateString(addDays(parseLocalDate(today)!, 1)) },
    { label: "明後日", date: toDateString(addDays(parseLocalDate(today)!, 2)) },
  ], [today]);

  async function refresh() {
    const response = await fetch(`/api/new-entrants?from=${today}&to=${to}`, { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setRecords(body.records ?? []);
  }

  useEffect(() => { void Promise.all([
    fetch("/api/companies").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(); setMaster(body); }),
    refresh(),
  ]).catch(() => setMessage("データを読み込めませんでした。")); }, []);

  function chooseCompany(company: string) {
    setForm((current) => ({ ...current, primaryCompany: company, secondaryCompany: "" }));
    setMessage("");
    if (company) setStep("date");
  }

  function chooseDate(date: string) {
    setForm((current) => ({ ...current, entryDate: date }));
    setMessage("");
    if (date) setStep("details");
  }

  function showConfirmation() {
    if (!form.secondaryCompany.trim()) { setMessage("新規入場する二次会社を入力してください。"); return; }
    if (form.personCount == null || form.personCount < 1) { setMessage("新規入場者を1人以上入力してください。"); return; }
    setMessage("");
    setStep("confirm");
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
      await refresh();
      setStep("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }

  function resetForm(keepCompany = false) {
    setForm({ entryDate: today, primaryCompany: keepCompany ? form.primaryCompany : "", secondaryCompany: "", personCount: null, personNames: "", notes: "" });
    setCustomDate(false); setMessage(""); setStep(keepCompany ? "date" : "company");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    if (!confirm("この新規入場予定を削除しますか？")) return;
    const response = await fetch(`/api/new-entrants?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) { setMessage("削除できませんでした。"); return; }
    await refresh();
  }

  function goBack() {
    setMessage("");
    if (step === "date") setStep("company");
    if (step === "details") setStep("date");
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

        {step === "date" && <section className="panel p-5 sm:p-6">
          <SectionHeading title="入場日を選んでください" />
          <div className="grid grid-cols-3 gap-2">{dateOptions.map((option) => <button key={option.label} type="button" className="status-option flex-col gap-1 px-2" aria-pressed={!customDate && form.entryDate === option.date} onClick={() => { setCustomDate(false); chooseDate(option.date); }}><span>{option.label}</span><span className="text-sm font-normal">{option.date.slice(5).replace("-", "/")}</span></button>)}</div>
          <button type="button" className="btn btn-secondary mt-3 w-full" aria-expanded={customDate} onClick={() => setCustomDate(true)}>任意の日付を選ぶ</button>
          {customDate && <div className="mt-3 space-y-3"><label className="field"><span className="label">入場日</span><input autoFocus className="input" type="date" value={form.entryDate} onChange={(event) => setForm({ ...form, entryDate: event.target.value })} /></label><button type="button" className="btn btn-primary w-full" disabled={!parseLocalDate(form.entryDate)} onClick={() => chooseDate(form.entryDate)}>次へ</button></div>}
        </section>}

        {step === "details" && <section className="panel p-5 sm:p-6">
          <SectionHeading title="新規入場者を入力してください" />
          <div className="grid gap-5">
            <label className="field"><span className="label">二次会社<span className="required-mark">必須</span></span><input autoFocus className="input" required list="secondary-company-options" value={form.secondaryCompany} onChange={(e) => setForm({ ...form, secondaryCompany: e.target.value })} placeholder="選択または会社名を入力" /><datalist id="secondary-company-options">{secondaryOptions.map((company) => <option key={company} value={company} />)}</datalist><span className="text-sm leading-6 text-slate-500">未登録の会社名は、送信時にこの一次会社の二次会社へ追加されます。</span></label>
            <label className="field"><span className="label">初めて入る人数<span className="required-mark">必須</span></span><div className="relative"><input className="input pr-10 tabular-nums" type="number" inputMode="numeric" required min={1} step={1} value={form.personCount ?? ""} placeholder="1" onChange={(e) => setForm({ ...form, personCount: e.target.value === "" ? null : Math.max(1, Number(e.target.value)) })} /><span className="pointer-events-none absolute right-4 top-4 text-sm text-slate-600">人</span></div></label>
            <label className="field"><span className="label">氏名<span className="ml-2 text-sm font-normal text-slate-600">任意</span></span><textarea className="textarea" rows={3} value={form.personNames} onChange={(e) => setForm({ ...form, personNames: e.target.value })} placeholder="複数の場合は改行して入力" /></label>
            <label className="field"><span className="label">備考<span className="ml-2 text-sm font-normal text-slate-600">任意</span></span><textarea className="textarea" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="連絡事項や注意点など" /></label>
          </div>
          {message && <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{message}</p>}
          <button type="button" className="btn btn-primary mt-5 w-full" onClick={showConfirmation}>次へ</button>
        </section>}

        {step === "confirm" && <><section className="panel p-5 sm:p-6">
          <SectionHeading title="この内容で送信します" />
          <p className="mb-4 font-semibold text-primary">{displayDate(form.entryDate)}・新規入場</p>
          <div className="rounded-xl bg-slate-50 p-4"><p className="break-words text-lg font-bold">{form.primaryCompany}</p><p className="mt-1 break-words text-lg">{form.secondaryCompany}</p><dl className="mt-4 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 text-sm leading-6"><dt className="text-slate-500">人数</dt><dd className="font-semibold">{form.personCount}人</dd><dt className="text-slate-500">氏名</dt><dd className="whitespace-pre-wrap break-words">{form.personNames || "未入力"}</dd><dt className="text-slate-500">備考</dt><dd className="whitespace-pre-wrap break-words">{form.notes || "未入力"}</dd></dl></div>
          <button type="button" className="btn btn-secondary mt-5 w-full" onClick={() => setStep("details")}>内容を編集</button>
        </section><div className="submit-bar">{message && <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{message}</p>}<div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{displayDate(form.entryDate)}・新規入場</p><p className="mt-1 text-sm text-slate-600">{form.secondaryCompany}・{form.personCount}人</p></div><button type="submit" className="btn btn-primary min-h-14 px-5" disabled={busy}>{busy ? "送信中…" : "予定を送信"}</button></div></div></>}

        {step === "success" && <section role="status" className="panel border-emerald-200 bg-emerald-50 p-5"><h2 className="text-lg font-bold text-primary">新規入場予定を送信しました</h2><p className="mt-2 text-base">{displayDate(form.entryDate)}・{form.secondaryCompany}・{form.personCount}人</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" className="btn btn-primary" onClick={() => resetForm(true)}>同じ一次会社で続けて入力</button><button type="button" className="btn btn-secondary" onClick={() => resetForm(false)}>別の一次会社を入力</button></div></section>}

        <details className="panel p-4" open={summaryOpen} onToggle={(event) => setSummaryOpen(event.currentTarget.open)}><summary className="cursor-pointer text-base font-semibold">記入済みの新規入場予定を見る</summary><div className="mt-3 divide-y divide-border text-sm leading-6">{records.length === 0 ? <p className="py-3 text-slate-500">今後30日間の登録はありません。</p> : records.map((record) => <div key={record.id} className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{displayDate(record.entry_date)}・{record.person_count}人</p><p className="break-words">{record.primary_company} → {record.secondary_company}</p>{record.person_names && <p className="whitespace-pre-wrap text-slate-600">{record.person_names}</p>}{record.notes && <p className="break-words text-slate-500">備考：{record.notes}</p>}</div><button type="button" className="btn btn-secondary text-red-700" onClick={() => void remove(record.id)}>削除</button></div></div>)}</div></details>
        {step !== "details" && step !== "confirm" && message && <p role="alert" className="px-1 text-sm text-red-700">{message}</p>}
        {step !== "company" && step !== "success" && <p className="px-1 text-sm leading-6 text-slate-500">同じ日付・二次会社の再送信は上書きされます。</p>}
      </form>
    </main>
  </div>;
}
