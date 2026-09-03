"use client";

import { CheckCircle2, LogIn, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SubcompanyFields } from "@/components/subcompany-fields";
import type { CompanyMaster, ScheduleSubmitInput, ScheduleSummary } from "@/lib/types";
import { addDays, parseLocalDate, toDateString, tomorrowString } from "@/lib/utils";

const SAME_AS_PREVIOUS = "前回と同じ";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; dates: string[] }
  | { status: "error"; message: string };

const emptyForm = (): ScheduleSubmitInput => {
  const tomorrow = tomorrowString();
  return {
    startDate: tomorrow,
    endDate: tomorrow,
    excludeWeekends: false,
    status: "work",
    primaryCompany: "",
    primaryCount: 0,
    currentSubcompanies: [],
    workArea: "",
    workContent: "",
    nextVisitDate: null,
    nextPrimaryCount: 0,
    nextSubcompanies: [],
    nextWorkArea: "",
    nextWorkContent: "",
  };
};

export function ScheduleForm() {
  const [form, setForm] = useState<ScheduleSubmitInput>(() => emptyForm());
  const [companyMaster, setCompanyMaster] = useState<CompanyMaster | null>(null);
  const [companyError, setCompanyError] = useState("");
  const [summaries, setSummaries] = useState<ScheduleSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });

  const secondaryOptions = useMemo(() => {
    if (!companyMaster || !form.primaryCompany) return [];
    return companyMaster.secondariesByPrimary[form.primaryCompany] ?? [];
  }, [companyMaster, form.primaryCompany]);

  const primaryTrades = useMemo(() => {
    if (!companyMaster || !form.primaryCompany) return [];
    return companyMaster.tradesByPrimary?.[form.primaryCompany] ?? [];
  }, [companyMaster, form.primaryCompany]);

  useEffect(() => {
    let active = true;

    fetch("/api/companies")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "会社一覧を取得できませんでした。");
        if (active) setCompanyMaster(body);
      })
      .catch((error) => {
        if (active) setCompanyError(error instanceof Error ? error.message : "会社一覧を取得できませんでした。");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!form.primaryCompany) {
      setSummaries([]);
      setSummaryLoading(false);
      return;
    }

    setSummaryLoading(true);
    fetch(`/api/schedules/summary?primaryCompany=${encodeURIComponent(form.primaryCompany)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "記入済み情報を取得できませんでした。");
        if (active) setSummaries(body.summaries ?? []);
      })
      .catch(() => {
        if (active) setSummaries([]);
      })
      .finally(() => {
        if (active) setSummaryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [form.primaryCompany]);

  function patch(patchValue: Partial<ScheduleSubmitInput>) {
    setForm((current) => ({ ...current, ...patchValue }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = validateBeforeSubmit();
    if (validationMessage) {
      setSubmitState({ status: "error", message: validationMessage });
      return;
    }

    setSubmitState({ status: "submitting" });

    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          endDate: form.startDate,
          excludeWeekends: false,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "送信に失敗しました。");
      }

      setSubmitState({ status: "success", dates: body.dates ?? [] });
    } catch (error) {
      setSubmitState({ status: "error", message: error instanceof Error ? error.message : "送信に失敗しました。" });
    }
  }

  function validateBeforeSubmit() {
    const activeSubcompanies = form.status === "work" ? form.currentSubcompanies : form.nextSubcompanies;
    const hasSecondaryCountWithoutCompany = activeSubcompanies.some(
      (row) => (row.workerCount ?? 0) > 0 && row.secondaryCompany.trim() === "",
    );

    if (hasSecondaryCountWithoutCompany) {
      return "二次会社人数を入力する場合は、二次会社を選択してください。";
    }

    if (form.status !== "work") return "";

    if (form.primaryCount === null) {
      return "一次会社人数を入力してください。";
    }

    const secondaryTotal = form.currentSubcompanies.reduce((sum, row) => sum + (row.workerCount ?? 0), 0);
    if (form.primaryCount === 0 && secondaryTotal < 1) {
      return "一次会社人数が0人の場合は、二次会社人数の合計を1人以上にしてください。";
    }

    return "";
  }

  function continueAnotherDate() {
    const base = parseLocalDate(form.startDate) ?? new Date();
    const nextDate = toDateString(addDays(base, 1));
    patch({ startDate: nextDate, endDate: nextDate });
    setSubmitState({ status: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setForm(emptyForm());
    setSubmitState({ status: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-28">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-normal text-slate-950">作業予定入力</h1>
          </div>
          <Link className="btn btn-secondary h-11 px-3 text-sm" href="/admin">
            <LogIn size={17} aria-hidden="true" />
            管理
          </Link>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto grid max-w-2xl gap-4 px-4 py-4">
        {companyError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
            {companyError}
          </div>
        ) : null}

        <section className="panel -mx-4 grid gap-4 px-4 py-4 sm:mx-0 sm:rounded-md sm:border">
          <label className="field">
            <span className="label">
              日付
              <span className="required-mark" aria-label="必須">*</span>
            </span>
            <input
              className="input"
              type="date"
              value={form.startDate}
              onChange={(event) => patch({ startDate: event.target.value, endDate: event.target.value })}
              required
            />
          </label>
        </section>

        <section className="panel -mx-4 grid gap-3 px-4 py-4 sm:mx-0 sm:rounded-md sm:border">
          <h2 className="text-base font-bold text-slate-900">予定</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={form.status === "work" ? "btn btn-primary h-14" : "btn btn-secondary h-14"}
              onClick={() => patch({ status: "work" })}
            >
              作業あり
            </button>
            <button
              type="button"
              className={form.status === "no_work" ? "btn btn-primary h-14" : "btn btn-secondary h-14"}
              onClick={() => patch({ status: "no_work" })}
            >
              作業なし
            </button>
          </div>
        </section>

        <section className="panel -mx-4 grid gap-4 px-4 py-4 sm:mx-0 sm:rounded-md sm:border">
          <div className={form.status === "work" ? "grid gap-2 sm:grid-cols-[1fr_120px]" : "grid gap-2"}>
            <label className="field">
              <span className="label">
                一次会社
                <span className="required-mark" aria-label="必須">*</span>
              </span>
              <select
                className="input"
                value={form.primaryCompany}
                onChange={(event) =>
                  patch({
                    primaryCompany: event.target.value,
                    currentSubcompanies: [],
                    nextSubcompanies: [],
                  })
                }
                required
              >
                <option value="">選択</option>
                {companyMaster?.primaryCompanies.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
            </label>

            {form.status === "work" ? (
              <label className="field">
                <span className="label">
                  人数
                  <span className="required-mark" aria-label="必須">*</span>
                </span>
                <input
                  className="input px-2 text-right"
                  inputMode="numeric"
                  min={0}
                  type="number"
                  value={form.primaryCount ?? 0}
                  onChange={(event) => patch({ primaryCount: event.target.value === "" ? 0 : Number(event.target.value) })}
                  required
                />
              </label>
            ) : null}
          </div>

          {primaryTrades.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {primaryTrades.map((trade) => (
                <span key={trade} className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">
                  {trade}
                </span>
              ))}
            </div>
          ) : null}

          {form.primaryCompany ? (
            <section className="rounded-md bg-slate-100 px-3 py-3">
              <div className="mb-2 text-xs font-bold text-slate-600">記入済み 今日から7日分</div>
              {summaryLoading ? (
                <p className="text-xs text-slate-500">確認中</p>
              ) : summaries.length === 0 ? (
                <p className="text-xs text-slate-500">今日以降は記入なし</p>
              ) : (
                <div className="grid gap-2">
                  {summaries.map((summary) => {
                    const area = summary.status === "作業あり" ? summary.workArea : summary.nextWorkArea;
                    const content = summary.status === "作業あり" ? summary.workContent : summary.nextWorkContent;
                    return (
                      <div key={summary.id} className="rounded bg-white px-2 py-2 text-xs text-slate-700">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-slate-900">
                          <span>{summary.workDate}</span>
                          <span>{summary.status}</span>
                          {summary.nextVisitDate ? <span>来場予定 {summary.nextVisitDate}</span> : null}
                        </div>
                        {summary.companyText ? <div className="mt-1">{summary.companyText}</div> : null}
                        {area || content ? (
                          <div className="mt-1 text-slate-600">
                            {[area, content].filter(Boolean).join(" / ")}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {form.status === "work" ? (
            <>
              <p className="text-xs font-semibold text-slate-500">一次人数が0人の場合は、二次会社人数の合計を1人以上にしてください。</p>
              <SubcompanyFields
                title="二次会社"
                rows={form.currentSubcompanies}
                options={secondaryOptions}
                onChange={(rows) => patch({ currentSubcompanies: rows })}
              />
              <div className="field">
                <span className="label">作業エリア</span>
                <label className="flex min-h-11 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-800">
                  <input
                    className="h-5 w-5 accent-sky-700"
                    type="checkbox"
                    checked={form.workArea === SAME_AS_PREVIOUS}
                    onChange={(event) => patch({ workArea: event.target.checked ? SAME_AS_PREVIOUS : "" })}
                  />
                  前回と同じ
                </label>
                <input
                  className="input"
                  value={form.workArea}
                  onChange={(event) => patch({ workArea: event.target.value })}
                  placeholder="10階、12階"
                  disabled={form.workArea === SAME_AS_PREVIOUS}
                />
              </div>
              <div className="field">
                <span className="label">作業内容</span>
                <label className="flex min-h-11 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-800">
                  <input
                    className="h-5 w-5 accent-sky-700"
                    type="checkbox"
                    checked={form.workContent === SAME_AS_PREVIOUS}
                    onChange={(event) => patch({ workContent: event.target.checked ? SAME_AS_PREVIOUS : "" })}
                  />
                  前回と同じ
                </label>
                <textarea
                  className="textarea"
                  value={form.workContent}
                  onChange={(event) => patch({ workContent: event.target.value })}
                  placeholder="配管つり込み作業"
                  disabled={form.workContent === SAME_AS_PREVIOUS}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="field">
                  <span className="label">来場予定日</span>
                  <input
                    className="input"
                    type="date"
                    value={form.nextVisitDate ?? ""}
                    onChange={(event) => patch({ nextVisitDate: event.target.value || null })}
                  />
                </label>
                <label className="field">
                  <span className="label">
                    一次会社人数
                    <span className="required-mark" aria-label="必須">*</span>
                  </span>
                  <input
                    className="input"
                    inputMode="numeric"
                    min={0}
                    type="number"
                    value={form.nextPrimaryCount ?? 0}
                    onChange={(event) =>
                      patch({ nextPrimaryCount: event.target.value === "" ? 0 : Number(event.target.value) })
                    }
                    required
                  />
                </label>
              </div>
              <SubcompanyFields
                title="二次会社"
                rows={form.nextSubcompanies}
                options={secondaryOptions}
                onChange={(rows) => patch({ nextSubcompanies: rows })}
              />
              <div className="field">
                <span className="label">作業エリア</span>
                <label className="flex min-h-11 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-800">
                  <input
                    className="h-5 w-5 accent-sky-700"
                    type="checkbox"
                    checked={form.nextWorkArea === SAME_AS_PREVIOUS}
                    onChange={(event) => patch({ nextWorkArea: event.target.checked ? SAME_AS_PREVIOUS : "" })}
                  />
                  前回と同じ
                </label>
                <input
                  className="input"
                  value={form.nextWorkArea}
                  onChange={(event) => patch({ nextWorkArea: event.target.value })}
                  placeholder="10階、12階"
                  disabled={form.nextWorkArea === SAME_AS_PREVIOUS}
                />
              </div>
              <div className="field">
                <span className="label">作業内容</span>
                <label className="flex min-h-11 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-800">
                  <input
                    className="h-5 w-5 accent-sky-700"
                    type="checkbox"
                    checked={form.nextWorkContent === SAME_AS_PREVIOUS}
                    onChange={(event) => patch({ nextWorkContent: event.target.checked ? SAME_AS_PREVIOUS : "" })}
                  />
                  前回と同じ
                </label>
                <textarea
                  className="textarea"
                  value={form.nextWorkContent}
                  onChange={(event) => patch({ nextWorkContent: event.target.value })}
                  placeholder="配管つり込み作業"
                  disabled={form.nextWorkContent === SAME_AS_PREVIOUS}
                />
              </div>
            </>
          )}
        </section>

        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-white/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="mx-auto max-w-2xl">
            {submitState.status === "success" ? (
              <div className="grid gap-3 rounded-md border border-green-200 bg-green-50 p-3">
                <div className="flex items-center gap-2 font-bold text-green-800">
                  <CheckCircle2 size={22} aria-hidden="true" />
                  送信しました
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button type="button" className="btn btn-primary h-12" onClick={continueAnotherDate}>
                    <RefreshCw size={18} aria-hidden="true" />
                    同じ内容で別日を入力
                  </button>
                  <button type="button" className="btn btn-secondary h-12" onClick={resetForm}>
                    新しく入力
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                {submitState.status === "error" ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                    {submitState.message}
                  </div>
                ) : null}
                <button
                  type="submit"
                  className="btn btn-primary h-14 w-full text-base"
                  disabled={submitState.status === "submitting" || Boolean(companyError)}
                >
                  <Send size={20} aria-hidden="true" />
                  {submitState.status === "submitting" ? "送信中" : "送信"}
                </button>
              </div>
            )}
          </div>
        </div>
      </form>
    </main>
  );
}
