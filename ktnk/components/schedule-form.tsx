"use client";

import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SubcompanyFields } from "@/components/subcompany-fields";
import type {
  CompanyMaster,
  PreviousSchedule,
  ScheduleSubmitInput,
  ScheduleSummary,
} from "@/lib/types";
import { addDays, parseLocalDate, toDateString } from "@/lib/utils";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; dates: string[] }
  | { status: "error"; message: string };
const emptyForm = (date: string): ScheduleSubmitInput => ({
  startDate: date,
  endDate: date,
  excludeWeekends: false,
  status: "work",
  primaryCompany: "",
  primaryCount: 0,
  usePreviousPrimaryCount: false,
  currentSubcompanies: [],
  workArea: "",
  workContent: "",
  nextVisitDate: null,
  nextPrimaryCount: 0,
  usePreviousNextPrimaryCount: false,
  nextSubcompanies: [],
  nextWorkArea: "",
  nextWorkContent: "",
});

function displayDate(value: string) {
  const date = parseLocalDate(value);
  return date
    ? new Intl.DateTimeFormat("ja-JP", {
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(date)
    : "日付を選択";
}

function SectionHeading({ title }: { title: string }) {
  return <h2 className="mb-5 text-lg font-bold text-slate-900">{title}</h2>;
}

function CountField({
  value,
  previous,
  previousValue,
  onChange,
  onPreviousChange,
  required = true,
}: {
  value: number | null;
  previous: boolean;
  previousValue: number | null | undefined;
  onChange: (value: number | null) => void;
  onPreviousChange: (value: boolean) => void;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        <span className="sm:hidden">人数</span>
        <span className="hidden sm:inline">一次会社人数</span>
        {required ? (
          <span className="required-mark">*</span>
        ) : (
          <span className="ml-2 text-sm font-normal text-slate-600">任意</span>
        )}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-label="一次会社人数"
          className="input pr-10 tabular-nums"
          inputMode="numeric"
          type="number"
          min={0}
          step={1}
          placeholder="0"
          value={value ?? 0}
          onChange={(event) =>
            onChange(Math.max(0, Number(event.target.value) || 0))
          }
          required={required}
        />
        <span className="pointer-events-none absolute right-4 top-4 text-sm text-slate-600">
          人
        </span>
      </div>
      <CopyButton
        label="前回の一次会社人数をコピー"
        copied={previous}
        disabled={previousValue == null}
        onCopy={() => onPreviousChange(true)}
      />
    </div>
  );
}

function WorkField({
  label,
  value,
  placeholder,
  multiline = false,
  previousValue,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  previousValue: string | null | undefined;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [same, setSame] = useState(false);
  const inputProps = {
    id,
    value,
    placeholder,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setSame(false);
      onChange(event.target.value);
    },
  };
  return (
    <div className="field">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <label className="label" htmlFor={id}>
          {label}
          <span className="ml-2 text-sm font-normal text-slate-600">任意</span>
        </label>
        <CopyButton
          label={`${label}を前回からコピー`}
          copied={same}
          disabled={previousValue == null || previousValue.trim() === ""}
          onCopy={() => {
            if (previousValue != null) {
              setSame(true);
              onChange(previousValue);
            }
          }}
        />
      </div>
      {multiline ? (
        <textarea className="textarea" rows={3} {...inputProps} />
      ) : (
        <input className="input" {...inputProps} />
      )}
    </div>
  );
}

function SchedulePreview({
  schedule,
  primaryCompany,
  peopleOnly = false,
}: {
  schedule: PreviousSchedule;
  primaryCompany: string;
  peopleOnly?: boolean;
}) {
  const companies = [
    {
      secondaryCompany: primaryCompany,
      workerCount: schedule.primaryCount ?? 0,
    },
    ...schedule.subcompanies.filter((row) => row.secondaryCompany),
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-border text-base">
      <table className="w-full table-fixed text-left">
        <caption className="sr-only">会社ごとの人数</caption>
        <thead className="bg-slate-50 text-sm text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              会社名
            </th>
            <th scope="col" className="w-20 px-4 py-2 text-right font-medium">
              人数
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {companies.map((row, index) => (
            <tr key={index}>
              <td className="break-words px-4 py-2.5">
                {row.secondaryCompany}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                {row.workerCount ?? 0}
                <span className="ml-1 text-sm font-normal text-slate-500">
                  人
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border bg-slate-50">
          <tr>
            <th scope="row" className="px-4 py-2.5 text-sm font-medium">
              合計
            </th>
            <td className="px-4 py-2.5 text-right font-bold tabular-nums">
              {companies.reduce(
                (total, row) => total + (row.workerCount ?? 0),
                0,
              )}
              <span className="ml-1 text-sm font-normal text-slate-500">
                人
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
      {!peopleOnly && (
        <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-3 border-t border-border px-4 py-3 text-sm leading-6">
          <dt className="text-slate-500">作業エリア</dt>
          <dd className="whitespace-pre-wrap break-words">
            {schedule.workArea || "未入力"}
          </dd>
          <dt className="text-slate-500">作業内容</dt>
          <dd className="whitespace-pre-wrap break-words">
            {schedule.workContent || "未入力"}
          </dd>
        </dl>
      )}
    </div>
  );
}

export function ScheduleForm({
  initialDate,
  today,
}: {
  initialDate: string;
  today: string;
}) {
  const [form, setForm] = useState<ScheduleSubmitInput>(() => emptyForm(""));
  const [companyMaster, setCompanyMaster] = useState<CompanyMaster | null>(
    null,
  );
  const [companyError, setCompanyError] = useState("");
  const [companyRetry, setCompanyRetry] = useState(0);
  const [choosingCompany, setChoosingCompany] = useState(true);
  const [choice, setChoice] = useState<"same" | "new" | null>(null);
  const [statusChosen, setStatusChosen] = useState(false);
  const [customDate, setCustomDate] = useState(false);
  const [step, setStep] = useState<
    "date" | "status" | "copy" | "visit" | "edit" | "confirm" | "copyContent"
  >("date");
  const [visitChoice, setVisitChoice] = useState<"date" | "unknown" | null>(
    null,
  );
  const [editorPart, setEditorPart] = useState<"people" | "content">("people");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step, choosingCompany, editorPart]);
  const [copyVersion, setCopyVersion] = useState(0);
  const [sourceRetry, setSourceRetry] = useState(0);
  const [sourceResult, setSourceResult] = useState<{
    company: string;
    source: PreviousSchedule | null;
    today: string;
    error: string;
  } | null>(null);
  const [previousResult, setPreviousResult] = useState<{
    key: string;
    previous: PreviousSchedule | null;
    error: string;
  } | null>(null);
  const [previousRetry, setPreviousRetry] = useState(0);
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
  });
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaries, setSummaries] = useState<ScheduleSummary[] | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [summaryVersion, setSummaryVersion] = useState(0);
  const submitting = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const source =
    sourceResult?.company === form.primaryCompany ? sourceResult.source : null;
  const sourceLoading = Boolean(
    form.primaryCompany && sourceResult?.company !== form.primaryCompany,
  );
  const sourceError =
    sourceResult?.company === form.primaryCompany ? sourceResult.error : "";
  const sourceIsToday = source?.workDate === sourceResult?.today;
  const validDate = Boolean(parseLocalDate(form.startDate));
  const ready = Boolean(
    form.primaryCompany &&
    choice &&
    validDate &&
    statusChosen &&
    !choosingCompany &&
    step === "confirm",
  );
  const showEditor = !choosingCompany && step === "edit";
  const isWork = form.status === "work";
  const busy = submitState.status === "submitting";
  const activeRows = isWork ? form.currentSubcompanies : form.nextSubcompanies;
  const activeCount = isWork ? form.primaryCount : form.nextPrimaryCount;
  const totalCount =
    (activeCount ?? 0) +
    activeRows.reduce((sum, row) => sum + (row.workerCount ?? 0), 0);
  const area = isWork ? form.workArea : form.nextWorkArea;
  const content = isWork ? form.workContent : form.nextWorkContent;
  const secondaryOptions = useMemo(
    () => companyMaster?.secondariesByPrimary[form.primaryCompany] ?? [],
    [companyMaster, form.primaryCompany],
  );
  const previousKey = JSON.stringify([
    form.primaryCompany,
    form.status,
    form.startDate,
  ]);
  const previous =
    previousResult?.key === previousKey ? previousResult.previous : null;
  const previousCounts = new Map(
    previous?.subcompanies.map((row) => [
      row.secondaryCompany,
      row.workerCount,
    ]) ?? [],
  );
  const dateOptions = [
    { label: "今日", date: today },
    { label: "明日", date: initialDate },
    {
      label: "明後日",
      date: toDateString(addDays(parseLocalDate(initialDate)!, 1)),
    },
  ];

  useEffect(() => {
    const controller = new AbortController();
    setCompanyError("");
    fetch("/api/companies", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "会社一覧を取得できませんでした。");
        if (!controller.signal.aborted) setCompanyMaster(body);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCompanyError("会社一覧を取得できませんでした。");
      });
    return () => controller.abort();
  }, [companyRetry]);

  useEffect(() => {
    if (!form.primaryCompany) return;
    const controller = new AbortController();
    setSourceResult(null);
    fetch(
      "/api/schedules/copy-source?" +
        new URLSearchParams({ primaryCompany: form.primaryCompany }),
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error();
        if (!controller.signal.aborted)
          setSourceResult({
            company: form.primaryCompany,
            source: body.source,
            today: body.today,
            error: "",
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSourceResult({
            company: form.primaryCompany,
            source: null,
            today: "",
            error: "前回の作業を取得できませんでした。",
          });
      });
    return () => controller.abort();
  }, [form.primaryCompany, sourceRetry]);

  useEffect(() => {
    if (!showEditor) return;
    const controller = new AbortController();
    setPreviousResult(null);
    fetch(
      "/api/schedules/previous?" +
        new URLSearchParams({
          primaryCompany: form.primaryCompany,
          status: form.status,
          workDate: form.startDate,
        }),
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error();
        if (!controller.signal.aborted)
          setPreviousResult({
            key: previousKey,
            previous: body.previous,
            error: "",
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setPreviousResult({
            key: previousKey,
            previous: null,
            error: "前回の値を取得できませんでした。",
          });
      });
    return () => controller.abort();
  }, [
    showEditor,
    form.primaryCompany,
    form.status,
    form.startDate,
    previousKey,
    previousRetry,
  ]);

  useEffect(() => {
    if (!summaryOpen || !form.primaryCompany) return;
    const controller = new AbortController();
    setSummaries(null);
    setSummaryError("");
    fetch(
      "/api/schedules/summary?" +
        new URLSearchParams({ primaryCompany: form.primaryCompany }),
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error();
        if (!controller.signal.aborted) setSummaries(body.summaries ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSummaryError("記入済みの予定を取得できませんでした。");
      });
    return () => controller.abort();
  }, [summaryOpen, form.primaryCompany, summaryVersion]);

  useEffect(() => {
    if (submitState.status === "success" || submitState.status === "error")
      resultRef.current?.focus();
  }, [submitState]);

  function patch(value: Partial<ScheduleSubmitInput>) {
    setSubmitState({ status: "idle" });
    setForm((current) => {
      const next = { ...current, ...value };
      if (
        (value.startDate !== undefined &&
          value.startDate !== current.startDate) ||
        (value.status !== undefined && value.status !== current.status)
      ) {
        next.usePreviousPrimaryCount = false;
        next.usePreviousNextPrimaryCount = false;
        next.currentSubcompanies = next.currentSubcompanies.map((row) => ({
          ...row,
          usePreviousWorkerCount: false,
        }));
        next.nextSubcompanies = next.nextSubcompanies.map((row) => ({
          ...row,
          usePreviousWorkerCount: false,
        }));
      }
      return next;
    });
  }
  function selectCompany(company: string) {
    if (company !== form.primaryCompany) {
      setForm({ ...emptyForm(""), primaryCompany: company });
      setChoice(null);
      setStatusChosen(false);
      setStep("date");
      setCustomDate(false);
      setSummaryOpen(false);
      setCopyVersion((v) => v + 1);
      setSubmitState({ status: "idle" });
    }
    setChoosingCompany(false);
  }
  function answer(same: boolean) {
    if (same && !source) return;
    const next = {
      ...emptyForm(form.startDate),
      primaryCompany: form.primaryCompany,
    };
    if (source) {
      next.primaryCount = source.primaryCount ?? 0;
      next.workArea = source.workArea ?? "";
      next.workContent = source.workContent ?? "";
      next.currentSubcompanies = source.subcompanies
        .filter((row) => row.secondaryCompany)
        .map((row) => ({
          ...row,
          workerCount: row.workerCount ?? 0,
          usePreviousWorkerCount: false,
        }));
    }
    setForm(next);
    setChoice(same ? "same" : "new");
    setStatusChosen(true);
    setStep(same ? "copyContent" : "edit");
    setEditorPart("people");
    setCopyVersion((v) => v + 1);
    setSubmitState({ status: "idle" });
  }
  function selectDate(date: string) {
    patch({ startDate: date, endDate: date });
    if (parseLocalDate(date)) setStep("status");
  }
  function resetForm() {
    setForm(emptyForm(""));
    setChoice(null);
    setStatusChosen(false);
    setChoosingCompany(true);
    setStep("date");
    setCustomDate(false);
    setSummaryOpen(false);
    setSubmitState({ status: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || submitting.current) return;
    if (isWork && totalCount < 1) {
      setStep("edit");
      setSubmitState({
        status: "error",
        message: "作業ありの場合は、合計人数を1人以上にしてください。",
      });
      return;
    }
    if (
      activeRows.some(
        (row) => !row.secondaryCompany.trim() && (row.workerCount ?? 0) > 0,
      )
    ) {
      setStep("edit");
      setSubmitState({
        status: "error",
        message: "二次会社を選択してください。",
      });
      return;
    }
    submitting.current = true;
    setSubmitState({ status: "submitting" });
    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          endDate: form.startDate,
          excludeWeekends: false,
          usePreviousPrimaryCount: false,
          usePreviousNextPrimaryCount: false,
          currentSubcompanies: isWork
            ? form.currentSubcompanies.map((row) => ({
                ...row,
                usePreviousWorkerCount: false,
              }))
            : [],
          nextSubcompanies: isWork
            ? []
            : form.nextSubcompanies.map((row) => ({
                ...row,
                usePreviousWorkerCount: false,
              })),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "送信に失敗しました。再度お試しください。",
        );
      setSubmitState({
        status: "success",
        dates: body.dates ?? [form.startDate],
      });
      setSummaryVersion((v) => v + 1);
      setSourceRetry((v) => v + 1);
    } catch (error) {
      setSubmitState({
        status: "error",
        message:
          error instanceof Error ? error.message : "送信に失敗しました。",
      });
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div className="simple-schedule min-h-screen pb-32 sm:pb-8">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900">作業予定入力</h1>
          <Link href="/admin" prefetch={false} className="btn btn-secondary">
            管理画面
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-3 py-5 sm:px-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {!choosingCompany && (
            <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  setSubmitState({ status: "idle" });
                  if (step === "date") setChoosingCompany(true);
                  else if (step === "status") setStep("date");
                  else if (step === "copyContent") {
                    setEditorPart("people");
                    setStep("edit");
                  } else if (step === "copy" || step === "visit") {
                    setChoice(null);
                    setStep("status");
                  } else if (step === "edit" && !isWork) setStep("visit");
                  else if (step === "edit" && editorPart === "content")
                    setEditorPart("people");
                  else {
                    setChoice(null);
                    if (!isWork) setChoice("new");
                    setStep(isWork ? "copy" : "visit");
                  }
                }}
              >
                戻る
              </button>
              <p className="min-w-0 text-right break-words">
                {form.primaryCompany}
                {validDate && (
                  <span className="block">{displayDate(form.startDate)}</span>
                )}
              </p>
            </div>
          )}
          <fieldset disabled={busy} className="grid min-w-0 gap-4">
            <legend className="sr-only">作業予定の入力</legend>
            <section
              className={choosingCompany ? "panel p-5 sm:p-6" : "hidden"}
            >
              {choosingCompany ? (
                <>
                  <SectionHeading title="一次会社を選んでください" />
                  <label className="field">
                    <span className="sr-only">一次会社</span>
                    <select
                      autoFocus
                      className="input"
                      value={form.primaryCompany}
                      disabled={!companyMaster || Boolean(companyError)}
                      onChange={(event) => selectCompany(event.target.value)}
                    >
                      <option value="" disabled>
                        {companyMaster ? "会社を選択" : "読み込み中…"}
                      </option>
                      {companyMaster?.primaryCompanies.map((company) => (
                        <option key={company} value={company}>
                          {company}
                        </option>
                      ))}
                    </select>
                  </label>
                  {form.primaryCompany && (
                    <button
                      type="button"
                      className="btn btn-secondary mt-3"
                      onClick={() => setChoosingCompany(false)}
                    >
                      変更せず戻る
                    </button>
                  )}
                  {companyMaster?.primaryCompanies.length === 0 && (
                    <p className="mt-3 text-base text-slate-600">
                      会社が登録されていません。管理者にご確認ください。
                    </p>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-500">一次会社</p>
                    <p className="mt-1 break-words text-lg font-bold">
                      {form.primaryCompany}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setChoosingCompany(true)}
                  >
                    会社を変更
                  </button>
                </div>
              )}
              {companyError && (
                <div role="alert" className="mt-3 text-red-700">
                  <p>{companyError}</p>
                  <button
                    type="button"
                    className="btn btn-secondary mt-2"
                    onClick={() => setCompanyRetry((v) => v + 1)}
                  >
                    再読み込み
                  </button>
                </div>
              )}
            </section>

            {form.primaryCompany && !choosingCompany && (
              <>
                {step === "date" && (
                  <section className="panel p-5 sm:p-6">
                    <SectionHeading title="入力する日付を選んでください" />
                    <div className="grid grid-cols-3 gap-2">
                      {dateOptions.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          className="status-option flex-col gap-1 px-2"
                          aria-pressed={
                            !customDate && form.startDate === option.date
                          }
                          onClick={() => {
                            setCustomDate(false);
                            selectDate(option.date);
                          }}
                        >
                          <span>{option.label}</span>
                          <span className="text-sm font-normal">
                            {option.date.slice(5).replace("-", "/")}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary mt-3 w-full"
                      aria-expanded={customDate}
                      aria-controls="custom-work-date"
                      onClick={() => {
                        if (!customDate) {
                          setCustomDate(true);
                          selectDate("");
                        }
                      }}
                    >
                      任意の日付を選ぶ
                    </button>
                    {customDate && (
                      <label className="field mt-3" id="custom-work-date">
                        <span className="label">作業日</span>
                        <input
                          className="input"
                          type="date"
                          value={form.startDate}
                          onChange={(event) =>
                            patch({
                              startDate: event.target.value,
                              endDate: event.target.value,
                            })
                          }
                          required
                        />
                        <button
                          type="button"
                          className="btn btn-primary mt-3 w-full"
                          disabled={!validDate}
                          onClick={() => setStep("status")}
                        >
                          次へ
                        </button>
                      </label>
                    )}
                  </section>
                )}

                {step === "copy" && (
                  <section className="panel p-5 sm:p-6">
                    {choice === null ? (
                      sourceLoading ? (
                        <div role="status" className="text-base text-slate-600">
                          前回の作業を確認しています…
                          <button
                            type="button"
                            className="btn btn-secondary mt-4 w-full"
                            onClick={() => answer(false)}
                          >
                            新しく入力する
                          </button>
                        </div>
                      ) : sourceError ? (
                        <>
                          <p role="alert" className="text-red-700">
                            {sourceError}
                          </p>
                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setSourceRetry((v) => v + 1)}
                            >
                              再読み込み
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => answer(false)}
                            >
                              新しく入力する
                            </button>
                          </div>
                        </>
                      ) : source ? (
                        <>
                          <SectionHeading
                            title={
                              sourceIsToday
                                ? "今日と同じ人員ですか？"
                                : "前回と同じ人員ですか？"
                            }
                          />
                          <p className="mb-4 text-sm text-slate-500">
                            {displayDate(source.workDate)}の作業
                          </p>
                          <SchedulePreview
                            peopleOnly
                            schedule={source}
                            primaryCompany={form.primaryCompany}
                          />
                          <div className="mt-5 grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              className="btn btn-primary min-h-14 text-lg"
                              onClick={() => answer(true)}
                            >
                              はい
                            </button>
                            <button
                              type="button"
                              className="btn min-h-14 border-2 border-slate-300 bg-slate-50 text-lg text-slate-800 hover:bg-slate-100"
                              onClick={() => answer(false)}
                            >
                              いいえ
                            </button>
                          </div>
                          <p className="mt-3 text-sm text-slate-500">
                            人数と二次会社を確認してください。変更する場合は「いいえ」。
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-base text-slate-600">
                            これまでの作業予定はありません。
                          </p>
                          <button
                            type="button"
                            className="btn btn-primary mt-4 w-full"
                            onClick={() => answer(false)}
                          >
                            新しく入力する
                          </button>
                        </>
                      )
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">
                          {choice === "same"
                            ? "作業内容を引き継いで入力"
                            : "新しく入力"}
                        </p>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setChoice(null);
                            setSubmitState({ status: "idle" });
                          }}
                        >
                          選び直す
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {step === "status" && (
                  <section className="panel p-5 sm:p-6">
                    <SectionHeading title="作業はありますか？" />
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        className="status-option"
                        aria-pressed={statusChosen && isWork}
                        onClick={() => {
                          setStatusChosen(true);
                          patch({ status: "work" });
                          setChoice(null);
                          setStep("copy");
                        }}
                      >
                        作業あり
                      </button>
                      <button
                        type="button"
                        className="status-option"
                        aria-pressed={statusChosen && !isWork}
                        onClick={() => {
                          setStatusChosen(true);
                          setForm({
                            ...emptyForm(form.startDate),
                            primaryCompany: form.primaryCompany,
                            status: "no_work",
                          });
                          setChoice("new");
                          setVisitChoice(null);
                          setStep("visit");
                        }}
                      >
                        作業なし
                      </button>
                    </div>
                  </section>
                )}

                {step === "copyContent" && source && (
                  <section className="panel p-5 sm:p-6">
                    <SectionHeading
                      title={
                        sourceIsToday
                          ? "今日と同じ作業内容ですか？"
                          : "前回と同じ作業内容ですか？"
                      }
                    />
                    <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 rounded-xl bg-slate-50 p-4 text-base">
                      <dt className="text-slate-500">エリア</dt>
                      <dd className="whitespace-pre-wrap break-words">
                        {source.workArea || "未入力"}
                      </dd>
                      <dt className="text-slate-500">作業内容</dt>
                      <dd className="whitespace-pre-wrap break-words">
                        {source.workContent || "未入力"}
                      </dd>
                    </dl>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        className="btn btn-primary min-h-14"
                        onClick={() => {
                          patch({
                            workArea: source.workArea ?? "",
                            workContent: source.workContent ?? "",
                          });
                          setStep("confirm");
                        }}
                      >
                        はい
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary min-h-14"
                        onClick={() => {
                          setEditorPart("content");
                          setStep("edit");
                        }}
                      >
                        いいえ・変更
                      </button>
                    </div>
                  </section>
                )}

                {step === "visit" && (
                  <section className="panel p-5 sm:p-6">
                    <SectionHeading title="次回の作業予定日は決まっていますか？" />
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        className="btn btn-primary min-h-14"
                        onClick={() => setVisitChoice("date")}
                      >
                        日付を指定
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary min-h-14"
                        onClick={() => {
                          patch({ nextVisitDate: null });
                          setVisitChoice("unknown");
                          setEditorPart("content");
                          setStep("edit");
                        }}
                      >
                        未定
                      </button>
                    </div>
                    {visitChoice === "date" && (
                      <div className="mt-4 space-y-4">
                        <label className="field">
                          <span className="label">次回の作業予定日</span>
                          <input
                            type="date"
                            className="input"
                            min={form.startDate}
                            value={form.nextVisitDate ?? ""}
                            onChange={(event) =>
                              patch({
                                nextVisitDate: event.target.value || null,
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="btn btn-primary w-full"
                          disabled={
                            !parseLocalDate(form.nextVisitDate ?? "") ||
                            (form.nextVisitDate ?? "") < form.startDate
                          }
                          onClick={() => {
                            setEditorPart("content");
                            setStep("edit");
                          }}
                        >
                          次へ
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {ready && !showEditor && submitState.status !== "success" && (
                  <section className="panel p-5 sm:p-6">
                    <SectionHeading title="この内容で送信します" />
                    <p className="mb-4 font-semibold text-primary">
                      {displayDate(form.startDate)}・
                      {isWork ? "作業あり" : "作業なし"}
                    </p>
                    {isWork ? (
                      <SchedulePreview
                        primaryCompany={form.primaryCompany}
                        schedule={{
                          workDate: form.startDate,
                          primaryCount: form.primaryCount,
                          workArea: form.workArea,
                          workContent: form.workContent,
                          subcompanies: form.currentSubcompanies,
                        }}
                      />
                    ) : (
                      <div className="rounded-xl bg-slate-50 p-4">
                        <p className="text-lg">
                          次回の作業予定：
                          {form.nextVisitDate
                            ? displayDate(form.nextVisitDate)
                            : "未定"}
                        </p>
                        <dl className="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-3 text-sm leading-6">
                          <dt className="text-slate-500">作業エリア</dt>
                          <dd className="whitespace-pre-wrap break-words">
                            {form.nextWorkArea || "未入力"}
                          </dd>
                          <dt className="text-slate-500">作業内容</dt>
                          <dd className="whitespace-pre-wrap break-words">
                            {form.nextWorkContent || "未入力"}
                          </dd>
                        </dl>
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary mt-5 w-full"
                      onClick={() => {
                        setEditorPart(isWork ? "people" : "content");
                        setStep("edit");
                      }}
                    >
                      内容を編集
                    </button>
                  </section>
                )}

                {showEditor && (
                  <section className="panel p-5 sm:p-6">
                    <SectionHeading
                      title={
                        editorPart === "people"
                          ? "人数を入力してください"
                          : isWork
                            ? "作業内容を入力してください"
                            : "次回の作業内容（任意）"
                      }
                    />
                    <div
                      className={
                        editorPart === "people"
                          ? "grid grid-cols-[minmax(0,1fr)_112px] gap-3 sm:grid-cols-[minmax(0,1fr)_170px]"
                          : "hidden"
                      }
                    >
                      <div className="field">
                        <span className="label" id="selected-company-label">
                          一次会社
                        </span>
                        <div
                          role="textbox"
                          aria-readonly="true"
                          aria-labelledby="selected-company-label"
                          className="input flex h-auto min-h-14 items-center break-all bg-slate-50 py-3"
                        >
                          {form.primaryCompany}
                        </div>
                      </div>
                      <CountField
                        value={activeCount}
                        required={isWork}
                        previous={Boolean(
                          isWork
                            ? form.usePreviousPrimaryCount
                            : form.usePreviousNextPrimaryCount,
                        )}
                        previousValue={previous?.primaryCount}
                        onChange={(count) =>
                          patch(
                            isWork
                              ? {
                                  primaryCount: count,
                                  usePreviousPrimaryCount: false,
                                }
                              : {
                                  nextPrimaryCount: count,
                                  usePreviousNextPrimaryCount: false,
                                },
                          )
                        }
                        onPreviousChange={() => {
                          if (previous?.primaryCount != null)
                            patch(
                              isWork
                                ? {
                                    primaryCount: previous.primaryCount,
                                    usePreviousPrimaryCount: true,
                                  }
                                : {
                                    nextPrimaryCount: previous.primaryCount,
                                    usePreviousNextPrimaryCount: true,
                                  },
                            );
                        }}
                      />
                    </div>
                    {previousResult?.key === previousKey &&
                      previousResult.error && (
                        <div role="alert" className="mt-3 text-sm text-red-700">
                          {previousResult.error}
                          <button
                            type="button"
                            className="btn btn-secondary ml-2"
                            onClick={() => setPreviousRetry((v) => v + 1)}
                          >
                            再読み込み
                          </button>
                        </div>
                      )}
                    {!isWork && (
                      <label className="field mt-4">
                        <span className="label">次回来場予定日（任意）</span>
                        <input
                          type="date"
                          className="input"
                          value={form.nextVisitDate ?? ""}
                          onChange={(event) =>
                            patch({ nextVisitDate: event.target.value || null })
                          }
                        />
                      </label>
                    )}
                    <div
                      className={
                        editorPart === "people"
                          ? "my-5 border-y border-border py-5"
                          : "hidden"
                      }
                    >
                      <SubcompanyFields
                        title="二次会社"
                        rows={activeRows}
                        options={secondaryOptions}
                        countRequired={isWork}
                        previousCounts={previousCounts}
                        onChange={(rows) =>
                          patch(
                            isWork
                              ? { currentSubcompanies: rows }
                              : { nextSubcompanies: rows },
                          )
                        }
                      />
                    </div>
                    <div
                      className={
                        editorPart === "content" ? "space-y-4" : "hidden"
                      }
                    >
                      <WorkField
                        key={`${previousKey}-${copyVersion}-area`}
                        label="作業エリア"
                        value={area}
                        previousValue={previous?.workArea}
                        placeholder="例：10階、12階"
                        onChange={(value) =>
                          patch(
                            isWork
                              ? { workArea: value }
                              : { nextWorkArea: value },
                          )
                        }
                      />
                      <WorkField
                        key={`${previousKey}-${copyVersion}-content`}
                        label="作業内容"
                        value={content}
                        previousValue={previous?.workContent}
                        placeholder="例：配管つり込み作業"
                        multiline
                        onChange={(value) =>
                          patch(
                            isWork
                              ? { workContent: value }
                              : { nextWorkContent: value },
                          )
                        }
                      />
                    </div>
                    {submitState.status === "error" && (
                      <p role="alert" className="mt-3 text-red-700">
                        {submitState.message}
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary mt-5 w-full"
                      onClick={() => {
                        if (
                          (isWork && totalCount < 1) ||
                          activeRows.some(
                            (row) =>
                              !row.secondaryCompany.trim() &&
                              (row.workerCount ?? 0) > 0,
                          )
                        ) {
                          setSubmitState({
                            status: "error",
                            message:
                              "会社を選択し、合計人数を1人以上にしてください。",
                          });
                          return;
                        }
                        setSubmitState({ status: "idle" });
                        if (editorPart === "people") {
                          if (source) setStep("copyContent");
                          else setEditorPart("content");
                        } else setStep("confirm");
                      }}
                    >
                      次へ
                    </button>
                  </section>
                )}
              </>
            )}
          </fieldset>

          {ready &&
            (submitState.status === "success" ? (
              <div
                ref={resultRef}
                tabIndex={-1}
                role="status"
                className="panel border-emerald-200 bg-emerald-50 p-5"
              >
                <h2 className="text-lg font-bold text-primary">
                  作業予定を送信しました
                </h2>
                <p className="mt-2 text-base">
                  {submitState.dates.map(displayDate).join("、")}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      const date = toDateString(
                        addDays(parseLocalDate(form.startDate)!, 1),
                      );
                      setCustomDate(
                        !dateOptions.some((option) => option.date === date),
                      );
                      selectDate(date);
                      setStep("confirm");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    同じ内容で別日を入力
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={resetForm}
                  >
                    新しく入力
                  </button>
                </div>
              </div>
            ) : (
              <div className="submit-bar">
                {submitState.status === "error" && (
                  <div
                    ref={resultRef}
                    tabIndex={-1}
                    role="alert"
                    className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-700"
                  >
                    {submitState.message}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {displayDate(form.startDate)}・
                      {isWork ? "作業あり" : "作業なし"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {isWork
                        ? `合計 ${totalCount} 人`
                        : `次回：${form.nextVisitDate ? displayDate(form.nextVisitDate) : "未定"}`}
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary min-h-14 px-5"
                    disabled={busy || !companyMaster || Boolean(companyError)}
                  >
                    {busy ? "送信中…" : "予定を送信"}
                  </button>
                </div>
              </div>
            ))}
          {ready && (
            <>
              <p className="px-1 text-sm leading-6 text-slate-500">
                同じ日付・一次会社の再送信は上書きされます。
              </p>
              <details
                className="panel p-4"
                open={summaryOpen}
                onToggle={(event) => setSummaryOpen(event.currentTarget.open)}
              >
                <summary className="cursor-pointer text-base font-semibold">
                  記入済みの予定を見る
                </summary>
                <div className="mt-3 space-y-3 text-sm leading-6">
                  {summaryError ? (
                    <>
                      <p role="alert">{summaryError}</p>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setSummaryVersion((v) => v + 1)}
                      >
                        再読み込み
                      </button>
                    </>
                  ) : summaries === null ? (
                    "読み込み中…"
                  ) : summaries.length === 0 ? (
                    "今日から7日分の記入済み予定はありません。"
                  ) : (
                    summaries.map((summary) => (
                      <div key={summary.id}>
                        <p className="font-semibold">
                          {displayDate(summary.workDate)} {summary.status}
                        </p>
                        <p>{summary.companyText}</p>
                        <p>
                          {[
                            summary.status === "作業あり"
                              ? summary.workArea
                              : summary.nextWorkArea,
                            summary.status === "作業あり"
                              ? summary.workContent
                              : summary.nextWorkContent,
                          ]
                            .filter(Boolean)
                            .join(" / ")}
                        </p>
                        {summary.nextVisitDate && (
                          <p>次回来場 {summary.nextVisitDate}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </details>
            </>
          )}
        </form>
      </main>
    </div>
  );
}
