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

export function ScheduleForm({
  initialDate,
  today,
}: {
  initialDate: string;
  today: string;
}) {
  const [form, setForm] = useState<ScheduleSubmitInput>(() =>
    emptyForm(initialDate),
  );
  const [companyMaster, setCompanyMaster] = useState<CompanyMaster | null>(
    null,
  );
  const [companyError, setCompanyError] = useState("");
  const [companyRetry, setCompanyRetry] = useState(0);
  const [summaries, setSummaries] = useState<ScheduleSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryVersion, setSummaryVersion] = useState(0);
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
  });
  const [statusChosen, setStatusChosen] = useState(false);
  const [detailsShown, setDetailsShown] = useState(false);
  const [stepError, setStepError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [copyVersion, setCopyVersion] = useState(0);
  const contentRef = useRef<HTMLElement>(null);
  const companyStep = statusChosen && Boolean(parseLocalDate(form.startDate));
  const contentStep =
    companyStep && Boolean(form.primaryCompany) && detailsShown;
  useEffect(() => {
    if (contentStep) contentRef.current?.focus({ preventScroll: false });
  }, [contentStep]);
  const submitting = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const isWork = form.status === "work";
  const secondaryOptions = useMemo(
    () => companyMaster?.secondariesByPrimary[form.primaryCompany] ?? [],
    [companyMaster, form.primaryCompany],
  );
  const activeRows = isWork ? form.currentSubcompanies : form.nextSubcompanies;
  const activeCount = isWork ? form.primaryCount : form.nextPrimaryCount;
  const totalCount =
    (activeCount ?? 0) +
    activeRows.reduce((sum, row) => sum + (row.workerCount ?? 0), 0);
  const previousKey = JSON.stringify([
    form.primaryCompany,
    form.status,
    form.startDate,
  ]);
  const [previousResult, setPreviousResult] = useState<{
    key: string;
    data: PreviousSchedule | null;
    today: PreviousSchedule | null;
    error: string;
  } | null>(null);
  const [previousRetry, setPreviousRetry] = useState(0);
  const previous =
    previousResult?.key === previousKey ? previousResult.data : null;
  const todaySchedule =
    previousResult?.key === previousKey ? previousResult.today : null;
  const canCopyToday = isWork && form.startDate > today;
  const previousLoading = Boolean(
    form.primaryCompany &&
    parseLocalDate(form.startDate) &&
    previousResult?.key !== previousKey,
  );
  const previousCounts = new Map(
    previous?.subcompanies.map((row) => [
      row.secondaryCompany,
      row.workerCount,
    ]) ?? [],
  );

  useEffect(() => {
    if (!form.primaryCompany || !parseLocalDate(form.startDate)) return;
    const controller = new AbortController();
    setPreviousResult(null);
    const params = new URLSearchParams({
      primaryCompany: form.primaryCompany,
      status: form.status,
      workDate: form.startDate,
      includeToday: "1",
    });
    fetch("/api/schedules/previous?" + params, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error("前回の予定を取得できませんでした。");
        if (!controller.signal.aborted)
          setPreviousResult({
            key: previousKey,
            data: body.previous,
            today: body.today ?? null,
            error: "",
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setPreviousResult({
            key: previousKey,
            data: null,
            today: null,
            error: "前回の予定を取得できませんでした。",
          });
      });
    return () => controller.abort();
  }, [
    form.primaryCompany,
    form.status,
    form.startDate,
    previousKey,
    previousRetry,
  ]);
  const area = isWork ? form.workArea : form.nextWorkArea;
  const content = isWork ? form.workContent : form.nextWorkContent;
  const busy = submitState.status === "submitting";

  useEffect(() => {
    const controller = new AbortController();
    setCompanyError("");
    fetch("/api/companies", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "会社一覧を取得できませんでした。");
        setCompanyMaster(body);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setCompanyError(
            error instanceof Error
              ? error.message
              : "会社一覧を取得できませんでした。",
          );
      });
    return () => controller.abort();
  }, [companyRetry]);

  useEffect(() => {
    const controller = new AbortController();
    setSummaries([]);
    setSummaryError("");
    if (!form.primaryCompany.trim()) {
      setSummaryLoading(false);
      return () => controller.abort();
    }
    setSummaryLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/schedules/summary?primaryCompany=${encodeURIComponent(form.primaryCompany)}`,
          { signal: controller.signal },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error("記入済みの予定を取得できませんでした。");
        if (!controller.signal.aborted) setSummaries(body.summaries ?? []);
      } catch {
        if (!controller.signal.aborted)
          setSummaryError("記入済みの予定を取得できませんでした。");
      } finally {
        if (!controller.signal.aborted) setSummaryLoading(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.primaryCompany, summaryVersion]);

  useEffect(() => {
    if (submitState.status === "success" || submitState.status === "error")
      resultRef.current?.focus({
        preventScroll: submitState.status === "error",
      });
  }, [submitState]);

  function patch(value: Partial<ScheduleSubmitInput>) {
    setStepError("");
    setCopyNotice("");
    if (
      value.primaryCompany !== undefined &&
      value.primaryCompany !== form.primaryCompany
    )
      setDetailsShown(false);
    setForm((current) => {
      const contextChanged =
        (value.primaryCompany !== undefined &&
          value.primaryCompany !== current.primaryCompany) ||
        (value.startDate !== undefined &&
          value.startDate !== current.startDate) ||
        (value.status !== undefined && value.status !== current.status);
      const next = { ...current, ...value };
      if (contextChanged) {
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
    if (submitState.status === "error" || submitState.status === "success")
      setSubmitState({ status: "idle" });
  }

  function validateBeforeSubmit() {
    if (!form.primaryCompany.trim()) return "一次会社を選択してください。";
    if (
      activeRows.some(
        (row) =>
          ((row.workerCount ?? 0) > 0 || row.usePreviousWorkerCount) &&
          !row.secondaryCompany.trim(),
      )
    )
      return "二次会社人数を入力する場合は、二次会社を選択してください。";
    if (isWork && activeCount === null)
      return "一次会社人数を入力してください。";
    if (isWork && totalCount < 1)
      return "作業ありの場合は、一次会社・二次会社の合計人数を1人以上にしてください。";
    return "";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !companyStep) return;
    const message = validateBeforeSubmit();
    if (message) {
      if (contentStep) setSubmitState({ status: "error", message });
      else setStepError(message);
      return;
    }
    if (!contentStep) {
      setDetailsShown(true);
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
          body.error ?? "送信に失敗しました。時間をおいて再度お試しください。",
        );
      setSubmitState({
        status: "success",
        dates: body.dates ?? [form.startDate],
      });
      setSummaryVersion((value) => value + 1);
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

  function copyToday() {
    if (!todaySchedule || !canCopyToday) return;
    patch({
      primaryCount: todaySchedule.primaryCount ?? 0,
      usePreviousPrimaryCount: false,
      currentSubcompanies: todaySchedule.subcompanies
        .filter((row) => row.secondaryCompany)
        .map((row) => ({
          ...row,
          workerCount: row.workerCount ?? 0,
          usePreviousWorkerCount: false,
        })),
      workArea: todaySchedule.workArea ?? "",
      workContent: todaySchedule.workContent ?? "",
    });
    setCopyVersion((value) => value + 1);
    setCopyNotice(
      "本日の内容をコピーしました。変更があれば、そのまま編集してください。",
    );
    setDetailsShown(true);
  }

  function continueAnotherDate() {
    const date = toDateString(
      addDays(
        parseLocalDate(form.startDate) ?? parseLocalDate(initialDate)!,
        1,
      ),
    );
    patch({ startDate: date, endDate: date });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const dateOptions = [
    { label: "今日", date: today },
    { label: "明日", date: initialDate },
    {
      label: "明後日",
      date: toDateString(addDays(parseLocalDate(initialDate)!, 1)),
    },
  ];

  return (
    <div className="simple-schedule min-h-screen pb-36 sm:pb-8">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900">作業予定入力</h1>
          <Link href="/admin" prefetch={false} className="btn btn-secondary">
            管理画面
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-3 py-4 sm:px-4">
        <form
          id="schedule-form"
          onSubmit={handleSubmit}
          className="min-w-0 space-y-5"
        >
          {companyError ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              <span>{companyError}</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCompanyRetry((value) => value + 1)}
              >
                再読み込み
              </button>
            </div>
          ) : null}
          <fieldset disabled={busy} className="grid min-w-0 gap-5">
            <legend className="sr-only">作業予定の入力</legend>
            <section className="panel p-4 sm:p-5">
              <SectionHeading title="作業日と予定" />
              {!statusChosen && (
                <p className="mb-4 text-base text-slate-600">
                  日付を確認して、作業あり・なしを選んでください。
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="field">
                  <span className="label">
                    作業日<span className="required-mark">*</span>
                  </span>
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
                </label>
                <div
                  className="grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1"
                  aria-label="日付をすばやく選択"
                >
                  {dateOptions.map((option) => (
                    <button
                      type="button"
                      key={option.label}
                      className="date-shortcut"
                      aria-pressed={form.startDate === option.date}
                      onClick={() =>
                        patch({
                          startDate: option.date,
                          endDate: option.date,
                        })
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="mt-5 grid grid-cols-2 gap-3"
                role="group"
                aria-label="作業の有無"
              >
                <button
                  type="button"
                  className="status-option"
                  aria-pressed={statusChosen && isWork}
                  onClick={() => {
                    setStatusChosen(true);
                    patch({ status: "work" });
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
                    patch({ status: "no_work" });
                  }}
                >
                  作業なし
                </button>
              </div>
            </section>

            {companyStep && (
              <section className="panel p-4 sm:p-5">
                <SectionHeading title="会社と人数" />
                <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
                  <label className="field">
                    <span className="label">
                      一次会社<span className="required-mark">*</span>
                    </span>
                    <select
                      className="input"
                      value={form.primaryCompany}
                      disabled={!companyMaster || Boolean(companyError)}
                      required
                      onChange={(event) =>
                        patch({
                          primaryCompany: event.target.value,
                          currentSubcompanies: [],
                          nextSubcompanies: [],
                        })
                      }
                    >
                      <option value="" disabled>
                        {!companyMaster
                          ? "会社一覧を読み込み中…"
                          : "会社を選択してください"}
                      </option>
                      {companyMaster?.primaryCompanies.map((company) => (
                        <option key={company} value={company}>
                          {company}
                        </option>
                      ))}
                    </select>
                    {companyMaster?.primaryCompanies.length === 0 ? (
                      <p className="text-sm text-red-700">
                        会社が登録されていません。管理者にご確認ください。
                      </p>
                    ) : null}
                  </label>
                  <CountField
                    required={isWork}
                    value={activeCount}
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
                {form.primaryCompany &&
                  canCopyToday &&
                  !previousLoading &&
                  previousResult?.key === previousKey &&
                  !previousResult.error && (
                    <section
                      aria-label="本日の内容"
                      className="mt-5 rounded-md border border-border bg-slate-50 p-4"
                    >
                      <h3 className="text-base font-bold">
                        本日と同じ作業ですか？
                      </h3>
                      {todaySchedule ? (
                        <>
                          <p className="mt-2 text-sm text-slate-600">
                            {displayDate(todaySchedule.workDate)}の登録内容
                          </p>
                          <dl className="mt-3 space-y-2 text-base">
                            <div>
                              <dt className="font-semibold">一次会社人数</dt>
                              <dd>{todaySchedule.primaryCount ?? 0} 人</dd>
                            </div>
                            {todaySchedule.subcompanies
                              .filter((row) => row.secondaryCompany)
                              .map((row, index) => (
                                <div key={index}>
                                  <dt className="font-semibold">
                                    {row.secondaryCompany}
                                  </dt>
                                  <dd>{row.workerCount ?? 0} 人</dd>
                                </div>
                              ))}
                            <div>
                              <dt className="font-semibold">作業エリア</dt>
                              <dd className="whitespace-pre-wrap break-words">
                                {todaySchedule.workArea || "未入力"}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold">作業内容</dt>
                              <dd className="whitespace-pre-wrap break-words">
                                {todaySchedule.workContent || "未入力"}
                              </dd>
                            </div>
                          </dl>
                          <p className="mt-3 text-sm text-slate-600">
                            人数・二次会社・エリア・内容をコピーします。作業日は変更しません。
                          </p>
                          <button
                            type="button"
                            className="btn btn-secondary mt-3 w-full"
                            onClick={copyToday}
                          >
                            本日の内容をコピー
                          </button>
                        </>
                      ) : (
                        <p className="mt-2 text-base text-slate-600">
                          本日の作業予定は登録されていません。下の項目から入力してください。
                        </p>
                      )}
                    </section>
                  )}
                {copyNotice && (
                  <p role="status" className="mt-3 text-base text-primary">
                    {copyNotice}
                  </p>
                )}
                {form.primaryCompany && (
                  <div
                    className="my-3 text-sm leading-6 text-slate-600"
                    aria-live="polite"
                  >
                    {previousLoading ? (
                      "前回の予定を確認しています…"
                    ) : previousResult?.key === previousKey &&
                      previousResult.error ? (
                      <>
                        <p>{previousResult.error}</p>
                        <button
                          type="button"
                          className="btn btn-secondary mt-2"
                          onClick={() => setPreviousRetry((value) => value + 1)}
                        >
                          前回の予定を再読み込み
                        </button>
                      </>
                    ) : previous ? (
                      <p>
                        前回：{displayDate(previous.workDate)}
                        。各項目の「前回をコピー」で入力できます。
                      </p>
                    ) : (
                      <p>この日付より前の同じ作業区分の予定はありません。</p>
                    )}
                  </div>
                )}
                {form.primaryCompany.trim() ? (
                  <details className="my-4 rounded-md border border-border bg-slate-50/70">
                    <summary className="min-h-12 cursor-pointer px-4 py-3 text-base font-semibold text-slate-700">
                      記入済みの予定
                      <span className="ml-2 text-sm font-normal text-slate-600">
                        今日から7日分
                      </span>
                    </summary>
                    <div
                      className="border-t border-border px-4 py-3"
                      aria-live="polite"
                    >
                      {summaryLoading ? (
                        <p className="text-sm text-slate-500">
                          確認しています…
                        </p>
                      ) : summaryError ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm text-red-700">{summaryError}</p>
                          <button
                            type="button"
                            className="btn btn-secondary text-sm"
                            onClick={() =>
                              setSummaryVersion((value) => value + 1)
                            }
                          >
                            再試行
                          </button>
                        </div>
                      ) : summaries.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          今日以降の記入済み予定はありません。
                        </p>
                      ) : (
                        <div className="divide-y divide-border">
                          {summaries.map((summary) => (
                            <div
                              key={summary.id}
                              className="py-3 first:pt-0 last:pb-0"
                            >
                              <p className="flex flex-wrap gap-2 text-sm font-semibold text-slate-700">
                                <span>{displayDate(summary.workDate)}</span>
                                <span
                                  className={
                                    summary.status === "作業あり"
                                      ? "text-primary"
                                      : "text-slate-600"
                                  }
                                >
                                  {summary.status}
                                </span>
                                {summary.nextVisitDate ? (
                                  <span>次回来場 {summary.nextVisitDate}</span>
                                ) : null}
                              </p>
                              <p className="mt-1 text-sm leading-5 text-slate-500">
                                {summary.companyText}
                              </p>
                              <p className="text-sm leading-5 text-slate-500">
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
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                ) : null}
                {form.primaryCompany && !isWork ? (
                  <div className="mt-5 grid gap-4">
                    <label className="field">
                      <span className="label">
                        次回来場予定日
                        <span className="ml-2 text-sm font-normal text-slate-600">
                          任意
                        </span>
                      </span>
                      <input
                        className="input"
                        type="date"
                        value={form.nextVisitDate ?? ""}
                        onChange={(event) =>
                          patch({ nextVisitDate: event.target.value || null })
                        }
                      />
                    </label>
                  </div>
                ) : null}
                {form.primaryCompany && (
                  <div className="mt-4 border-t border-border pt-5">
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
                )}
                {form.primaryCompany && !detailsShown && (
                  <div className="mt-5">
                    {stepError && (
                      <p role="alert" className="mb-3 text-sm text-red-700">
                        {stepError}
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary w-full"
                      onClick={() => {
                        const message = validateBeforeSubmit();
                        if (message) {
                          setStepError(message);
                          return;
                        }
                        setDetailsShown(true);
                      }}
                    >
                      作業内容へ進む
                    </button>
                  </div>
                )}
              </section>
            )}

            {contentStep && (
              <section
                ref={contentRef}
                tabIndex={-1}
                aria-label="作業内容の入力"
                className="panel p-4 sm:p-5"
              >
                <SectionHeading
                  title={isWork ? "作業内容" : "次回の作業内容"}
                />
                <div className="space-y-4">
                  <WorkField
                    key={`${previousKey}-${copyVersion}-area`}
                    previousValue={previous?.workArea}
                    label="作業エリア"
                    value={area}
                    placeholder="例：10階、12階"
                    onChange={(value) =>
                      patch(
                        isWork ? { workArea: value } : { nextWorkArea: value },
                      )
                    }
                  />
                  <WorkField
                    key={`${previousKey}-${copyVersion}-content`}
                    previousValue={previous?.workContent}
                    label="作業内容"
                    value={content}
                    multiline
                    placeholder="例：配管つり込み作業"
                    onChange={(value) =>
                      patch(
                        isWork
                          ? { workContent: value }
                          : { nextWorkContent: value },
                      )
                    }
                  />
                </div>
              </section>
            )}
          </fieldset>

          {contentStep &&
            (submitState.status === "success" ? (
              <div
                ref={resultRef}
                tabIndex={-1}
                role="status"
                className="rounded-md border border-emerald-200 bg-emerald-50 p-6 outline-none"
              >
                <h2 className="text-lg font-bold text-emerald-900">
                  作業予定を送信しました
                </h2>
                <p className="mt-2 text-sm leading-6 text-emerald-800">
                  {submitState.dates.map(displayDate).join("、")}
                  の予定を登録しました。
                  <br />
                  ご協力ありがとうございます。
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={continueAnotherDate}
                  >
                    同じ内容で別日を入力
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setForm(emptyForm(initialDate));
                      setStatusChosen(false);
                      setDetailsShown(false);
                      setCopyNotice("");
                      setSubmitState({ status: "idle" });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    新しく入力
                  </button>
                </div>
              </div>
            ) : (
              <div className="submit-bar">
                {submitState.status === "error" ? (
                  <div
                    ref={resultRef}
                    tabIndex={-1}
                    role="alert"
                    className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                  >
                    {submitState.message}
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700">
                      {displayDate(form.startDate)}
                      <span className="mx-2 text-slate-300">/</span>
                      {isWork ? "作業あり" : "作業なし"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {!isWork ? "次回予定 " : "合計 "}
                      {totalCount} 人
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary min-h-12 px-5 sm:px-8"
                    disabled={busy || !companyMaster || Boolean(companyError)}
                  >
                    {busy ? "送信中…" : "予定を送信"}
                  </button>
                </div>
                <p className="hidden">
                  同じ日付・一次会社で送信済みの場合は、今回の内容で上書きされます。
                </p>
              </div>
            ))}
          {contentStep && (
            <p className="px-1 text-sm leading-7 text-slate-600">
              同じ日付・一次会社の再送信は上書きされます。
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
