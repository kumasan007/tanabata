"use client";

import { SchedulePreview } from "@/components/schedule-preview";
import { LoadingIndicator } from "@/components/loading-indicator";
import { CopyButton } from "@/components/copy-button";
import {parseTachiumaValue, scheduleToFormData} from "@/lib/schedule-fields";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type {
  CompanyMaster,
  PreviousSchedule,
  ScheduleSubmitInput,
  ScheduleSummary,
  ScheduleWithSubcompanies,
} from "@/lib/types";
import { isWorkingDate, workingDateOptions, shortDateWithWeekday, parseLocalDate } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; dates: string[] }
  | { status: "error"; message: string };
const ExistingEntryCheck = dynamic(() => import("@/components/existing-entry-check").then((module) => module.ExistingEntryCheck), { loading: () => <LoadingIndicator /> });
const CompanyPeopleFields = dynamic(() => import("@/components/company-people-fields").then((module) => module.CompanyPeopleFields), { loading: () => <LoadingIndicator /> });
const ScheduleEquipmentFields = dynamic(() => import("@/components/schedule-equipment-fields").then((module) => module.ScheduleEquipmentFields), { loading: () => <LoadingIndicator /> });
const MultiDateCalendar = dynamic(() => import("@/components/multi-date-calendar").then((module) => module.MultiDateCalendar));
const emptyForm = (date: string): ScheduleSubmitInput => ({
  dates: date ? [date] : [],
  startDate: date,
  endDate: date,
  excludeWeekends: false,
  primaryCompany: "",
  primaryCount: 0,
  usePreviousPrimaryCount: false,
  currentSubcompanies: [],
  workArea: "",
  workContent: "",
  aerialWorkVehicleCount: 0,
  aerialWorkVehicleFloor: "",
  aerialWorkVehicles: [],
  usesFire: false,
  fireArea: "",
  usesTachiuma: false,
  tachiumaNotes: "",
  tachiumaCount: null,
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

function displaySelectedDates(dates: string[] | undefined, startDate: string, endDate: string) {
  if (!dates?.length) return displayDateRange(startDate, endDate);
  return dates.map(displayDate).join("、");
}

function sourceQuestion(workDate: string, today: string) {
  const current = parseLocalDate(today);
  const tomorrow = current ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1) : null;
  const tomorrowText = tomorrow ? `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}` : "";
  if (workDate === today) return "今日の作業と同じですか？";
  if (workDate === tomorrowText) return "明日の作業と同じですか？";
  return `${displayDate(workDate)}の作業と同じですか？`;
}

function SectionHeading({ title }: { title: string }) {
  return <h2 className="mb-5 text-lg font-bold text-slate-900">{title}</h2>;
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
            <span className="ml-2 text-sm font-normal text-slate-600">任意</span>
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
      <div className="relative">
        {multiline ? (
          <textarea className="textarea pr-11" rows={3} {...inputProps} />
        ) : (
          <input className="input pr-11" {...inputProps} />
        )}
        {value && <button type="button" className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-xl text-slate-500 hover:bg-slate-100" aria-label={`${label}を消す`} onClick={() => { setSame(false); onChange(""); }}>×</button>}
      </div>
    </div>
  );
}

export function ScheduleForm({
  today,
  initialDate = "",
  initialCompany = "",
  initialCompanyMaster,
}: {
  today: string;
  initialDate?: string;
  initialCompany?: string;
  initialCompanyMaster: CompanyMaster;
}) {
  const [form, setForm] = useState<ScheduleSubmitInput>(() => ({
    ...emptyForm(initialDate),
    primaryCompany: initialCompany,
  }));
  const [companyMaster, setCompanyMaster] = useState<CompanyMaster | null>(
    initialCompanyMaster,
  );
  const [companyError, setCompanyError] = useState("");
  const [companyRetry, setCompanyRetry] = useState(0);
  const [choosingCompany, setChoosingCompany] = useState(!initialCompany);
  const [choice, setChoice] = useState<"same" | "new" | null>(null);
  const [customDate, setCustomDate] = useState(false);
  const [continuingInput, setContinuingInput] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [step, setStep] = useState<
    "existing" | "date" | "copy" | "edit" | "confirm"
  >(initialDate && initialCompany ? "existing" : "date");
  const [editorPart, setEditorPart] = useState<"people" | "content">("people");
  const [secondaryWorkChoice, setSecondaryWorkChoice] = useState<boolean | null>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step, choosingCompany, editorPart]);
  const [copyVersion, setCopyVersion] = useState(0);
  const [sourceRetry, setSourceRetry] = useState(0);
  const [sourceResult, setSourceResult] = useState<{
    company: string;
    date: string;
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
    const clearRestoredInput = (event: PageTransitionEvent) => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (!event.persisted && navigation?.type !== "back_forward") return;
      setForm({ ...emptyForm(initialDate), primaryCompany: initialCompany });
      setChoosingCompany(!initialCompany);
      setChoice(null);
      setCustomDate(false);
      setContinuingInput(false);
      setOverwriteExisting(false);
      setStep(initialDate && initialCompany ? "existing" : "date");
      setEditorPart("people");
      setSecondaryWorkChoice(null);
      setSourceResult(null);
      setPreviousResult(null);
      setSubmitState({ status: "idle" });
      setSummaryOpen(false);
    };
    window.addEventListener("pageshow", clearRestoredInput);
    return () => window.removeEventListener("pageshow", clearRestoredInput);
  }, [initialDate, initialCompany]);
  const source = sourceResult?.company === form.primaryCompany && sourceResult?.date === form.startDate ? sourceResult.source : null;
  const sourceLoading = Boolean(
    form.primaryCompany && form.startDate && (sourceResult?.company !== form.primaryCompany || sourceResult?.date !== form.startDate),
  );
  const sourceError =
    sourceResult?.company === form.primaryCompany && sourceResult?.date === form.startDate ? sourceResult.error : "";
  useEffect(() => {
    if (step !== "copy" || choice !== null || sourceLoading || sourceError || source) return;
    setForm((current) => ({
      ...emptyForm(current.startDate),
      endDate: current.endDate,
      dates: current.dates,
      primaryCompany: current.primaryCompany,
      primaryCount: null,
      currentSubcompanies: (companyMaster?.secondariesByPrimary[current.primaryCompany] ?? []).map((secondaryCompany) => ({ secondaryCompany, workerCount: null, usePreviousWorkerCount: false })),
    }));
    setSecondaryWorkChoice((companyMaster?.secondariesByPrimary[form.primaryCompany] ?? []).length > 0);
    setChoice("new");
    setStep("edit");
    setEditorPart("people");
    setCopyVersion((version) => version + 1);
    setSubmitState({ status: "idle" });
  }, [step, choice, sourceLoading, sourceError, source, companyMaster, form.primaryCompany]);
  const validDate = Boolean(form.dates?.length) && form.dates!.every(isWorkingDate);
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
  const secondaryRowsComplete = activeRows.every(
    (row) => row.secondaryCompany.trim() && (row.workerCount ?? 0) >= 0,
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
  const previousCounts = useMemo(() => new Map(
    previous?.subcompanies.map((row) => [
      row.secondaryCompany,
      row.workerCount,
    ]) ?? [],
  ), [previous]);
  const dateOptions = useMemo(() => workingDateOptions(today), [today]);

  useEffect(() => {
    if (companyRetry === 0) return;
    const controller = new AbortController();
    setCompanyError("");
    apiFetch("/api/companies", { signal: controller.signal })
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
    if (!form.primaryCompany || !form.startDate) return;
    const controller = new AbortController();
    setSourceResult(null);
    apiFetch(
      "/api/schedules/copy-source?" +
        new URLSearchParams({ primaryCompany: form.primaryCompany, workDate: form.startDate }),
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error();
        if (!controller.signal.aborted)
          setSourceResult({
            company: form.primaryCompany,
            date: form.startDate,
            source: body.source,
            today: body.today,
            error: "",
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSourceResult({
            company: form.primaryCompany,
            date: form.startDate,
            source: null,
            today: "",
            error: "前回の作業を取得できませんでした。",
          });
      });
    return () => controller.abort();
  }, [form.primaryCompany, form.startDate, sourceRetry]);

  useEffect(() => {
    if (!showEditor || sourceLoading) return;
    if (previousRetry === 0 && sourceResult?.company === form.primaryCompany && sourceResult.date === form.startDate && !sourceResult.error) {
      setPreviousResult({ key: previousKey, previous: sourceResult.source, error: "" });
      return;
    }
    const controller = new AbortController();
    setPreviousResult(null);
    apiFetch(
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
    sourceLoading,
    sourceResult,
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
    apiFetch(
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
      const selectedDate = form.startDate;
      setForm({ ...emptyForm(selectedDate), primaryCompany: company });
      setSecondaryWorkChoice(null);
      setChoice(null);
      setStep(isWorkingDate(selectedDate) ? "existing" : "date");
      setCustomDate(false);
      setContinuingInput(false);
      setOverwriteExisting(false);
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
      dates: form.dates,
      primaryCompany: form.primaryCompany,
    };
    if (source && same) {
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
      next.aerialWorkVehicles = source.aerialWorkVehicles?.length
        ? source.aerialWorkVehicles
        : (source.aerialWorkVehicleCount ?? 0) > 0
          ? [{ workArea: source.aerialWorkVehicleFloor ?? "", vehicleCount: source.aerialWorkVehicleCount ?? 1 }]
          : [];
      next.usesFire = source.usesFire ?? false;
      next.fireArea = source.fireArea ?? "";
      next.usesTachiuma = source.usesTachiuma ?? false;
      const tachiuma = parseTachiumaValue(source.tachiumaNotes);
      next.tachiumaNotes = tachiuma.area;
      next.tachiumaCount = tachiuma.count;
    } else {
      next.primaryCount = null;
      next.currentSubcompanies = secondaryOptions.map((secondaryCompany) => ({
        secondaryCompany,
        workerCount: null,
        usePreviousWorkerCount: false,
      }));
      next.workArea = "";
      next.workContent = "";
      next.aerialWorkVehicleCount = source?.aerialWorkVehicleCount ?? null;
      next.aerialWorkVehicleFloor = source?.aerialWorkVehicleFloor ?? "";
      next.aerialWorkVehicles = source?.aerialWorkVehicles?.length
        ? source.aerialWorkVehicles
        : (source?.aerialWorkVehicleCount ?? 0) > 0
          ? [{ workArea: source?.aerialWorkVehicleFloor ?? "", vehicleCount: source?.aerialWorkVehicleCount ?? 1 }]
          : [];
      next.usesFire = source?.usesFire ?? false;
      next.fireArea = source?.fireArea ?? "";
      next.usesTachiuma = source?.usesTachiuma ?? false;
      const tachiuma = parseTachiumaValue(source?.tachiumaNotes);
      next.tachiumaNotes = tachiuma.area;
      next.tachiumaCount = tachiuma.count;
    }
    setForm(next);
    setSecondaryWorkChoice(next.currentSubcompanies.length > 0);
    setChoice(same ? "same" : "new");
    setStep(same ? "confirm" : "edit");
    setEditorPart("people");
    setCopyVersion((v) => v + 1);
    setSubmitState({ status: "idle" });
  }
  function selectDate(startDate: string, endDate = startDate) {
    const dates: string[] = [];
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    if (start && end) {
      for (let cursor = start; cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)) {
        const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        if (isWorkingDate(value)) dates.push(value);
      }
    }
    patch({ startDate, endDate, dates });
    setOverwriteExisting(false);
    if (!isWorkingDate(startDate) || !isWorkingDate(endDate)) {
      if (startDate && endDate) setSubmitState({ status: "error", message: "開始日と終了日は月曜〜土曜を選択してください。" });
      return;
    }
    if (startDate > endDate) {
      setSubmitState({ status: "error", message: "終了日は開始日以降を選択してください。" });
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
    setContinuingInput(false);
    setOverwriteExisting(false);
    setSummaryOpen(false);
    setSubmitState({ status: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function editExisting(row: ScheduleWithSubcompanies) {
    setForm(scheduleToFormData(row));
    setOverwriteExisting(true);
    setChoice("new");
    setSecondaryWorkChoice(row.subcompanies.length > 0);
    setEditorPart("people");
    setStep("edit");
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
    if ((form.aerialWorkVehicles ?? []).some((row) => (row.vehicleCount ?? 0) < 1)) {
      setStep("edit");
      setEditorPart("content");
      setSubmitState({ status: "error", message: "高所作業車の希望台数を1以上の整数で入力してください。" });
      return;
    }
    if ((form.aerialWorkVehicles ?? []).some((row) => !row.workArea.trim())) {
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
      const submit = async (overwrite: boolean) => {
        const response = await apiFetch("/api/schedules", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...form,
            primaryCount: form.primaryCount ?? 0,
            excludeWeekends: false,
            usePreviousPrimaryCount: false,
            overwriteExisting: overwrite,
            currentSubcompanies: form.currentSubcompanies.map((row) => ({
              ...row,
              workerCount: row.workerCount ?? 0,
              usePreviousWorkerCount: false,
            })),
          }),
        });
        return { response, body: await response.json() };
      };

      const { response, body } = await submit(overwriteExisting);
      if (
        response.status === 409 &&
        body.code === "SCHEDULE_ALREADY_EXISTS"
      ) {
        setSubmitState({ status: "error", message: "入力中に同じ日付の予定が登録されました。日付選択へ戻って確認してください。" });
        return;
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
        <h1 className="page-title">作業入力</h1>
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          {(form.primaryCompany || form.startDate) && (
            <div className="flex min-w-0 items-baseline gap-3 break-words text-sm text-slate-600">
              {form.primaryCompany && <p className="min-w-0 max-w-[50%] font-semibold">{form.primaryCompany}</p>}
              {form.startDate && <p className="min-w-0 flex-1">{displaySelectedDates(form.dates, form.startDate, form.endDate)}</p>}
            </div>
          )}
          {!choosingCompany && (
            <div className="grid gap-2 text-sm text-slate-600">
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
                  else if (step === "copy") {
                    setChoice(null);
                    setStep("date");
                  } else if (step === "edit" && editorPart === "content")
                    setEditorPart("people");
                  else if (step === "edit" && !source) {
                    setChoice(null);
                    setStep("date");
                  }
                  else {
                    setChoice(null);
                    setStep("copy");
                  }
                }}
              >
                戻る
              </button>
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
                {step === "existing" && <ExistingEntryCheck
                  key={`${form.primaryCompany}-${form.dates?.join(",")}`}
                  date={form.startDate}
                  dates={form.dates}
                  company={form.primaryCompany}
                  kind="schedule"
                  onNew={() => { setStep(continuingInput ? "confirm" : "copy"); setContinuingInput(false); }}
                  onOtherDate={() => setStep("date")}
                  onSchedule={editExisting}
                  onOverwrite={() => { setOverwriteExisting(true); setStep("copy"); }}
                  onSkip={(existingDates) => {
                    const blocked = new Set(existingDates);
                    const remaining = (form.dates ?? []).filter((date) => !blocked.has(date));
                    if (!remaining.length) { setStep("date"); return; }
                    patch({ dates: remaining, startDate: remaining[0], endDate: remaining.at(-1)! });
                    setOverwriteExisting(false);
                    setStep("copy");
                  }}
                />}
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
                          patch({ startDate: "", endDate: "", dates: [] });
                        }
                      }}
                    >
                      別日・複数日選択
                    </button>
                    {customDate && (
                      <div
                        className="mt-3 min-w-0 w-full space-y-4 overflow-hidden rounded-md border border-slate-200 bg-slate-50/70 p-3 sm:p-4"
                        id="custom-work-date"
                      >
                        <MultiDateCalendar
                          today={today}
                          value={form.dates ?? []}
                          onChange={(dates) => patch({ dates, startDate: dates[0] ?? "", endDate: dates.at(-1) ?? "" })}
                          onConfirm={() => { setOverwriteExisting(false); setStep("existing"); }}
                        />
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
                          <p role="alert" className="notice-error">
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
                          <SectionHeading title={sourceQuestion(source.workDate, sourceResult?.today ?? today)} />
                          <p className="mb-4 text-sm text-slate-500">
                            {displayDate(source.workDate)}の作業
                          </p>
                          <SchedulePreview
                            schedule={source}
                            primaryCompany={form.primaryCompany}
                            hideZeroSecondaryCompanies
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

                {ready && !showEditor && submitState.status !== "success" && (
                  <section className="panel p-5 sm:p-6">
                    <SectionHeading title="この内容で送信します" />
                    <p className="mb-4 font-semibold text-primary">
                      {displaySelectedDates(form.dates, form.startDate, form.endDate)}
                    </p>
                    <SchedulePreview
                      primaryCompany={form.primaryCompany}
                      notes={form.notes}
                      schedule={{
                        workDate: form.startDate,
                        primaryCount: activeCount,
                        workArea: area,
                        workContent: content,
                        aerialWorkVehicleCount: form.aerialWorkVehicleCount,
                        aerialWorkVehicleFloor: form.aerialWorkVehicleFloor,
                        aerialWorkVehicles: form.aerialWorkVehicles,
                        usesFire: form.usesFire,
                        fireArea: form.fireArea,
                        usesTachiuma: form.usesTachiuma,
                        tachiumaNotes: form.tachiumaNotes,
                        tachiumaCount: form.tachiumaCount,
                        subcompanies: activeRows,
                      }}
                    />
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
                      {secondaryWorkChoice !== null && (
                        <CompanyPeopleFields
                          primaryCompany={form.primaryCompany}
                          primaryCount={activeCount}
                          primaryCountCopied={Boolean(form.usePreviousPrimaryCount)}
                          previousPrimaryCount={previous?.primaryCount}
                          subcompanies={secondaryWorkChoice ? activeRows : []}
                          previousCounts={previousCounts}
                          onPrimaryCountChange={(count, copied) => patch({ primaryCount: count, usePreviousPrimaryCount: copied })}
                          onSubcompaniesChange={(rows) => patch({ currentSubcompanies: rows })}
                        />
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
                      <ScheduleEquipmentFields form={form} previous={previous} onChange={patch} />
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
                      <p role="alert" className="mt-3 notice-error">
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
                          (form.aerialWorkVehicles ?? []).some((row) => (row.vehicleCount ?? 0) < 1)
                        ) {
                          setSubmitState({ status: "error", message: "高所作業車の希望台数を1以上の整数で入力してください。" });
                          return;
                        }
                        if (editorPart === "content" && (form.aerialWorkVehicles ?? []).some((row) => !row.workArea.trim())) {
                          setSubmitState({ status: "error", message: "高所作業車の使用フロアを入力してください。" });
                          return;
                        }
                        setSubmitState({ status: "idle" });
                        if (editorPart === "people") {
                          setEditorPart("content");
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
          {!ready && submitState.status === "error" && <p role="alert" className="notice-error">{submitState.message}</p>}

          {ready &&
            (submitState.status === "success" ? (
              <div
                ref={resultRef}
                tabIndex={-1}
                role="status"
                className="notice-success p-5"
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
                      {displaySelectedDates(form.dates, form.startDate, form.endDate)}
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
                          <p>高所作業車：{summary.aerialWorkVehicleFloor || "使用あり"}</p>
                        )}
                        {summary.usesTachiuma && summary.tachiumaNotes && <p>立ち馬連絡事項：{summary.tachiumaNotes}</p>}
                        {summary.usesFire && <p>火気：使用あり</p>}
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
    </div>
  );
}
