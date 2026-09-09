"use client";

import { ExistingEntryCheck } from "@/components/existing-entry-check";
import { AdminScheduleEditor } from "@/components/admin-schedule-editor";
import { LoadingIndicator } from "@/components/loading-indicator";
import type { ScheduleWithSubcompanies } from "@/lib/types";
import { CopyButton } from "@/components/copy-button";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SubcompanyFields } from "@/components/subcompany-fields";
import { AddSecondaryCompany } from "@/components/add-secondary-company";
import type {
  CompanyMaster,
  PreviousSchedule,
  ScheduleSubmitInput,
  ScheduleSummary,
} from "@/lib/types";
import { isWorkingDate, workingDateOptions, shortDateWithWeekday, parseLocalDate } from "@/lib/utils";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; dates: string[] }
  | { status: "error"; message: string };
const emptyForm = (date: string): ScheduleSubmitInput => ({
  startDate: date,
  endDate: date,
  excludeWeekends: false,
  primaryCompany: "",
  primaryCount: 0,
  usePreviousPrimaryCount: false,
  currentSubcompanies: [],
  workArea: "",
  workContent: "",
  aerialWorkVehicleCount: null,
  aerialWorkVehicleFloor: "",
  notes: "",
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

function displayDateRange(startDate: string, endDate: string) {
  if (!endDate || startDate === endDate) return displayDate(startDate);
  return `${displayDate(startDate)}〜${displayDate(endDate)}`;
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
          value={value ?? ""}
          onChange={(event) => onChange(
            event.target.value === "" ? null : Math.max(0, Number(event.target.value)),
          )}
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
  required = false,
  previousValue,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  required?: boolean;
  previousValue: string | null | undefined;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [same, setSame] = useState(false);
  const inputProps = {
    id,
    value,
    placeholder,
    "aria-required": required,
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
          {required ? (
            <span className="required-mark">必須</span>
          ) : (
            <span className="ml-2 text-sm font-normal text-slate-600">任意・未定可</span>
          )}
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
  today,
  initialCompanyMaster,
}: {
  today: string;
  initialCompanyMaster: CompanyMaster;
}) {
  const [form, setForm] = useState<ScheduleSubmitInput>(() => emptyForm(""));
  const [aerialWorkVehicleCountInput, setAerialWorkVehicleCountInput] = useState("");
  const [companyMaster, setCompanyMaster] = useState<CompanyMaster | null>(
    initialCompanyMaster,
  );
  const [companyError, setCompanyError] = useState("");
  const [companyRetry, setCompanyRetry] = useState(0);
  const [choosingCompany, setChoosingCompany] = useState(true);
  const [choice, setChoice] = useState<"same" | "new" | null>(null);
  const [editingExisting, setEditingExisting] = useState<ScheduleWithSubcompanies | null>(null);
  const [customDate, setCustomDate] = useState(false);
  const [dateRange, setDateRange] = useState(false);
  const [continuingInput, setContinuingInput] = useState(false);
  const [step, setStep] = useState<
    "existing" | "date" | "copy" | "edit" | "confirm" | "copyContent"
  >("date");
  const [editorPart, setEditorPart] = useState<"people" | "content">("people");
  const [secondaryWorkChoice, setSecondaryWorkChoice] = useState<boolean | null>(null);
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
  useEffect(() => {
    setAerialWorkVehicleCountInput(
      form.aerialWorkVehicleCount === null ? "" : String(form.aerialWorkVehicleCount),
    );
  }, [form.aerialWorkVehicleCount]);
  const source =
    sourceResult?.company === form.primaryCompany ? sourceResult.source : null;
  const sourceLoading = Boolean(
    form.primaryCompany && sourceResult?.company !== form.primaryCompany,
  );
  const sourceError =
    sourceResult?.company === form.primaryCompany ? sourceResult.error : "";
  const sourceIsToday = source?.workDate === sourceResult?.today;
  const sourceIsFuture = Boolean(
    source?.workDate && sourceResult?.today && source.workDate > sourceResult.today,
  );
  useEffect(() => {
    if (step !== "copy" || choice !== null || sourceLoading || sourceError || source) return;
    setForm((current) => ({
      ...emptyForm(current.startDate),
      endDate: current.endDate,
      primaryCompany: current.primaryCompany,
    }));
    setSecondaryWorkChoice(null);
    setChoice("new");
    setStep("edit");
    setEditorPart("people");
    setCopyVersion((version) => version + 1);
    setSubmitState({ status: "idle" });
  }, [step, choice, sourceLoading, sourceError, source]);
  const validDate =
    isWorkingDate(form.startDate) &&
    isWorkingDate(form.endDate) &&
    form.startDate <= form.endDate;
  const ready = Boolean(
    form.primaryCompany &&
    choice &&
    validDate &&
    !choosingCompany &&
    step === "confirm",
  );
  const showEditor = !choosingCompany && step === "edit";
  const busy = submitState.status === "submitting";
  const activeRows = form.currentSubcompanies;
  const activeCount = form.primaryCount;
  const totalCount =
    (activeCount ?? 0) +
    activeRows.reduce((sum, row) => sum + (row.workerCount ?? 0), 0);
  const secondaryRowsComplete =
    activeRows.length > 0 &&
    activeRows.every(
      (row) => row.secondaryCompany.trim() && (row.workerCount ?? 0) >= 1,
    );
  const area = form.workArea;
  const content = form.workContent;
  const secondaryOptions = useMemo(
    () => companyMaster?.secondariesByPrimary[form.primaryCompany] ?? [],
    [companyMaster, form.primaryCompany],
  );
  const previousKey = JSON.stringify([
    form.primaryCompany,
    form.startDate,
  ]);
  const previous = previousResult?.key === previousKey ? previousResult.previous : null;
  const previousCounts = new Map(
    previous?.subcompanies.map((row) => [
      row.secondaryCompany,
      row.workerCount,
    ]) ?? [],
  );
  const previousAerialWorkVehicleCount = previous?.aerialWorkVehicleCount ?? 0;
  const previousAerialWorkVehicleFloor = previous?.aerialWorkVehicleFloor ?? "";
  const aerialWorkVehicleCopied =
    previousAerialWorkVehicleCount > 0 &&
    form.aerialWorkVehicleCount === previousAerialWorkVehicleCount &&
    form.aerialWorkVehicleFloor === previousAerialWorkVehicleFloor;
  const dateOptions = workingDateOptions(today);

  useEffect(() => {
    if (companyRetry === 0) return;
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
        value.startDate !== undefined && value.startDate !== current.startDate
      ) {
        next.usePreviousPrimaryCount = false;
        next.currentSubcompanies = next.currentSubcompanies.map((row) => ({
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
      setSecondaryWorkChoice(null);
      setChoice(null);
      setStep("date");
      setCustomDate(false);
      setDateRange(false);
      setContinuingInput(false);
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
      endDate: form.endDate,
      primaryCompany: form.primaryCompany,
    };
    if (source) {
      const copiedRows = source.subcompanies
        .filter((row) => row.secondaryCompany)
        .map((row) => ({
          ...row,
          workerCount: row.workerCount ?? 0,
          usePreviousWorkerCount: false,
        }));
      next.primaryCount = source.primaryCount ?? 0;
      next.workArea = source.workArea ?? "";
      next.workContent = source.workContent ?? "";
      next.currentSubcompanies = copiedRows;
      next.aerialWorkVehicleCount = source.aerialWorkVehicleCount ?? 0;
      next.aerialWorkVehicleFloor = source.aerialWorkVehicleFloor ?? "";
    }
    setForm(next);
    setSecondaryWorkChoice(same ? next.currentSubcompanies.length > 0 : null);
    setChoice(same ? "same" : "new");
    setStep(same ? "copyContent" : "edit");
    setEditorPart("people");
    setCopyVersion((v) => v + 1);
    setSubmitState({ status: "idle" });
  }
  function selectDate(startDate: string, endDate = startDate) {
    patch({ startDate, endDate });
    if (!isWorkingDate(startDate) || !isWorkingDate(endDate)) {
      if (startDate && endDate) setSubmitState({ status: "error", message: "開始日と終了日は月曜〜土曜を選択してください。" });
      return;
    }
    if (startDate > endDate) {
      setSubmitState({ status: "error", message: "終了日は開始日以降を選択してください。" });
      return;
    }
    if (startDate !== endDate) {
      setStep(continuingInput ? "confirm" : "copy");
      setContinuingInput(false);
      return;
    }
    setStep("existing");
  }
  function resetForm() {
    setForm(emptyForm(""));
    setSecondaryWorkChoice(null);
    setChoice(null);
    setChoosingCompany(true);
    setStep("date");
    setCustomDate(false);
    setDateRange(false);
    setContinuingInput(false);
    setSummaryOpen(false);
    setSubmitState({ status: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || submitting.current) return;
    if (!area.trim() || !content.trim()) {
      setStep("edit");
      setEditorPart("content");
      setSubmitState({
        status: "error",
        message: !area.trim()
          ? "作業エリアを入力してください。"
          : "作業内容を入力してください。",
      });
      return;
    }
    if (secondaryWorkChoice === null) {
      setStep("edit");
      setEditorPart("people");
      setSubmitState({
        status: "error",
        message: "二次会社が作業するか選択してください。",
      });
      return;
    }
    if (secondaryWorkChoice && !secondaryRowsComplete) {
      setStep("edit");
      setEditorPart("people");
      setSubmitState({
        status: "error",
        message: "作業する二次会社を選び、人数を1人以上で入力してください。",
      });
      return;
    }
    if (totalCount < 1) {
      setStep("edit");
      setEditorPart("people");
      setSubmitState({
        status: "error",
        message: "作業予定がある場合は、合計人数を1人以上にしてください。",
      });
      return;
    }
    if (form.aerialWorkVehicleCount === null) {
      setStep("edit");
      setEditorPart("content");
      setSubmitState({ status: "error", message: "高所作業車を使用するか選択してください。" });
      return;
    }
    if (
      (form.aerialWorkVehicleCount ?? 0) > 0 &&
      (!/^\d+$/.test(aerialWorkVehicleCountInput) || Number(aerialWorkVehicleCountInput) < 1)
    ) {
      setStep("edit");
      setEditorPart("content");
      setSubmitState({ status: "error", message: "高所作業車の希望台数を1以上の整数で入力してください。" });
      return;
    }
    if ((form.aerialWorkVehicleCount ?? 0) > 0 && !form.aerialWorkVehicleFloor.trim()) {
      setStep("edit");
      setEditorPart("content");
      setSubmitState({ status: "error", message: "高所作業車の使用フロアを入力してください。" });
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
      const submit = async (overwriteExisting: boolean) => {
        const response = await fetch("/api/schedules", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...form,
            excludeWeekends: false,
            usePreviousPrimaryCount: false,
            overwriteExisting,
            currentSubcompanies: form.currentSubcompanies.map((row) => ({
              ...row,
              usePreviousWorkerCount: false,
            })),
          }),
        });
        return { response, body: await response.json() };
      };

      let { response, body } = await submit(false);
      if (
        response.status === 409 &&
        body.code === "SCHEDULE_ALREADY_EXISTS"
      ) {
        const confirmed = window.confirm(
          `${(body.dates ?? [form.startDate]).map(displayDate).join("、")}の「${form.primaryCompany}」の予定は既に入力されています。変更しますか？`,
        );
        if (!confirmed) {
          setSubmitState({ status: "idle" });
          return;
        }
        ({ response, body } = await submit(true));
      }
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
                  if (step === "date") {
                    setForm(emptyForm(""));
                    setSecondaryWorkChoice(null);
                    setChoice(null);
                    setCustomDate(false);
                    setContinuingInput(false);
                    setSummaryOpen(false);
                    setChoosingCompany(true);
                  }
                  else if (step === "existing") setStep("date");
                  else if (step === "copyContent") {
                    setEditorPart("people");
                    setStep("edit");
                  } else if (step === "copy") {
                    setChoice(null);
                    setStep("date");
                  } else if (step === "edit" && editorPart === "content")
                    setEditorPart("people");
                  else {
                    setChoice(null);
                    setStep("copy");
                  }
                }}
              >
                戻る
              </button>
              <p className="min-w-0 text-right break-words">
                {form.primaryCompany}
                {validDate && (
                  <span className="block">{displayDateRange(form.startDate, form.endDate)}</span>
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
                {step === "existing" && <ExistingEntryCheck key={`${form.primaryCompany}-${form.startDate}`} date={form.startDate} company={form.primaryCompany} kind="schedule" onNew={() => { setStep(continuingInput ? "confirm" : "copy"); setContinuingInput(false); }} onOtherDate={() => setStep("date")} onSchedule={setEditingExisting} />}
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
                            setDateRange(false);
                            selectDate(option.date);
                          }}
                        >
                          <span>{option.label}</span>
                          <span className="text-sm font-normal">
                            {shortDateWithWeekday(option.date)}
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
                          setDateRange(false);
                          patch({ startDate: "", endDate: "" });
                        }
                      }}
                    >
                      任意の日付を選ぶ
                    </button>
                    {customDate && (
                      <div
                        className="mt-3 min-w-0 w-full space-y-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4"
                        id="custom-work-date"
                      >
                        <fieldset className="min-w-0">
                          <legend className="mb-2 text-sm font-semibold text-slate-600">
                            日付の指定方法
                          </legend>
                          <div className="grid min-w-0 grid-cols-2 gap-1 rounded-lg bg-slate-200/70 p-1">
                            <button
                              type="button"
                              className="date-shortcut min-w-0"
                              aria-pressed={!dateRange}
                              onClick={() => {
                                setDateRange(false);
                                patch({ endDate: form.startDate });
                              }}
                            >
                              1日だけ
                            </button>
                            <button
                              type="button"
                              className="date-shortcut min-w-0"
                              aria-pressed={dateRange}
                              onClick={() => setDateRange(true)}
                            >
                              期間指定
                            </button>
                          </div>
                        </fieldset>
                        <div className={dateRange ? "grid min-w-0 gap-3 sm:grid-cols-2" : "min-w-0"}>
                          <label className="field min-w-0">
                            <span className="label">{dateRange ? "開始日" : "作業日"}（月曜〜土曜）</span>
                            <input
                              className="input max-w-full"
                              type="date"
                              value={form.startDate}
                              onChange={(event) => {
                                const startDate = event.target.value;
                                patch({
                                  startDate,
                                  endDate:
                                    !dateRange || !form.endDate || form.endDate < startDate
                                      ? startDate
                                      : form.endDate,
                                });
                              }}
                              required
                            />
                          </label>
                          {dateRange && (
                            <label className="field min-w-0">
                              <span className="label">終了日（月曜〜土曜）</span>
                              <input
                                className="input max-w-full"
                                type="date"
                                min={form.startDate}
                                value={form.endDate}
                                onChange={(event) => patch({ endDate: event.target.value })}
                                required
                              />
                            </label>
                          )}
                        </div>
                        {dateRange && (
                          <p className="text-sm leading-6 text-slate-600">
                            選択した期間の月曜〜土曜へ同じ内容を入力します。日曜は除きます。
                          </p>
                        )}
                        <button
                          type="button"
                          className="btn btn-primary w-full"
                          disabled={!validDate}
                          onClick={() => {
                            selectDate(form.startDate, form.endDate);
                          }}
                        >
                          次へ
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {step === "copy" && (
                  <section className="panel p-5 sm:p-6">
                    {choice === null ? (
                      sourceLoading ? (
                        <div role="status" className="text-base text-slate-600">
                          <LoadingIndicator label="前回の作業を確認しています…" />
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
                                : sourceIsFuture
                                  ? `${displayDate(source.workDate)}と同じ人員ですか？`
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
                        <LoadingIndicator label="入力画面を準備しています…" />
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

                {step === "copyContent" && source && (
                  <section className="panel p-5 sm:p-6">
                    <SectionHeading
                      title={
                        sourceIsToday
                          ? "今日と同じ作業内容ですか？"
                          : sourceIsFuture
                            ? `${displayDate(source.workDate)}と同じ作業内容ですか？`
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
                      <dt className="text-slate-500">高所作業車</dt>
                      <dd>
                        {(source.aerialWorkVehicleCount ?? 0) > 0
                          ? `${source.aerialWorkVehicleCount}台・${source.aerialWorkVehicleFloor || "使用フロア未入力"}`
                          : "使用しない"}
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
                            aerialWorkVehicleCount: source.aerialWorkVehicleCount ?? 0,
                            aerialWorkVehicleFloor: source.aerialWorkVehicleFloor ?? "",
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

                {ready && !showEditor && submitState.status !== "success" && (
                  <section className="panel p-5 sm:p-6">
                    <SectionHeading title="この内容で送信します" />
                    <p className="mb-4 font-semibold text-primary">
                      {displayDateRange(form.startDate, form.endDate)}
                    </p>
                    <SchedulePreview
                      primaryCompany={form.primaryCompany}
                      schedule={{
                        workDate: form.startDate,
                        primaryCount: activeCount,
                        workArea: area,
                        workContent: content,
                        subcompanies: activeRows,
                      }}
                    />
                    <div className="mt-4 rounded-xl bg-sky-50 p-4 text-sm">
                        <span className="font-semibold">高所作業車：</span>
                        <span>{(form.aerialWorkVehicleCount ?? 0) > 0 ? `${form.aerialWorkVehicleCount}台` : "使用しない"}</span>
                        {(form.aerialWorkVehicleCount ?? 0) > 0 && form.aerialWorkVehicleFloor && (
                          <span className="ml-2 whitespace-pre-wrap">使用フロア：{form.aerialWorkVehicleFloor}</span>
                        )}
                    </div>
                    {form.notes && (
                      <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm">
                        <span className="font-semibold">備考：</span>
                        <span className="whitespace-pre-wrap">{form.notes}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary mt-5 w-full"
                      onClick={() => {
                        setEditorPart("people");
                        setStep("edit");
                      }}
                    >
                      内容を編集
                    </button>
                  </section>
                )}

                {showEditor && (
                  <section className="panel p-5 sm:p-6">
                    {editorPart === "content" && (
                      <SectionHeading title="作業内容を入力してください" />
                    )}
                    {previousResult?.key !== previousKey && <LoadingIndicator label="前回の値を読み込み中…" />}
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
                    <div
                      className={
                        editorPart === "people"
                          ? "space-y-5"
                          : "hidden"
                      }
                    >
                      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                        <p className="font-semibold text-slate-900">
                          二次会社は作業しますか？ <span className="required-mark">必須</span>
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            className="status-option min-h-14 text-lg"
                            aria-pressed={secondaryWorkChoice === true}
                            onClick={() => {
                              setSecondaryWorkChoice(true);
                              if (activeRows.length === 0) {
                                patch({
                                  currentSubcompanies: [{
                                    secondaryCompany: "",
                                    workerCount: 0,
                                    usePreviousWorkerCount: false,
                                  }],
                                });
                              }
                            }}
                          >
                            はい
                          </button>
                          <button
                            type="button"
                            className="status-option min-h-14 text-lg"
                            aria-pressed={secondaryWorkChoice === false}
                            onClick={() => {
                              setSecondaryWorkChoice(false);
                              patch({ currentSubcompanies: [] });
                            }}
                          >
                            いいえ
                          </button>
                        </div>
                      </div>

                      {secondaryWorkChoice === true && (
                        <div className="border-y border-border py-5">
                          <SubcompanyFields
                            title="作業する二次会社"
                            rows={activeRows}
                            options={secondaryOptions}
                            countRequired
                            optional={false}
                            previousCounts={previousCounts}
                            onChange={(rows) =>
                              patch({ currentSubcompanies: rows })
                            }
                          />
                          <AddSecondaryCompany
                            key={form.primaryCompany}
                            primaryCompany={form.primaryCompany}
                            onAdded={(company) => {
                              const primary = form.primaryCompany;
                              setCompanyMaster((master) => master ? {
                                ...master,
                                secondariesByPrimary: {
                                  ...master.secondariesByPrimary,
                                  [primary]: [...new Set([...(master.secondariesByPrimary[primary] ?? []), company])],
                                },
                              } : master);
                              setForm((current) => {
                                if (current.primaryCompany !== primary) return current;
                                const rows = current.currentSubcompanies;
                                if (rows.some((row) => row.secondaryCompany === company)) return current;
                                const blank = rows.findIndex((row) => !row.secondaryCompany);
                                return { ...current, currentSubcompanies: blank >= 0
                                  ? rows.map((row, index) => index === blank ? { ...row, secondaryCompany: company, usePreviousWorkerCount: false } : row)
                                  : [...rows, { secondaryCompany: company, workerCount: 0, usePreviousWorkerCount: false }],
                                };
                              });
                            }}
                          />
                        </div>
                      )}

                      {secondaryWorkChoice !== null && (
                        <div>
                          <p className="mb-3 font-semibold text-slate-900">
                            次に、一次会社所属の人数を入力してください
                          </p>
                          <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
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
                              required
                              previous={Boolean(form.usePreviousPrimaryCount)}
                              previousValue={previous?.primaryCount}
                              onChange={(count) =>
                                patch({ primaryCount: count, usePreviousPrimaryCount: false })
                              }
                              onPreviousChange={() => {
                                if (previous?.primaryCount != null)
                                  patch({ primaryCount: previous.primaryCount, usePreviousPrimaryCount: true });
                              }}
                            />
                          </div>
                          <p className="mt-2 text-sm text-slate-500">
                            一次会社所属の作業者がいない場合は0人のままで進めます。
                          </p>
                        </div>
                      )}
                    </div>
                    <div
                      className={
                        editorPart === "content" ? "space-y-4" : "hidden"
                      }
                    >
                      <>
                        <WorkField
                          key={`${previousKey}-${copyVersion}-area`}
                          label="作業エリア"
                          value={area}
                          required
                          previousValue={previous?.workArea}
                          placeholder="例：10階、12階"
                          onChange={(value) =>
                            patch({ workArea: value })
                          }
                        />
                        <WorkField
                          key={`${previousKey}-${copyVersion}-content`}
                          label="作業内容"
                          value={content}
                          required
                          previousValue={previous?.workContent}
                          placeholder="例：配管つり込み作業"
                          multiline
                          onChange={(value) =>
                            patch({ workContent: value })
                          }
                        />
                      </>
                      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-x-3">
                            <p className="font-semibold text-slate-900">高所作業車を使用しますか？ <span className="required-mark">必須</span></p>
                            {(form.aerialWorkVehicleCount ?? 0) > 0 && (
                              <CopyButton
                                label="高所作業車を前回からコピー"
                                copied={aerialWorkVehicleCopied}
                                disabled={previousAerialWorkVehicleCount <= 0}
                                onCopy={() => {
                                  setAerialWorkVehicleCountInput(String(previousAerialWorkVehicleCount));
                                  patch({
                                    aerialWorkVehicleCount: previousAerialWorkVehicleCount,
                                    aerialWorkVehicleFloor: previousAerialWorkVehicleFloor,
                                  });
                                }}
                              />
                            )}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <button type="button" className="status-option" aria-pressed={(form.aerialWorkVehicleCount ?? 0) > 0} onClick={() => {
                              const count = Math.max(1, form.aerialWorkVehicleCount ?? 1);
                              setAerialWorkVehicleCountInput(String(count));
                              patch({ aerialWorkVehicleCount: count });
                            }}>使用する</button>
                            <button type="button" className="status-option" aria-pressed={form.aerialWorkVehicleCount === 0} onClick={() => patch({ aerialWorkVehicleCount: 0, aerialWorkVehicleFloor: "" })}>使用しない</button>
                          </div>
                          {(form.aerialWorkVehicleCount ?? 0) > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-[9rem_1fr]">
                            <label className="field">
                              <span className="label">希望台数</span>
                              <div className="relative">
                                <input
                                  className="input pr-10 tabular-nums"
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  step={1}
                                  required
                                  value={aerialWorkVehicleCountInput}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setAerialWorkVehicleCountInput(value);
                                    if (/^\d+$/.test(value) && Number(value) >= 1) {
                                      patch({ aerialWorkVehicleCount: Number(value) });
                                    }
                                  }}
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">台</span>
                              </div>
                            </label>
                            <label className="field">
                              <span className="label">使用フロア <span className="required-mark">必須</span></span>
                              <input
                                className="input"
                                required
                                value={form.aerialWorkVehicleFloor}
                                maxLength={100}
                                placeholder="例：10階、12階"
                                onChange={(event) => patch({ aerialWorkVehicleFloor: event.target.value })}
                              />
                            </label>
                          </div>}
                      </div>
                      <WorkField
                        key={`${previousKey}-${copyVersion}-notes`}
                        label="備考"
                        value={form.notes}
                        previousValue={null}
                        placeholder="連絡事項や注意点など"
                        multiline
                        onChange={(value) => patch({ notes: value })}
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
                        if (editorPart === "people" && secondaryWorkChoice === null) {
                          setSubmitState({
                            status: "error",
                            message: "二次会社が作業するか選択してください。",
                          });
                          return;
                        }
                        if (
                          editorPart === "people" &&
                          secondaryWorkChoice === true &&
                          !secondaryRowsComplete
                        ) {
                          setSubmitState({
                            status: "error",
                            message: "作業する二次会社を選び、人数を1人以上で入力してください。",
                          });
                          return;
                        }
                        if (
                          totalCount < 1 ||
                          activeRows.some(
                            (row) =>
                              !row.secondaryCompany.trim() &&
                              (row.workerCount ?? 0) > 0,
                          )
                        ) {
                          setEditorPart("people");
                          setSubmitState({
                            status: "error",
                            message:
                              "会社を選択し、合計人数を1人以上にしてください。",
                          });
                          return;
                        }
                        if (editorPart === "content" && (!area.trim() || !content.trim())) {
                          setSubmitState({
                            status: "error",
                            message: !area.trim()
                              ? "作業エリアを入力してください。"
                              : "作業内容を入力してください。",
                          });
                          return;
                        }
                        if (editorPart === "content" && form.aerialWorkVehicleCount === null) {
                          setSubmitState({ status: "error", message: "高所作業車を使用するか選択してください。" });
                          return;
                        }
                        if (
                          editorPart === "content" &&
                          (form.aerialWorkVehicleCount ?? 0) > 0 &&
                          (!/^\d+$/.test(aerialWorkVehicleCountInput) || Number(aerialWorkVehicleCountInput) < 1)
                        ) {
                          setSubmitState({ status: "error", message: "高所作業車の希望台数を1以上の整数で入力してください。" });
                          return;
                        }
                        if (editorPart === "content" && (form.aerialWorkVehicleCount ?? 0) > 0 && !form.aerialWorkVehicleFloor.trim()) {
                          setSubmitState({ status: "error", message: "高所作業車の使用フロアを入力してください。" });
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
          {!ready && submitState.status === "error" && <p role="alert" className="text-red-700">{submitState.message}</p>}

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
                      setSubmitState({ status: "idle" });
                      setContinuingInput(true);
                      setCustomDate(false);
                      setDateRange(false);
                      setStep("date");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    引き続き入力
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
                      {displayDateRange(form.startDate, form.endDate)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      合計 {totalCount} 人
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
                入力済みの日付が含まれる場合は、上書き前に確認します。
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
                    <LoadingIndicator />
                  ) : summaries.length === 0 ? (
                    "今日から7日分の記入済み予定はありません。"
                  ) : (
                    summaries.map((summary) => (
                      <div key={summary.id}>
                        <p className="font-semibold">
                          {displayDate(summary.workDate)}
                        </p>
                        <p>{summary.companyText}</p>
                        <p>
                          {[
                            summary.workArea,
                            summary.workContent,
                          ]
                            .filter(Boolean)
                            .join(" / ")}
                        </p>
                        {summary.aerialWorkVehicleCount > 0 && (
                          <p>高所作業車：{summary.aerialWorkVehicleCount}台{summary.aerialWorkVehicleFloor ? `（使用フロア：${summary.aerialWorkVehicleFloor}）` : ""}</p>
                        )}
                        {summary.notes && <p>備考：{summary.notes}</p>}
                      </div>
                    ))
                  )}
                </div>
              </details>
            </>
          )}
        </form>
      </main>
      {editingExisting && <AdminScheduleEditor schedule={editingExisting} master={companyMaster} workerMode onClose={() => setEditingExisting(null)} onSaved={() => { setEditingExisting(null); setStep("date"); setSummaryVersion((v) => v + 1); setSubmitState({ status: "idle" }); }} />}
    </div>
  );
}
