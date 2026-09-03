"use client";

import { CalendarDays, CheckCircle2, RefreshCw, Send } from "lucide-react";
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
    primaryCount: null,
    currentSubcompanies: [],
    workArea: "",
    workContent: "",
    nextVisitDate: null,
    nextPrimaryCount: null,
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
          <CalendarDays className="text-primary" size={28} aria-hidden="true" />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto grid max-w-2xl gap-4 px-4 py-4">
        {companyError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
            {companyError}
          </div>
        ) : null}

        {submitState.status === "success" ? (
          <section className="compact-panel grid gap-3 border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle2 size={22} aria-hidden="true" />
              <h2 className="font-bold">送信しました</h2>
            </div>
            <p className="text-sm text-green-800">{submitState.dates.length}日分を登録しました。</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" className="btn btn-primary" onClick={continueAnotherDate}>
                <RefreshCw size={18} aria-hidden="true" />
                同じ内容で別日を入力
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                新しく入力
              </button>
            </div>
          </section>
        ) : null}

        {submitState.status === "error" ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
            {submitState.message}
          </div>
        ) : null}

        <section className="panel -mx-4 grid gap-4 px-4 py-4 sm:mx-0 sm:rounded-md sm:border">
          <label className="field">
            <span className="label">日付</span>
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
          <label className="field">
            <span className="label">一次会社</span>
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
              <label className="field">
                <span className="label">一次会社人数</span>
                <input
                  className="input"
                  inputMode="numeric"
                  min={0}
                  type="number"
                  value={form.primaryCount ?? ""}
                  onChange={(event) => patch({ primaryCount: event.target.value === "" ? null : Number(event.target.value) })}
                />
              </label>
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
                  placeholder="10F、10,12,33階、各階"
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
                  placeholder="配管施工"
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
                  <span className="label">一次会社人数</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    min={0}
                    type="number"
                    value={form.nextPrimaryCount ?? ""}
                    onChange={(event) =>
                      patch({ nextPrimaryCount: event.target.value === "" ? null : Number(event.target.value) })
                    }
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
                  placeholder="10F、10,12,33階、各階"
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
                  disabled={form.nextWorkContent === SAME_AS_PREVIOUS}
                />
              </div>
            </>
          )}
        </section>

        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-white/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="mx-auto max-w-2xl">
            <button
              type="submit"
              className="btn btn-primary h-14 w-full text-base"
              disabled={submitState.status === "submitting" || Boolean(companyError)}
            >
              <Send size={20} aria-hidden="true" />
              {submitState.status === "submitting" ? "送信中" : "送信"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
