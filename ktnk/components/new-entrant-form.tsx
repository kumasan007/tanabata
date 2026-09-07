"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CompanyMaster, NewEntrantRecord } from "@/lib/types";
import { addDays, parseLocalDate, toDateString } from "@/lib/utils";

export function NewEntrantForm({ today }: { today: string }) {
  const [master, setMaster] = useState<CompanyMaster | null>(null);
  const [records, setRecords] = useState<NewEntrantRecord[]>([]);
  const [form, setForm] = useState({ entryDate: today, primaryCompany: "", secondaryCompany: "", isNewCompany: false, personCount: null as number | null, personNames: "", notes: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const to = toDateString(addDays(parseLocalDate(today)!, 30));
  const secondaryOptions = useMemo(() => master?.secondariesByPrimary[form.primaryCompany] ?? [], [master, form.primaryCompany]);

  async function refresh() {
    const response = await fetch(`/api/new-entrants?from=${today}&to=${to}`, { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setRecords(body.records ?? []);
  }
  useEffect(() => { void Promise.all([
    fetch("/api/companies").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(); setMaster(body); }),
    refresh(),
  ]).catch(() => setMessage("データを読み込めませんでした。")); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/new-entrants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, personCount: form.personCount ?? 0 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "保存できませんでした。");
      setMessage("新規入場予定を保存しました。同じ日・会社の再登録は上書きされます。");
      setForm((current) => ({ ...current, secondaryCompany: "", isNewCompany: false, personCount: null, personNames: "", notes: "" }));
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("この新規入場予定を削除しますか？")) return;
    await fetch(`/api/new-entrants?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  }

  return <div className="min-h-screen pb-10">
    <header className="border-b border-border bg-white"><div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4"><Link href="/" className="text-xl font-bold">新規入場入力</Link><Link href="/calendar" className="btn btn-secondary">カレンダー</Link></div></header>
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      <form onSubmit={submit} className="panel grid gap-4 p-5">
        <label className="field"><span className="label">入場日 *</span><input className="input" type="date" required value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} /></label>
        <label className="field"><span className="label">一次会社 *</span><select className="input" required value={form.primaryCompany} onChange={(e) => setForm({ ...form, primaryCompany: e.target.value, secondaryCompany: "" })}><option value="">選択してください</option>{master?.primaryCompanies.map((company) => <option key={company}>{company}</option>)}</select></label>
        <label className="field"><span className="label">新規入場する会社（二次会社） *</span><input className="input" required list="secondary-company-options" value={form.secondaryCompany} onChange={(e) => setForm({ ...form, secondaryCompany: e.target.value })} placeholder="選択または会社名を入力" /><datalist id="secondary-company-options">{secondaryOptions.map((company) => <option key={company} value={company} />)}</datalist><span className="text-sm text-slate-500">未登録の新しい会社名も直接入力できます。</span></label>
        <label className="previous-toggle"><input type="checkbox" checked={form.isNewCompany} onChange={(e) => setForm({ ...form, isNewCompany: e.target.checked })} />この会社自体が現場へ初入場</label>
        <label className="field"><span className="label">初めて入る人数</span><div className="relative"><input className="input pr-10" type="number" inputMode="numeric" min={0} step={1} value={form.personCount ?? ""} onChange={(e) => setForm({ ...form, personCount: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} /><span className="pointer-events-none absolute right-4 top-4 text-sm text-slate-500">人</span></div></label>
        <label className="field"><span className="label">氏名（任意）</span><textarea className="textarea" value={form.personNames} onChange={(e) => setForm({ ...form, personNames: e.target.value })} placeholder="複数の場合は改行して入力" /></label>
        <label className="field"><span className="label">備考（任意）</span><textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "保存中…" : "新規入場予定を保存"}</button>
      </form>
      <section className="panel p-5"><h2 className="font-bold">今後30日間の登録</h2><div className="mt-3 divide-y divide-border">{records.length === 0 ? <p className="py-3 text-slate-500">登録はありません。</p> : records.map((record) => <div key={record.id} className="py-3"><div className="flex justify-between gap-3"><div><p className="font-semibold">{record.entry_date}　{record.secondary_company}</p><p className="text-sm text-slate-600">{record.primary_company} / {record.is_new_company ? "新規会社 / " : ""}{record.person_count}人</p>{record.person_names && <p className="whitespace-pre-wrap text-sm">{record.person_names}</p>}{record.notes && <p className="text-sm text-slate-500">備考：{record.notes}</p>}</div><button type="button" className="btn btn-secondary self-start text-red-700" onClick={() => void remove(record.id)}>削除</button></div></div>)}</div></section>
    </main>
  </div>;
}
