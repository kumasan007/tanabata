"use client";
import { useState } from "react";
import { WorkCompletionForm } from "@/components/work-completion-form";
export function WorkCompletionPage({ companies, initialCompany }: { companies: string[]; initialCompany: string }) {
  const [company, setCompany] = useState(initialCompany);
  return <main className="mx-auto max-w-2xl px-3 py-5 sm:px-4"><h1 className="page-title">作業終了報告</h1><div className="panel grid min-w-0 gap-4 p-4 sm:p-6"><p className="text-sm text-slate-600">本日の作業が終了したら、会社ごとに報告してください。</p><label className="field"><span className="label">一次会社</span><select className="input" disabled={companies.length === 0} value={company} onChange={(event) => setCompany(event.target.value)}><option value="">一次会社を選択してください</option>{companies.map((name) => <option key={name}>{name}</option>)}</select></label>{companies.length === 0 && <p className="text-slate-600">本日の作業予定はありません。</p>}{company && <WorkCompletionForm key={company} primaryCompany={company} automaticDate />}</div></main>;
}
