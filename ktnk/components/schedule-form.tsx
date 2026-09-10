"use client";

import { ExistingEntryCheck } from "@/components/existing-entry-check";
import { LoadingIndicator } from "@/components/loading-indicator";
import { CopyButton } from "@/components/copy-button";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MultiDateCalendar } from "@/components/multi-date-calendar";
import type {
  CompanyMaster,
  PreviousSchedule,
  ScheduleSubmitInput,
  ScheduleSummary,
  ScheduleWithSubcompanies,
} from "@/lib/types";
import { isWorkingDate, workingDateOptions, shortDateWithWeekday, parseLocalDate } from "@/lib/utils";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; dates: string[] }
  | { status: "error"; message: string };
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
  aerialWorkVehicleCount: null,
  aerialWorkVehicleFloor: "",
  aerialWorkVehicles: [],
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

function CompanyPeopleFields({
  primaryCompany,
  primaryCount,
  primaryCountCopied,
  previousPrimaryCount,
  subcompanies,
  previousCounts,
  onPrimaryCountChange,
  onSubcompaniesChange,
}: {
  primaryCompany: string;
  primaryCount: number | null;
  primaryCountCopied: boolean;
  previousPrimaryCount: number | null | undefined;
  subcompanies: ScheduleSubmitInput["currentSubcompanies"];
  previousCounts: Map<string, number | null>;
  onPrimaryCountChange: (count: number | null, copied: boolean) => void;
  onSubcompaniesChange: (rows: ScheduleSubmitInput["currentSubcompanies"]) => void;
}) {
  const id = useId();
  const rows = [
    { company: primaryCompany, count: primaryCount, copied: primaryCountCopied, previous: previousPrimaryCount, primary: true },
    ...subcompanies.map((row) => ({
      company: row.secondaryCompany,
      count: row.workerCount,
      copied: Boolean(row.usePreviousWorkerCount),
      previous: previousCounts.get(row.secondaryCompany),
      primary: false,
    })),
  ];

  return (
    <section className="overflow-hidden rounded-md border border-border" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="border-b border-border bg-slate-50 px-3 py-2 font-bold text-slate-800">
        作業する会社
      </h2>
      <div className="grid grid-cols-[minmax(0,1fr)_76px_52px] items-center gap-2 border-b border-border bg-slate-50/60 px-3 py-1.5 text-sm font-semibold text-slate-500">
        <span>会社名</span><span>人数</span><span className="sr-only">前回値</span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row, index) => (
          <div key={`${row.primary}-${row.company}`} className="grid grid-cols-[minmax(0,1fr)_76px_52px] items-center gap-2 px-3 py-2">
            <span className="min-w-0 break-words text-sm font-medium text-slate-800">{row.company}</span>
            <div className="relative">
              <input
                id={`${id}-${index}`}
                aria-label={`${row.company}の人数`}
                className="input h-10 px-2 pr-5 text-base tabular-nums"
                inputMode="numeric"
                type="number"
                min={0}
                step={1}
                placeholder="0"
                value={row.count ?? ""}
                onChange={(event) => {
                  const count = event.target.value === "" ? null : Math.max(0, Number(event.target.value));
                  if (row.primary) onPrimaryCountChange(count, false);
                  else onSubcompaniesChange(subcompanies.map((item) => item.secondaryCompany === row.company
                    ? { ...item, workerCount: count, usePreviousWorkerCount: false }
                    : item));
                }}
              />
              <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-xs text-slate-500">人</span>
            </div>
            <button
              type="button"
              className="min-h-9 rounded border border-border bg-white px-1 text-xs font-semibold text-slate-600 disabled:opacity-35"
              disabled={row.previous == null}
              aria-label={`${row.company}の前回人数をコピー`}
              onClick={() => {
                if (row.previous == null) return;
                if (row.primary) onPrimaryCountChange(row.previous, true);
                else onSubcompaniesChange(subcompanies.map((item) => item.secondaryCompany === row.company
                  ? { ...item, workerCount: row.previous ?? null, usePreviousWorkerCount: true }
                  : item));
              }}
            >
              {row.copied ? "済" : "前回"}
            </button>
          </div>
        ))}
      </div>
    </section>
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
  const [companyMaster, setCompanyMaster] = useState<CompanyMaster | null>(
    initialCompanyMaster,
  );
  const [companyError, setCompanyError] = useState("");
  const [companyRetry, setCompanyRetry] = useState(0);
  const [choosingCompany, setChoosingCompany] = useState(true);
  const [choice, setChoice] = useState<"same" | "new" | null>(null);
  const [customDate, setCustomDate] = useState(false);
  const [continuingInput, setContinuingInput] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
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
  const previousCounts = new Map(
    previous?.subcompanies.map((row) => [
      row.secondaryCompany,
      row.workerCount,
    ]) ?? [],
  );
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
    if (!form.primaryCompany || !form.startDate) return;
    const controller = new AbortController();
    setSourceResult(null);
    fetch(
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
    } else {
      next.primaryCount = null;
      next.currentSubcompanies = secondaryOptions.map((secondaryCompany) => ({
        secondaryCompany,
        workerCount: null,
        usePreviousWorkerCount: false,
      }));
      next.workArea = source?.workArea ?? "";
      next.workContent = source?.workContent ?? "";
      next.aerialWorkVehicleCount = source?.aerialWorkVehicleCount ?? null;
      next.aerialWorkVehicleFloor = source?.aerialWorkVehicleFloor ?? "";
      next.aerialWorkVehicles = source?.aerialWorkVehicles?.length
        ? source.aerialWorkVehicles
        : (source?.aerialWorkVehicleCount ?? 0) > 0
          ? [{ workArea: source?.aerialWorkVehicleFloor ?? "", vehicleCount: source?.aerialWorkVehicleCount ?? 1 }]
          : [];
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
    const vehicles = row.aerialWorkVehicles?.length
      ? row.aerialWorkVehicles.map((vehicle) => ({ workArea: vehicle.work_area, vehicleCount: vehicle.vehicle_count }))
      : (row.aerial_work_vehicle_count ?? 0) > 0
        ? [{ workArea: row.aerial_work_vehicle_floor ?? "", vehicleCount: row.aerial_work_vehicle_count }]
        : [];
    setForm({
      ...emptyForm(row.work_date),
      primaryCompany: row.primary_company,
      primaryCount: row.primary_count ?? 0,
      currentSubcompanies: row.subcompanies.map((sub) => ({ secondaryCompany: sub.secondary_company ?? "", workerCount: sub.worker_count ?? 0 })),
      workArea: row.work_area ?? "",
      workContent: row.work_content ?? "",
      aerialWorkVehicleCount: row.aerial_work_vehicle_count ?? 0,
      aerialWorkVehicleFloor: row.aerial_work_vehicle_floor ?? "",
      aerialWorkVehicles: vehicles,
      notes: row.notes ?? "",
    });
    setOverwriteExisting(true);
    setChoice("new");
    setSecondaryWorkChoice(row.subcompanies.length > 0);
    setEditorPart("people");
    setStep("edit");
  }
  function setAerialVehicles(vehicles: NonNullable<ScheduleSubmitInput["aerialWorkVehicles"]>) {
    patch({
      aerialWorkVehicles: vehicles,
      aerialWorkVehicleCount: vehicles.length ? vehicles.reduce((sum, row) => sum + (row.vehicleCount ?? 0), 0) : 0,
      aerialWorkVehicleFloor: vehicles.map((row) => row.workArea).filter(Boolean).join("、"),
    });
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
        const response = await fetch("/api/schedules", {
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
                  <span className="block">{displaySelectedDates(form.dates, form.startDate, form.endDate)}</span>
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
                        className="mt-3 min-w-0 w-full space-y-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4"
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
                          <SectionHeading title={sourceQuestion(source.workDate, sourceResult?.today ?? today)} />
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
                    <SectionHeading title={sourceQuestion(source.workDate, sourceResult?.today ?? today)} />
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
                      {displaySelectedDates(form.dates, form.startDate, form.endDate)}
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
                      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                          <p className="font-semibold text-slate-900">高所作業車を使用しますか？ <span className="required-mark">必須</span></p>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <button type="button" className="status-option" aria-pressed={(form.aerialWorkVehicles?.length ?? 0) > 0} onClick={() => {
                              if (!form.aerialWorkVehicles?.length) setAerialVehicles([{ workArea: "", vehicleCount: 1 }]);
                            }}>使用する</button>
                            <button type="button" className="status-option" aria-pressed={form.aerialWorkVehicleCount === 0} onClick={() => setAerialVehicles([])}>使用しない</button>
                          </div>
                          {(form.aerialWorkVehicles ?? []).map((vehicle, index) => <div key={index} className="mt-3 grid gap-2 rounded-lg border border-sky-200 bg-white p-3 sm:grid-cols-[1fr_7rem_auto]">
                            <label className="field"><span className="label">使用場所 <span className="required-mark">必須</span></span><input className="input" value={vehicle.workArea} placeholder="例：10階" onChange={(event) => setAerialVehicles((form.aerialWorkVehicles ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, workArea: event.target.value } : row))} /></label>
                            <label className="field"><span className="label">台数</span><input className="input" type="number" inputMode="numeric" min={1} value={vehicle.vehicleCount ?? ""} onChange={(event) => setAerialVehicles((form.aerialWorkVehicles ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, vehicleCount: event.target.value === "" ? null : Math.max(1, Number(event.target.value)) } : row))} /></label>
                            <button type="button" className="btn btn-secondary self-end px-4 text-xl" aria-label={`${index + 1}件目の高所作業車を削除`} onClick={() => setAerialVehicles((form.aerialWorkVehicles ?? []).filter((_, rowIndex) => rowIndex !== index))}>×</button>
                          </div>)}
                          {(form.aerialWorkVehicles?.length ?? 0) > 0 && <button type="button" className="btn btn-secondary mt-3 w-full" onClick={() => setAerialVehicles([...(form.aerialWorkVehicles ?? []), { workArea: "", vehicleCount: 1 }])}>使用場所を追加</button>}
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
    </div>
  );
}
