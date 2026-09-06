"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  List,
  LogIn,
  LogOut,
  LoaderCircle,
  Plus,
  Search,
  Table2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CompanyMaster, CompanyMasterRow, ExportRow } from "@/lib/types";
import { addDays, toDateString } from "@/lib/utils";

type AdminResult = {
  rows: ExportRow[];
  count: number;
};

type RangePreset =
  | "today"
  | "tomorrow"
  | "week"
  | "month"
  | "nextMonth"
  | "selectMonth"
  | "custom";
type StatusFilter = "work" | "no_work";
type SortBy = "dateAsc" | "dateDesc" | "primaryAsc";
type AdminTab = "schedules" | "companies";
type ScheduleView = "summary" | "calendar";
type CompanyGroup = {
  primaryCompany: string;
  rows: CompanyMasterRow[];
};
type ScheduleSummaryRow = {
  key: string;
  workDate: string;
  primaryCompany: string;
  primaryCount: number | "";
  totalCount: number;
  workArea: string;
  workContent: string;
  nextVisitDate: string;
  details: Array<{
    company: string;
    count: number | "";
  }>;
};

const tomorrow = () => toDateString(addDays(new Date(), 1));

export function AdminDashboard() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("schedules");
  const [rangePreset, setRangePreset] = useState<RangePreset>("tomorrow");
  const [dateFrom, setDateFrom] = useState(tomorrow);
  const [dateTo, setDateTo] = useState(tomorrow);
  const [primaryCompany, setPrimaryCompany] = useState("");
  const [secondaryCompany, setSecondaryCompany] = useState("");
  const [companyMaster, setCompanyMaster] = useState<CompanyMaster | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("work");
  const [sortBy, setSortBy] = useState<SortBy>("dateAsc");
  const [scheduleView, setScheduleView] = useState<ScheduleView>("summary");
  const [expandedScheduleKeys, setExpandedScheduleKeys] = useState<string[]>(
    [],
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<
    string | null
  >(null);
  const [result, setResult] = useState<AdminResult>({ rows: [], count: 0 });
  const [companyRows, setCompanyRows] = useState<CompanyMasterRow[]>([]);
  const [newPrimaryCompany, setNewPrimaryCompany] = useState("");
  const [newSecondaryCompanies, setNewSecondaryCompanies] = useState("");
  const [newPrimaryRoles, setNewPrimaryRoles] = useState("");
  const [selectedPrimaryCompany, setSelectedPrimaryCompany] = useState<
    string | null
  >(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editPrimaryCompany, setEditPrimaryCompany] = useState("");
  const [editSecondaryCompany, setEditSecondaryCompany] = useState("");
  const [editPrimaryRoles, setEditPrimaryRoles] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom,
    dateTo,
    primaryCompany,
    secondaryCompany,
    statusFilter,
  });
  const hasPendingFilters =
    dateFrom !== appliedFilters.dateFrom ||
    dateTo !== appliedFilters.dateTo ||
    primaryCompany !== appliedFilters.primaryCompany ||
    secondaryCompany !== appliedFilters.secondaryCompany ||
    statusFilter !== appliedFilters.statusFilter;

  const visibleRows = useMemo(() => {
    const filtered = result.rows.filter((row) => {
      if (appliedFilters.statusFilter === "work" && row.status !== "作業あり")
        return false;
      if (
        appliedFilters.statusFilter === "no_work" &&
        row.status !== "作業なし"
      )
        return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "dateDesc")
        return (
          compareText(b.workDate, a.workDate) ||
          compareText(a.primaryCompany, b.primaryCompany)
        );
      if (sortBy === "primaryAsc")
        return (
          compareText(a.primaryCompany, b.primaryCompany) ||
          compareText(a.workDate, b.workDate)
        );
      return (
        compareText(a.workDate, b.workDate) ||
        compareText(a.primaryCompany, b.primaryCompany)
      );
    });
  }, [result.rows, sortBy, appliedFilters.statusFilter]);

  const summaryRows = useMemo(
    () => buildScheduleSummaryRows(visibleRows, appliedFilters.statusFilter),
    [visibleRows, appliedFilters.statusFilter],
  );
  const calendarDays = useMemo(
    () => buildCalendarDays(appliedFilters.dateFrom, appliedFilters.dateTo),
    [appliedFilters.dateFrom, appliedFilters.dateTo],
  );
  const calendarRowsByDate = useMemo(
    () => groupSummaryRowsByDate(summaryRows),
    [summaryRows],
  );
  const selectedCalendarRows = selectedCalendarDate
    ? (calendarRowsByDate[selectedCalendarDate] ?? [])
    : [];
  const totalWorkerCount = summaryRows.reduce(
    (sum, row) => sum + row.totalCount,
    0,
  );

  const primaryCompanyOptions = companyMaster?.primaryCompanies ?? [];

  const secondaryCompanyOptions = useMemo(() => {
    if (!companyMaster) return [];

    const options =
      primaryCompany && companyMaster.secondariesByPrimary[primaryCompany]
        ? companyMaster.secondariesByPrimary[primaryCompany]
        : Object.values(companyMaster.secondariesByPrimary).flat();

    return [...new Set(options)].sort(compareText);
  }, [companyMaster, primaryCompany]);

  const companyGroups = useMemo<CompanyGroup[]>(() => {
    const groups = new Map<string, CompanyMasterRow[]>();
    for (const row of companyRows) {
      const rows = groups.get(row.primary_company) ?? [];
      rows.push(row);
      groups.set(row.primary_company, rows);
    }
    return [...groups].map(([primaryCompanyName, rows]) => ({
      primaryCompany: primaryCompanyName,
      rows,
    }));
  }, [companyRows]);
  const selectedPrimaryIndex = companyGroups.findIndex(
    (group) => group.primaryCompany === selectedPrimaryCompany,
  );

  useEffect(() => {
    fetch("/api/admin/session")
      .then((response) => response.json())
      .then((body) => setAuthenticated(Boolean(body.authenticated)))
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    void Promise.all([refreshCompanyOptions(), refreshCompanyMaster()]).catch(
      (error) => {
        setCompanyMaster(null);
        setMessage(
          error instanceof Error
            ? error.message
            : "会社マスタの取得に失敗しました。",
        );
      },
    );
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    void search();
  }, [authenticated]);

  useEffect(() => {
    setExpandedScheduleKeys([]);
    setSelectedCalendarDate(null);
  }, [dateFrom, dateTo, primaryCompany, secondaryCompany, statusFilter]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoginLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "ログインに失敗しました。");
      setPassword("");
      setAuthenticated(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "接続できませんでした。もう一度お試しください。",
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setResult({ rows: [], count: 0 });
    window.location.href = "/";
  }

  async function search() {
    if (!authenticated) return;
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setMessage("終了日は開始日以降の日付を選択してください。");
      return;
    }
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/schedules?${queryString()}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "取得に失敗しました。");
      setResult({ rows: body.rows ?? [], count: body.count ?? 0 });
      setAppliedFilters({
        dateFrom,
        dateTo,
        primaryCompany,
        secondaryCompany,
        statusFilter,
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "取得に失敗しました。",
      );
    } finally {
      setLoading(false);
    }
  }

  async function refreshCompanyMaster() {
    const response = await fetch("/api/admin/company-master", {
      headers: { accept: "application/json" },
    });
    const body = await response.json();
    if (!response.ok) {
      setCompanyRows([]);
      throw new Error(body.error ?? "会社マスタの取得に失敗しました。");
    }
    setCompanyRows(body.rows ?? []);
  }

  async function refreshCompanyOptions() {
    const response = await fetch("/api/companies", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error ?? "会社一覧を取得できませんでした。");
    setCompanyMaster(body);
  }

  async function addCompanyMaster() {
    if (!authenticated) return;
    const primaryCompany = newPrimaryCompany.trim();
    const primaryTradeRoles = parseRoleText(newPrimaryRoles);
    const secondaryCompanies = [
      ...new Set(
        newSecondaryCompanies
          .split(/\r?\n|,|、/)
          .map((company) => company.trim())
          .filter(Boolean),
      ),
    ];

    if (!primaryCompany) {
      setMessage("一次会社を入力してください。");
      return;
    }

    const existing = companyRows.filter(
      (row) => row.primary_company === primaryCompany,
    );
    if (existing.length && secondaryCompanies.length === 0) {
      setMessage(
        "登録済みの一次会社です。追加する二次会社を入力してください。",
      );
      return;
    }
    if (
      existing.length &&
      secondaryCompanies.every((company) =>
        existing.some((row) => row.secondary_company === company),
      )
    ) {
      setMessage("入力された二次会社はすべて登録済みです。");
      return;
    }
    setMessage("");
    setCompanyLoading(true);

    try {
      const response = await fetch("/api/admin/company-master", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          primaryCompany,
          secondaryCompanies,
          primaryTradeRoles,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "会社マスタの追加に失敗しました。");

      setNewPrimaryCompany("");
      setNewSecondaryCompanies("");
      setNewPrimaryRoles("");
      await Promise.all([refreshCompanyMaster(), refreshCompanyOptions()]);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "会社マスタの追加に失敗しました。",
      );
    } finally {
      setCompanyLoading(false);
    }
  }

  async function removeCompanyMaster(id: string) {
    if (!authenticated) return;
    if (!window.confirm("この協力会社を一覧から削除しますか？")) return;
    const params = new URLSearchParams({ id });
    setMessage("");
    setCompanyLoading(true);

    try {
      const response = await fetch(
        `/api/admin/company-master?${params.toString()}`,
        { method: "DELETE" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "会社マスタの削除に失敗しました。");

      if (editingCompanyId === id) setEditingCompanyId(null);
      await Promise.all([refreshCompanyMaster(), refreshCompanyOptions()]);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "会社マスタの削除に失敗しました。",
      );
    } finally {
      setCompanyLoading(false);
    }
  }

  function startEditingCompany(row: CompanyMasterRow) {
    setEditingCompanyId(row.id);
    setEditPrimaryCompany(row.primary_company);
    setEditSecondaryCompany(row.secondary_company ?? "");
    setEditPrimaryRoles(formatRoles(row.primary_trade_roles));
    setMessage("");
  }

  async function saveCompanyMaster() {
    if (!editingCompanyId || !editPrimaryCompany.trim()) {
      setMessage("一次会社を入力してください。");
      return;
    }

    setMessage("");
    setCompanyLoading(true);
    try {
      const response = await fetch("/api/admin/company-master", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingCompanyId,
          primaryCompany: editPrimaryCompany,
          secondaryCompany: editSecondaryCompany,
          primaryTradeRoles: parseRoleText(editPrimaryRoles),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "会社マスタの更新に失敗しました。");

      setEditingCompanyId(null);
      await Promise.all([refreshCompanyMaster(), refreshCompanyOptions()]);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "会社マスタの更新に失敗しました。",
      );
    } finally {
      setCompanyLoading(false);
    }
  }

  async function movePrimaryCompany(
    primaryCompanyName: string,
    direction: -1 | 1,
  ) {
    const index = companyGroups.findIndex(
      (group) => group.primaryCompany === primaryCompanyName,
    );
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= companyGroups.length)
      return;

    const reorderedGroups = [...companyGroups];
    [reorderedGroups[index], reorderedGroups[destination]] = [
      reorderedGroups[destination],
      reorderedGroups[index],
    ];
    const reordered = reorderedGroups.flatMap((group) => group.rows);
    setCompanyRows(reordered);
    setMessage("");
    setCompanyLoading(true);

    try {
      const response = await fetch("/api/admin/company-master", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((row) => row.id) }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "並び順の保存に失敗しました。");
      await Promise.all([refreshCompanyMaster(), refreshCompanyOptions()]);
    } catch (error) {
      setCompanyRows(companyRows);
      setMessage(
        error instanceof Error ? error.message : "並び順の保存に失敗しました。",
      );
    } finally {
      setCompanyLoading(false);
    }
  }

  function queryString() {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("status", statusFilter);
    if (primaryCompany) params.set("primaryCompany", primaryCompany);
    if (secondaryCompany) params.set("secondaryCompany", secondaryCompany);
    return params.toString();
  }

  function toggleScheduleRow(key: string) {
    setExpandedScheduleKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function setQuickRange(preset: RangePreset) {
    setRangePreset(preset);

    if (preset === "custom") return;
    if (["month", "nextMonth", "selectMonth"].includes(preset)) {
      const now = new Date();
      const month = now.getMonth() + (preset === "nextMonth" ? 1 : 0);
      setDateFrom(toDateString(new Date(now.getFullYear(), month, 1)));
      setDateTo(toDateString(new Date(now.getFullYear(), month + 1, 0)));
      return;
    }

    const base = new Date();
    if (preset === "tomorrow") {
      const tomorrowDate = addDays(base, 1);
      setDateFrom(toDateString(tomorrowDate));
      setDateTo(toDateString(tomorrowDate));
      return;
    }

    if (preset === "week") {
      const day = base.getDay();
      const daysFromMonday = day === 0 ? 6 : day - 1;
      const monday = addDays(base, -daysFromMonday);
      setDateFrom(toDateString(monday));
      setDateTo(toDateString(addDays(monday, 6)));
      return;
    }

    setDateFrom(toDateString(base));
    setDateTo(toDateString(base));
  }

  if (checkingSession) {
    return (
      <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-4">
        <div
          className="flex items-center gap-3 text-sm text-slate-500"
          role="status"
        >
          <LoaderCircle
            size={20}
            className="animate-spin text-emerald-700"
            aria-hidden="true"
          />
          管理画面を準備しています
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-[#f6f7f5]">
        <header className="border-b border-border bg-white/90">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
            <Link
              href="/"
              className="flex items-center gap-3 font-bold tracking-tight text-slate-900"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-800 text-white">
                <CalendarDays size={20} aria-hidden="true" />
              </span>
              作業予定管理
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-emerald-800"
              href="/"
            >
              入力画面へ
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </header>

        <div className="mx-auto grid max-w-md px-5 py-14 sm:py-24">
          <h1 className="mb-6 text-2xl font-bold text-slate-900">管理画面</h1>
          <form
            onSubmit={login}
            className="compact-panel grid w-full gap-6 p-6 sm:p-8"
            aria-busy={loginLoading}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
                <LogIn size={19} aria-hidden="true" />
              </span>
              <h2 className="text-lg font-bold tracking-tight text-slate-950">
                管理画面にログイン
              </h2>
            </div>
            {message ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {message}
              </div>
            ) : null}
            <label className="field">
              <span className="label">パスワード</span>
              <input
                className="input"
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="管理者パスワードを入力"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button
              className="btn btn-primary w-full"
              type="submit"
              disabled={loginLoading}
            >
              {loginLoading ? (
                <LoaderCircle
                  size={18}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <LogIn size={18} aria-hidden="true" />
              )}
              {loginLoading ? "ログインしています…" : "ログイン"}
            </button>
          </form>
          <p className="mt-6 text-center text-xs leading-6 text-slate-500">
            作業予定の登録は
            <Link
              href="/"
              className="ml-1 font-medium text-emerald-800 underline underline-offset-4"
            >
              入力画面
            </Link>
            から行えます。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f5]">
      <header className="border-b border-border bg-white/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-800 text-white">
              <CalendarDays size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="font-bold tracking-tight text-slate-950">
                作業予定管理
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              className="btn btn-secondary px-3 text-xs sm:text-sm"
              href="/"
            >
              入力画面へ
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
            <button
              className="btn btn-secondary px-3"
              type="button"
              onClick={logout}
              aria-label="ログアウト"
            >
              <LogOut size={17} aria-hidden="true" />
              <span className="hidden sm:inline">ログアウト</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-7 sm:px-6 sm:py-9">
        <nav
          className="flex gap-2 border-b border-slate-200"
          aria-label="管理画面メニュー"
        >
          <button
            className={`flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors sm:px-4 ${activeTab === "schedules" ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            type="button"
            aria-pressed={activeTab === "schedules"}
            onClick={() => {
              setActiveTab("schedules");
              setMessage("");
            }}
          >
            <CalendarDays size={18} aria-hidden="true" />
            作業予定確認
          </button>
          <button
            className={`flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors sm:px-4 ${activeTab === "companies" ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            type="button"
            aria-pressed={activeTab === "companies"}
            onClick={() => {
              setActiveTab("companies");
              setMessage("");
            }}
          >
            <Building2 size={18} aria-hidden="true" />
            協力会社一覧
          </button>
        </nav>

        {message ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {message}
          </div>
        ) : null}

        {activeTab === "schedules" ? (
          <div className="grid grid-cols-2 gap-2 sm:gap-4" aria-live="polite">
            <AdminStat
              icon={<ClipboardList size={18} aria-hidden="true" />}
              label="予定件数"
              value={summaryRows.length}
              unit="件"
            />
            <AdminStat
              icon={<Users size={18} aria-hidden="true" />}
              label="合計作業人数"
              value={totalWorkerCount}
              unit="人"
              accent
            />
          </div>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
          className={`${activeTab === "schedules" ? "grid" : "hidden"} panel gap-5 p-4 sm:p-6`}
          aria-label="作業予定を検索"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Search size={16} className="text-emerald-700" aria-hidden="true" />
            検索条件
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={
                rangePreset === "today"
                  ? "btn btn-primary h-10"
                  : "btn btn-secondary h-10"
              }
              type="button"
              aria-pressed={rangePreset === "today"}
              onClick={() => setQuickRange("today")}
            >
              今日
            </button>
            <button
              className={
                rangePreset === "tomorrow"
                  ? "btn btn-primary h-10"
                  : "btn btn-secondary h-10"
              }
              type="button"
              aria-pressed={rangePreset === "tomorrow"}
              onClick={() => setQuickRange("tomorrow")}
            >
              明日
            </button>
            <button
              className={
                rangePreset === "week"
                  ? "btn btn-primary h-10"
                  : "btn btn-secondary h-10"
              }
              type="button"
              aria-pressed={rangePreset === "week"}
              onClick={() => setQuickRange("week")}
            >
              今週
            </button>
            <button
              className={
                rangePreset === "custom"
                  ? "btn btn-primary h-10"
                  : "btn btn-secondary h-10"
              }
              type="button"
              aria-pressed={rangePreset === "custom"}
              onClick={() => setQuickRange("custom")}
            >
              <CalendarRange size={18} aria-hidden="true" />
              任意期間
            </button>
            <div className="flex min-h-10 items-center text-sm font-semibold text-slate-600">
              {dateFrom === dateTo ? dateFrom : `${dateFrom} - ${dateTo}`}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "month", label: "今月" },
                { value: "nextMonth", label: "来月" },
                { value: "selectMonth", label: "月指定" },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                className={
                  rangePreset === item.value
                    ? "btn btn-primary"
                    : "btn btn-secondary"
                }
                aria-pressed={rangePreset === item.value}
                onClick={() => setQuickRange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {rangePreset === "selectMonth" && (
            <label className="field max-w-xs">
              <span className="label">対象の月</span>
              <input
                type="month"
                className="input"
                value={dateFrom.slice(0, 7)}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!/^\d{4}-\d{2}$/.test(value)) return;
                  const [year, month] = value.split("-").map(Number);
                  setDateFrom(`${value}-01`);
                  setDateTo(toDateString(new Date(year, month, 0)));
                }}
              />
            </label>
          )}
          {rangePreset === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2 md:max-w-xl">
              <label className="field">
                <span className="label">開始日</span>
                <input
                  className="input"
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">終了日</span>
                <input
                  className="input"
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.7fr_auto]">
            <label className="field">
              <span className="label">一次会社</span>
              <input
                className="input"
                list="admin-primary-companies"
                value={primaryCompany}
                onChange={(event) => setPrimaryCompany(event.target.value)}
                placeholder="すべての一次会社"
              />
              <datalist id="admin-primary-companies">
                {primaryCompanyOptions.map((company) => (
                  <option key={company} value={company} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span className="label">二次会社</span>
              <input
                className="input"
                list="admin-secondary-companies"
                value={secondaryCompany}
                onChange={(event) => setSecondaryCompany(event.target.value)}
                placeholder="すべての二次会社"
              />
              <datalist id="admin-secondary-companies">
                {secondaryCompanyOptions.map((company) => (
                  <option key={company} value={company} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span className="label">表示する予定</span>
              <select
                className="input"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
              >
                <option value="work">作業あり</option>
                <option value="no_work">作業なし</option>
              </select>
            </label>
            <button
              className="btn btn-primary self-end"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <LoaderCircle
                  size={18}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Search size={18} aria-hidden="true" />
              )}
              {loading ? "取得中…" : "予定を検索"}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div className="text-xs leading-6 text-slate-500">
              {hasPendingFilters ? (
                <span className="font-medium text-amber-700">
                  検索条件が変更されています。「予定を検索」で一覧を更新してください。
                </span>
              ) : (
                "条件を設定して「予定を検索」で一覧を更新します。"
              )}
            </div>
          </div>
        </form>

        <section
          className={`${activeTab === "companies" ? "grid" : "hidden"} panel gap-5 p-4 sm:p-6`}
        >
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">協力会社一覧</h2>
              <p className="mt-1 text-sm text-slate-600">
                入力画面に表示する会社名と順番を管理します。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              一次 {companyGroups.length}社 / 登録 {companyRows.length}件
            </span>
          </div>

          <div className="grid items-start gap-4 rounded-xl bg-slate-50 p-4 md:grid-cols-[1fr_1fr_1.5fr_auto]">
            <label className="field">
              <span className="label">一次会社</span>
              <input
                className="input"
                id="add-company-primary"
                value={newPrimaryCompany}
                onChange={(event) => setNewPrimaryCompany(event.target.value)}
                placeholder="例: 山田設備"
              />
            </label>
            <label className="field">
              <span className="label">職種</span>
              <input
                className="input"
                value={newPrimaryRoles}
                onChange={(event) => setNewPrimaryRoles(event.target.value)}
                placeholder="例: 多能工、配管工"
              />
            </label>
            <label className="field">
              <span className="label">二次会社（複数入力可・1行に1社）</span>
              <textarea
                className="textarea min-h-28"
                value={newSecondaryCompanies}
                onChange={(event) =>
                  setNewSecondaryCompanies(event.target.value)
                }
                placeholder={"例:\n山田配管工業\n鈴木電設\n佐藤工業"}
              />
            </label>
            <button
              className="btn btn-primary md:mt-6"
              type="button"
              onClick={() => void addCompanyMaster()}
              disabled={companyLoading}
            >
              <Plus size={17} aria-hidden="true" />
              まとめて追加
            </button>
          </div>

          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-sm text-slate-700">
              {selectedPrimaryCompany ? (
                <>
                  <span className="font-bold text-emerald-900">
                    {selectedPrimaryCompany}
                  </span>{" "}
                  の登録をまとめて移動します
                </>
              ) : (
                "一覧の一次会社名をクリックすると、その会社をまとめて並び替えられます。"
              )}
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary h-9 px-3"
                type="button"
                disabled={companyLoading || selectedPrimaryIndex <= 0}
                onClick={() =>
                  selectedPrimaryCompany &&
                  void movePrimaryCompany(selectedPrimaryCompany, -1)
                }
              >
                <ArrowUp size={16} aria-hidden="true" /> 上へ
              </button>
              <button
                className="btn btn-secondary h-9 px-3"
                type="button"
                disabled={
                  companyLoading ||
                  selectedPrimaryIndex < 0 ||
                  selectedPrimaryIndex >= companyGroups.length - 1
                }
                onClick={() =>
                  selectedPrimaryCompany &&
                  void movePrimaryCompany(selectedPrimaryCompany, 1)
                }
              >
                <ArrowDown size={16} aria-hidden="true" /> 下へ
              </button>
            </div>
          </div>

          <div className="grid gap-3">
            {companyGroups.length === 0 && (
              <p className="py-6 text-center text-slate-500">
                協力会社がまだ登録されていません
              </p>
            )}
            {companyGroups.map((group) => (
              <details
                key={group.primaryCompany}
                className="rounded-xl border border-border bg-white"
                onToggle={(event) => {
                  if (event.currentTarget.open)
                    setSelectedPrimaryCompany(group.primaryCompany);
                }}
              >
                <summary className="cursor-pointer rounded-xl px-4 py-4 font-semibold text-slate-900 marker:text-emerald-700">
                  <span className="break-words">{group.primaryCompany}</span>
                  <span className="ml-3 text-sm font-normal text-slate-500">
                    二次会社{" "}
                    {group.rows.filter((row) => row.secondary_company).length}社
                  </span>
                </summary>
                <div className="grid gap-3 border-t border-border p-3 sm:p-4">
                  <button
                    type="button"
                    className="btn btn-secondary justify-self-start"
                    onClick={() => {
                      setNewPrimaryCompany(group.primaryCompany);
                      setNewSecondaryCompanies("");
                      document.getElementById("add-company-primary")?.focus();
                    }}
                  >
                    この一次会社に追加
                  </button>
                  {group.rows.map((row) => (
                    <div
                      key={row.id}
                      className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      {editingCompanyId === row.id ? (
                        <div className="grid gap-3">
                          <label className="field">
                            <span className="label">一次会社</span>
                            <input
                              className="input"
                              value={editPrimaryCompany}
                              onChange={(event) =>
                                setEditPrimaryCompany(event.target.value)
                              }
                              aria-label="一次会社を編集"
                            />
                          </label>
                          <label className="field">
                            <span className="label">二次会社</span>
                            <input
                              className="input"
                              value={editSecondaryCompany}
                              onChange={(event) =>
                                setEditSecondaryCompany(event.target.value)
                              }
                              aria-label="二次会社を編集"
                            />
                          </label>
                          <label className="field">
                            <span className="label">職種</span>
                            <input
                              className="input"
                              value={editPrimaryRoles}
                              onChange={(event) =>
                                setEditPrimaryRoles(event.target.value)
                              }
                              aria-label="職種を編集"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <p className="break-words font-semibold">
                            {row.secondary_company || "一次会社のみ"}
                          </p>
                          <div className="mt-2">
                            <RoleBadges roles={row.primary_trade_roles ?? []} />
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        {editingCompanyId === row.id ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={companyLoading}
                              onClick={() => void saveCompanyMaster()}
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setEditingCompanyId(null)}
                            >
                              キャンセル
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={companyLoading}
                              onClick={() => startEditingCompany(row)}
                              aria-label={`${row.secondary_company || row.primary_company}を編集`}
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary text-red-700"
                              disabled={companyLoading}
                              onClick={() => void removeCompanyMaster(row.id)}
                              aria-label={`${row.secondary_company || row.primary_company}を削除`}
                            >
                              削除
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section
          className={`${activeTab === "schedules" ? "flex" : "hidden"} flex-wrap items-center justify-between gap-4 pt-2`}
          aria-label="検索結果の表示設定"
        >
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              作業予定{" "}
              <span className="ml-1 text-sm font-medium text-slate-500">
                {summaryRows.length}件
              </span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {appliedFilters.dateFrom === appliedFilters.dateTo
                ? appliedFilters.dateFrom
                : `${appliedFilters.dateFrom} 〜 ${appliedFilters.dateTo}`}{" "}
              ・{" "}
              {appliedFilters.statusFilter === "work" ? "作業あり" : "作業なし"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label>
              <span className="sr-only">並び替え</span>
              <select
                className="input h-11 w-auto text-xs"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortBy)}
              >
                <option value="dateAsc">日付が早い順</option>
                <option value="dateDesc">日付が遅い順</option>
                <option value="primaryAsc">一次会社順</option>
              </select>
            </label>
            <div role="group" aria-label="表示形式">
              <div className="inline-flex h-11 gap-1 rounded-xl border border-border bg-white p-1">
                <button
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${scheduleView === "summary" ? "bg-emerald-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                  type="button"
                  aria-pressed={scheduleView === "summary"}
                  onClick={() => setScheduleView("summary")}
                >
                  <List size={17} aria-hidden="true" />
                  一覧
                </button>
                <button
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${scheduleView === "calendar" ? "bg-emerald-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                  type="button"
                  aria-pressed={scheduleView === "calendar"}
                  onClick={() => setScheduleView("calendar")}
                >
                  <Table2 size={17} aria-hidden="true" />
                  カレンダー
                </button>
              </div>
            </div>
          </div>
        </section>

        <section
          className={`${activeTab === "schedules" && scheduleView === "summary" ? "block" : "hidden"} overflow-hidden rounded-2xl border border-border bg-white`}
          aria-label="作業予定一覧"
          aria-busy={loading}
        >
          <div className="grid divide-y divide-slate-100 md:hidden">
            {summaryRows.length === 0 ? (
              <ScheduleEmpty loading={loading} />
            ) : (
              summaryRows.map((row) => {
                const expanded = expandedScheduleKeys.includes(row.key);
                return (
                  <article key={row.key} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-emerald-800"
                          type="button"
                          aria-expanded={expanded}
                          aria-label={`${row.workDate} ${row.primaryCompany}の人数内訳`}
                          onClick={() => toggleScheduleRow(row.key)}
                        >
                          {expanded ? (
                            <ChevronDown size={17} aria-hidden="true" />
                          ) : (
                            <ChevronRight size={17} aria-hidden="true" />
                          )}
                          {row.workDate}
                        </button>
                        <h3 className="mt-1.5 break-words font-bold text-slate-900">
                          <CopyValue
                            value={row.primaryCompany}
                            label="一次会社"
                          />
                        </h3>
                      </div>
                      <span className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-lg font-bold tabular-nums text-emerald-800">
                        <CopyValue value={row.totalCount} label="合計人数">
                          {row.totalCount}
                          <span className="ml-1 text-xs font-medium">人</span>
                        </CopyValue>
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-2 text-xs leading-6">
                      <dt className="text-slate-500">作業エリア</dt>
                      <dd className="break-words text-slate-800">
                        <CopyValue value={row.workArea} label="作業エリア" />
                      </dd>
                      <dt className="text-slate-500">作業内容</dt>
                      <dd className="break-words text-slate-800">
                        <CopyValue value={row.workContent} label="作業内容" />
                      </dd>
                      {appliedFilters.statusFilter === "no_work" &&
                      row.nextVisitDate ? (
                        <>
                          <dt className="text-slate-500">次回来場</dt>
                          <dd className="text-slate-800">
                            <CopyValue
                              value={row.nextVisitDate}
                              label="次回来場"
                            />
                          </dd>
                        </>
                      ) : null}
                    </dl>
                    {expanded ? <ScheduleDetails row={row} /> : null}
                  </article>
                );
              })
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[900px] w-full border-collapse text-sm">
              <caption className="sr-only">
                会社ごとの作業予定と人数の内訳
              </caption>
              <thead className="border-b border-border bg-slate-50 text-xs text-slate-500">
                <tr>
                  {[
                    "作業日",
                    "一次会社",
                    "合計人数",
                    "作業エリア",
                    "作業内容",
                    "内訳",
                  ].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="whitespace-nowrap px-4 py-4 text-left font-semibold"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <ScheduleEmpty loading={loading} />
                    </td>
                  </tr>
                ) : (
                  summaryRows.map((row) => {
                    const expanded = expandedScheduleKeys.includes(row.key);
                    return (
                      <tr
                        key={row.key}
                        className="border-t border-border align-top"
                      >
                        <td className="whitespace-nowrap px-3 py-3">
                          <button
                            className="inline-flex min-h-11 items-center gap-1 font-semibold text-emerald-800 hover:text-emerald-950"
                            type="button"
                            aria-expanded={expanded}
                            aria-label={`${row.workDate} ${row.primaryCompany}の人数内訳`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleScheduleRow(row.key);
                            }}
                          >
                            {expanded ? (
                              <ChevronDown size={17} aria-hidden="true" />
                            ) : (
                              <ChevronRight size={17} aria-hidden="true" />
                            )}
                            {row.workDate}
                          </button>
                          {appliedFilters.statusFilter === "no_work" &&
                          row.nextVisitDate ? (
                            <div className="mt-1 text-xs text-slate-500">
                              来場予定 {row.nextVisitDate}
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold">
                          <CopyValue
                            value={row.primaryCompany}
                            label="一次会社"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-emerald-800">
                          <CopyValue value={row.totalCount} label="合計人数">
                            {row.totalCount}
                            <span className="ml-1 text-xs font-normal text-slate-400">
                              人
                            </span>
                          </CopyValue>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <CopyValue value={row.workArea} label="作業エリア" />
                        </td>
                        <td className="min-w-56 px-3 py-3">
                          <CopyValue value={row.workContent} label="作業内容" />
                        </td>
                        <td className="px-3 py-3">
                          {expanded ? (
                            <ScheduleDetails row={row} />
                          ) : (
                            <span className="text-xs text-slate-400">
                              二次会社 {row.details.length}社
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section
          className={`${activeTab === "schedules" && scheduleView === "calendar" ? "grid" : "hidden"} gap-3`}
        >
          <div className="overflow-x-auto rounded-2xl border border-border bg-white">
            <div className="min-w-[630px]">
              <div className="grid grid-cols-7 border-b border-border bg-slate-50 text-center text-xs font-semibold text-slate-500">
                {["月", "火", "水", "木", "金", "土", "日"].map((day) => (
                  <div key={day} className="px-2 py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 bg-border gap-px">
                {calendarDays.leadingBlanks.map((blank) => (
                  <div key={blank} className="min-h-28 bg-slate-50" />
                ))}
                {calendarDays.days.map((day) => {
                  const rows = calendarRowsByDate[day] ?? [];
                  const selected = selectedCalendarDate === day;
                  return (
                    <div
                      key={day}
                      className={`min-h-32 bg-white p-2 text-left align-top ${selected ? "ring-2 ring-inset ring-emerald-700" : ""}`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-1">
                        <button
                          type="button"
                          className="min-h-11 whitespace-nowrap rounded px-1 text-sm font-bold text-emerald-800 hover:bg-emerald-50"
                          aria-expanded={selected}
                          aria-label={`${day}の予定`}
                          onClick={() =>
                            setSelectedCalendarDate(selected ? null : day)
                          }
                        >
                          {`${Number(day.slice(5, 7))}月${Number(day.slice(8))}日`}
                        </button>
                      </div>
                      <div className="grid gap-1">
                        {rows.slice(0, 3).map((row) => (
                          <button
                            key={row.key}
                            type="button"
                            className="flex min-h-8 w-full items-center gap-1 rounded bg-slate-50 px-1.5 text-left text-xs hover:bg-emerald-50"
                            onClick={() => setSelectedCalendarDate(day)}
                            title={`${row.primaryCompany} / ${row.totalCount}人`}
                          >
                            <span className="min-w-0 truncate">
                              {row.primaryCompany}
                            </span>
                            <span className="shrink-0 font-semibold">
                              / {row.totalCount}人
                            </span>
                          </button>
                        ))}
                        {rows.length > 3 && (
                          <button
                            type="button"
                            className="min-h-8 text-xs font-semibold text-emerald-800"
                            onClick={() => setSelectedCalendarDate(day)}
                          >
                            ほか{rows.length - 3}社を表示
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-950">
                {selectedCalendarDate
                  ? `${selectedCalendarDate} の詳細`
                  : "日付ごとの予定"}
              </h2>
              {selectedCalendarDate ? (
                <span className="text-sm font-semibold text-slate-600">
                  {selectedCalendarRows.length} 件
                </span>
              ) : null}
            </div>
            {!selectedCalendarDate ? (
              <p className="text-sm text-slate-500">
                カレンダーの日付をクリックすると詳細を表示します。
              </p>
            ) : selectedCalendarRows.length === 0 ? (
              <p className="text-sm text-slate-500">
                この日の予定はありません。
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {selectedCalendarRows.map((row) => (
                  <div
                    key={row.key}
                    className="rounded-xl border border-border p-3 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-950">
                          <CopyValue
                            value={row.primaryCompany}
                            label="一次会社"
                          />
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          <CopyValue value={row.workArea} label="作業エリア" />
                        </div>
                      </div>
                      <div className="shrink-0 rounded bg-slate-100 px-2 py-1 text-sm font-bold text-slate-900">
                        <CopyValue value={row.totalCount} label="合計人数">
                          {row.totalCount}人
                        </CopyValue>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      <CopyValue value={row.workContent} label="作業内容" />
                    </div>
                    <ScheduleDetails row={row} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function CopyValue({
  value,
  label,
  children,
}: {
  value: string | number;
  label: string;
  children?: ReactNode;
}) {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);
  if (value === "") return <span className="text-slate-400">—</span>;
  return (
    <>
      <button
        type="button"
        className="min-h-9 max-w-full rounded px-1 text-left whitespace-pre-wrap break-words underline-offset-4 hover:bg-emerald-50 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
        title={`${label}をコピー`}
        aria-label={`${label}をコピー：${value}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(String(value));
            setNotice(`${label}をコピーしました`);
          } catch {
            setNotice("コピーできませんでした。もう一度お試しください。");
          }
        }}
      >
        {children ?? value}
      </button>
      {notice && (
        <span
          role="status"
          className="fixed bottom-5 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 rounded-xl bg-slate-800 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          {notice}
        </span>
      )}
    </>
  );
}

function AdminStat({
  icon,
  label,
  value,
  unit,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 sm:p-5 ${accent ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-white"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={`text-[10px] font-medium sm:text-xs ${accent ? "text-emerald-800" : "text-slate-500"}`}
        >
          {label}
        </p>
        <span
          className={`hidden sm:block ${accent ? "text-emerald-600" : "text-slate-400"}`}
        >
          {icon}
        </span>
      </div>
      <p
        className={`mt-3 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl ${accent ? "text-emerald-900" : "text-slate-900"}`}
      >
        {value.toLocaleString("ja-JP")}
        <span className="ml-1.5 text-xs font-medium text-slate-500">
          {unit}
        </span>
      </p>
    </div>
  );
}

function ScheduleEmpty({ loading }: { loading: boolean }) {
  return (
    <div
      className="flex flex-col items-center px-5 py-14 text-center"
      role="status"
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-slate-50 text-slate-400">
        {loading ? (
          <LoaderCircle size={22} className="animate-spin" aria-hidden="true" />
        ) : (
          <CalendarDays size={22} aria-hidden="true" />
        )}
      </span>
      <p className="mt-4 text-sm font-semibold text-slate-700">
        {loading ? "作業予定を取得しています" : "該当する予定はありません"}
      </p>
      {!loading ? (
        <p className="mt-2 text-xs leading-6 text-slate-500">
          日付や会社名などの検索条件を変更してお試しください。
        </p>
      ) : null}
    </div>
  );
}

function ScheduleDetails({ row }: { row: ScheduleSummaryRow }) {
  return (
    <div className="mt-2 grid min-w-40 gap-1 rounded-xl bg-slate-50 p-2 text-xs text-slate-600">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-white px-3 py-2.5">
        <span className="font-semibold text-slate-900">
          <CopyValue value={row.primaryCompany} label="一次会社" />
        </span>
        <span className="text-right font-bold tabular-nums">
          <CopyValue value={row.primaryCount} label="一次会社人数">
            {row.primaryCount}人
          </CopyValue>
        </span>
      </div>
      {row.details.length > 0 ? (
        row.details.map((detail, index) => (
          <div
            key={`${detail.company}-${index}`}
            className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2"
          >
            <span>
              <CopyValue value={detail.company} label="二次会社" />
            </span>
            <span className="text-right font-semibold tabular-nums">
              <CopyValue value={detail.count} label="二次会社人数">
                {detail.count}人
              </CopyValue>
            </span>
          </div>
        ))
      ) : (
        <p className="px-3 py-2 text-slate-400">二次会社なし</p>
      )}
    </div>
  );
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "ja");
}

function RoleBadges({ roles }: { roles: string[] }) {
  if (roles.length === 0) return <span className="text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <span
          key={role}
          className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
        >
          {role}
        </span>
      ))}
    </div>
  );
}

function buildScheduleSummaryRows(
  rows: ExportRow[],
  statusFilter: StatusFilter,
): ScheduleSummaryRow[] {
  const groups = new Map<string, ScheduleSummaryRow>();

  for (const row of rows) {
    const workArea = statusFilter === "work" ? row.workArea : row.nextWorkArea;
    const workContent =
      statusFilter === "work" ? row.workContent : row.nextWorkContent;
    const primaryCount =
      statusFilter === "work" ? row.primaryCount : row.nextPrimaryCount;
    const secondaryCompany =
      statusFilter === "work" ? row.secondaryCompany : row.nextSecondaryCompany;
    const secondaryCount =
      statusFilter === "work" ? row.secondaryCount : row.nextSecondaryCount;
    const key = [
      statusFilter,
      row.workDate,
      row.primaryCompany,
      row.nextVisitDate,
      workArea,
      workContent,
    ].join("::");

    if (!groups.has(key)) {
      const primaryCountNumber = numberValue(primaryCount);
      groups.set(key, {
        key,
        workDate: row.workDate,
        primaryCompany: row.primaryCompany,
        primaryCount,
        totalCount: primaryCountNumber,
        workArea,
        workContent,
        nextVisitDate: row.nextVisitDate,
        details: [],
      });
    }

    const group = groups.get(key);
    if (!group) continue;

    if (secondaryCompany || secondaryCount !== "") {
      group.details.push({ company: secondaryCompany, count: secondaryCount });
      group.totalCount += numberValue(secondaryCount);
    }
  }

  return [...groups.values()];
}

function groupSummaryRowsByDate(rows: ScheduleSummaryRow[]) {
  return rows.reduce<Record<string, ScheduleSummaryRow[]>>((acc, row) => {
    acc[row.workDate] ??= [];
    acc[row.workDate].push(row);
    return acc;
  }, {});
}

function buildCalendarDays(dateFrom: string, dateTo: string) {
  const start = localDate(dateFrom);
  const end = localDate(dateTo);
  if (!start || !end || start > end)
    return { days: [], leadingBlanks: [] as string[] };

  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(toDateString(cursor));
    cursor = addDays(cursor, 1);
  }

  const mondayBasedIndex = (start.getDay() + 6) % 7;
  return {
    days,
    leadingBlanks: Array.from(
      { length: mondayBasedIndex },
      (_, index) => `blank-${index}`,
    ),
  };
}

function localDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function numberValue(value: number | "") {
  return typeof value === "number" ? value : 0;
}

function parseRoleText(value: string) {
  return [
    ...new Set(
      value
        .split(/\r?\n|,|、/)
        .map((role) => role.trim())
        .filter(Boolean),
    ),
  ];
}

function formatRoles(roles: string[] | null | undefined) {
  return (roles ?? []).join("、");
}
