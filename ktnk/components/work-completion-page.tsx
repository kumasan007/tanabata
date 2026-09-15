"use client";
import { useState } from "react";
import { WorkCompletionForm } from "@/components/work-completion-form";
export function WorkCompletionPage({ companies, initialCompany }: { companies: string[]; initialCompany: string }) {
  const [company, setCompany] = useState(initialCompany);
  return <main className="mx-auto max-w-xl px-4 py-6"><h1 className="mb-4 text-xl font-bold">作業終了報告</h1><div className="panel grid min-w-0 gap-4 p-4"><p className="text-sm text-slate-600">会社単位で作業が終了したら送信してください。</p><label className="grid gap-1 font-semibold">会社名<select className="input" disabled={companies.length === 0} value={company} onChange={(event) => setCompany(event.target.value)}><option value="">選択してください</option>{companies.map((name) => <option key={name}>{name}</option>)}</select></label>{companies.length === 0 && <p className="text-sm text-slate-600">本日の作業予定はありません。</p>}{company && <WorkCompletionForm key={company} primaryCompany={company} automaticDate />}</div></main>;
}
