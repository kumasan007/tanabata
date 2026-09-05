"use client";

import {
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Download,
  List,
  LogIn,
  LogOut,
  Pencil,
  Save,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CompanyMaster, CompanyMasterRow, ExportRow } from "@/lib/types";
import { addDays, toDateString } from "@/lib/utils";

type AdminResult = {
  rows: ExportRow[];
  count: number;
};

type RangePreset = "today" | "tomorrow" | "week" | "custom";
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
  const [activeTab, setActiveTab] = useState<AdminTab>("schedules");
  const [rangePreset, setRangePreset] = useState<RangePreset>("tomorrow");
  const [dateFrom, setDateFrom] = useState(tomorrow);
  const [dateTo, setDateTo] = useState(tomorrow);
  const [primaryCompany, setPrimaryCompany] = useState("");
  const [secondaryCompany, setSecondaryCompany] = useState("");
  const [companyMaster, setCompanyMaster] = useState<CompanyMaster | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("work");
  const [sortBy, setSortBy] = useState<SortBy>("dateAsc");
  const [scheduleView, setScheduleView] = useState<ScheduleView>("summary");
  const [expandedScheduleKeys, setExpandedScheduleKeys] = useState<string[]>([]);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [result, setResult] = useState<AdminResult>({ rows: [], count: 0 });
  const [companyRows, setCompanyRows] = useState<CompanyMasterRow[]>([]);
  const [newPrimaryCompany, setNewPrimaryCompany] = useState("");
  const [newSecondaryCompanies, setNewSecondaryCompanies] = useState("");
  const [newPrimaryRoles, setNewPrimaryRoles] = useState("");
  const [selectedPrimaryCompany, setSelectedPrimaryCompany] = useState<string | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editPrimaryCompany, setEditPrimaryCompany] = useState("");
  const [editSecondaryCompany, setEditSecondaryCompany] = useState("");
  const [editPrimaryRoles, setEditPrimaryRoles] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);

  const visibleRows = useMemo(() => {
    const filtered = result.rows.filter((row) => {
      if (statusFilter === "work" && row.status !== "作業あり") return false;
      if (statusFilter === "no_work" && row.status !== "作業なし") return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "dateDesc") return compareText(b.workDate, a.workDate) || compareText(a.primaryCompany, b.primaryCompany);
      if (sortBy === "primaryAsc") return compareText(a.primaryCompany, b.primaryCompany) || compareText(a.workDate, b.workDate);
      return compareText(a.workDate, b.workDate) || compareText(a.primaryCompany, b.primaryCompany);
    });
  }, [result.rows, sortBy, statusFilter]);

  const summaryRows = useMemo(() => buildScheduleSummaryRows(visibleRows, statusFilter), [visibleRows, statusFilter]);
  const calendarDays = useMemo(() => buildCalendarDays(dateFrom, dateTo), [dateFrom, dateTo]);
  const calendarRowsByDate = useMemo(() => groupSummaryRowsByDate(summaryRows), [summaryRows]);
  const selectedCalendarRows = selectedCalendarDate ? calendarRowsByDate[selectedCalendarDate] ?? [] : [];
  const totalWorkerCount = summaryRows.reduce((sum, row) => sum + row.totalCount, 0);

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
    return [...groups].map(([primaryCompanyName, rows]) => ({ primaryCompany: primaryCompanyName, rows }));
  }, [companyRows]);
  const selectedPrimaryIndex = companyGroups.findIndex((group) => group.primaryCompany === selectedPrimaryCompany);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((response) => response.json())
      .then((body) => setAuthenticated(Boolean(body.authenticated)))
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    void Promise.all([refreshCompanyOptions(), refreshCompanyMaster()]).catch((error) => {
      setCompanyMaster(null);
      setMessage(error instanceof Error ? error.message : "会社マスタの取得に失敗しました。");
    });
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

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
    const body = await response.json();

    if (!response.ok) {
      setMessage(body.error ?? "ログインに失敗しました。");
      return;
    }

    setPassword("");
    setAuthenticated(true);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setResult({ rows: [], count: 0 });
    window.location.href = "/";
  }

  async function search() {
    if (!authenticated) return;
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/schedules?${queryString()}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "取得に失敗しました。");
      setResult({ rows: body.rows ?? [], count: body.count ?? 0 });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function refreshCompanyMaster() {
    const response = await fetch("/api/admin/company-master", { headers: { accept: "application/json" } });
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
    if (!response.ok) throw new Error(body.error ?? "会社一覧を取得できませんでした。");
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

    setMessage("");
    setCompanyLoading(true);

    try {
      const response = await fetch("/api/admin/company-master", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ primaryCompany, secondaryCompanies, primaryTradeRoles }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "会社マスタの追加に失敗しました。");

      setNewPrimaryCompany("");
      setNewSecondaryCompanies("");
      setNewPrimaryRoles("");
      await Promise.all([refreshCompanyMaster(), refreshCompanyOptions()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "会社マスタの追加に失敗しました。");
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
      const response = await fetch(`/api/admin/company-master?${params.toString()}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "会社マスタの削除に失敗しました。");

      if (editingCompanyId === id) setEditingCompanyId(null);
      await Promise.all([refreshCompanyMaster(), refreshCompanyOptions()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "会社マスタの削除に失敗しました。");
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
      if (!response.ok) throw new Error(body.error ?? "会社マスタの更新に失敗しました。");

      setEditingCompanyId(null);
      await Promise.all([refreshCompanyMaster(), refreshCompanyOptions()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "会社マスタの更新に失敗しました。");
    } finally {
      setCompanyLoading(false);
    }
  }

  async function movePrimaryCompany(primaryCompanyName: string, direction: -1 | 1) {
    const index = companyGroups.findIndex((group) => group.primaryCompany === primaryCompanyName);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= companyGroups.length) return;

    const reorderedGroups = [...companyGroups];
    [reorderedGroups[index], reorderedGroups[destination]] = [reorderedGroups[destination], reorderedGroups[index]];
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
      if (!response.ok) throw new Error(body.error ?? "並び順の保存に失敗しました。");
      await Promise.all([refreshCompanyMaster(), refreshCompanyOptions()]);
    } catch (error) {
      setCompanyRows(companyRows);
      setMessage(error instanceof Error ? error.message : "並び順の保存に失敗しました。");
    } finally {
      setCompanyLoading(false);
    }
  }

  async function download(format: "xlsx" | "csv") {
    if (!authenticated) return;
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/export?format=${format}&${queryString()}`);

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? "ダウンロードに失敗しました。");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = decodeFilename(disposition) ?? `作業予定.${format}`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ダウンロードに失敗しました。");
    } finally {
      setLoading(false);
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
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  function setQuickRange(preset: RangePreset) {
    setRangePreset(preset);

    if (preset === "custom") return;

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
        <div className="compact-panel grid gap-3 p-5">
          <h1 className="text-lg font-bold">管理画面</h1>
          <p className="text-sm text-slate-700">確認中</p>
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-slate-50">
        <header className="border-b border-border bg-white">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-4">
            <h1 className="text-xl font-bold text-slate-950">管理画面</h1>
            <Link className="btn btn-secondary h-11 px-3 text-sm" href="/">
              入力画面へ
            </Link>
          </div>
        </header>

        <div className="mx-auto grid max-w-md px-4 py-8">
          <form onSubmit={login} className="compact-panel grid w-full gap-4 p-5">
            <div>
              <h2 className="text-xl font-bold text-slate-950">ログイン</h2>
              <p className="mt-1 text-sm text-slate-600">作業予定確認</p>
            </div>
            {message ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{message}</div> : null}
            <label className="field">
              <span className="label">パスワード</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button className="btn btn-primary" type="submit">
              <LogIn size={18} aria-hidden="true" />
              ログイン
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-950">管理画面</h1>
            <p className="mt-1 text-sm text-slate-600">管理者ログイン中</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Link className="btn btn-secondary" href="/">
              入力画面へ
            </Link>
            <button className="btn btn-secondary" type="button" onClick={logout}>
              <LogOut size={18} aria-hidden="true" />
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4">
        <nav className="-mx-4 flex border-b border-border bg-white px-4 sm:mx-0 sm:rounded-t-md sm:border sm:border-b-0" role="tablist" aria-label="管理画面メニュー">
          <button
            className={`flex min-h-12 items-center gap-2 border-b-2 px-4 text-sm font-bold ${activeTab === "schedules" ? "border-sky-700 text-sky-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "schedules"}
            onClick={() => {
              setActiveTab("schedules");
              setMessage("");
            }}
          >
            <CalendarDays size={18} aria-hidden="true" />
            作業予定確認
          </button>
          <button
            className={`flex min-h-12 items-center gap-2 border-b-2 px-4 text-sm font-bold ${activeTab === "companies" ? "border-sky-700 text-sky-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "companies"}
            onClick={() => {
              setActiveTab("companies");
              setMessage("");
            }}
          >
            <Building2 size={18} aria-hidden="true" />
            協力会社一覧
          </button>
        </nav>

        {message ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">{message}</div> : null}

        <section className={`${activeTab === "schedules" ? "grid" : "hidden"} panel -mx-4 gap-3 px-4 py-4 sm:mx-0 sm:rounded-md sm:border`}>
          <div className="flex flex-wrap gap-2">
            <button
              className={rangePreset === "today" ? "btn btn-primary h-10" : "btn btn-secondary h-10"}
              type="button"
              onClick={() => setQuickRange("today")}
            >
              今日
            </button>
            <button
              className={rangePreset === "tomorrow" ? "btn btn-primary h-10" : "btn btn-secondary h-10"}
              type="button"
              onClick={() => setQuickRange("tomorrow")}
            >
              明日
            </button>
            <button
              className={rangePreset === "week" ? "btn btn-primary h-10" : "btn btn-secondary h-10"}
              type="button"
              onClick={() => setQuickRange("week")}
            >
              今週
            </button>
            <button
              className={rangePreset === "custom" ? "btn btn-primary h-10" : "btn btn-secondary h-10"}
              type="button"
              onClick={() => setQuickRange("custom")}
            >
              <CalendarRange size={18} aria-hidden="true" />
              任意期間
            </button>
            <div className="flex min-h-10 items-center text-sm font-semibold text-slate-600">
              {dateFrom === dateTo ? dateFrom : `${dateFrom} - ${dateTo}`}
            </div>
          </div>

          {rangePreset === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2 md:max-w-xl">
              <label className="field">
                <span className="label">開始日</span>
                <input className="input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </label>
              <label className="field">
                <span className="label">終了日</span>
                <input className="input" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </label>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="field">
              <span className="label">一次会社</span>
              <input
                className="input"
                list="admin-primary-companies"
                value={primaryCompany}
                onChange={(event) => setPrimaryCompany(event.target.value)}
                placeholder="入力または選択"
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
                placeholder="入力または選択"
              />
              <datalist id="admin-secondary-companies">
                {secondaryCompanyOptions.map((company) => (
                  <option key={company} value={company} />
                ))}
              </datalist>
            </label>
            <button className="btn btn-primary mt-6" type="button" onClick={search} disabled={loading}>
              <Search size={18} aria-hidden="true" />
              検索
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div className="text-sm font-semibold text-slate-700">
              予定 {result.count} 件 / 集約 {summaryRows.length} 件 / 合計 {totalWorkerCount} 人 / 出力 {result.rows.length} 行
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-secondary" type="button" onClick={() => download("csv")} disabled={loading}>
                <Download size={18} aria-hidden="true" />
                CSV
              </button>
              <button className="btn btn-primary" type="button" onClick={() => download("xlsx")} disabled={loading}>
                <Download size={18} aria-hidden="true" />
                Excel
              </button>
            </div>
          </div>
        </section>

        <section className={`${activeTab === "companies" ? "grid" : "hidden"} panel -mx-4 gap-4 px-4 py-4 sm:mx-0 sm:rounded-md sm:border`}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">協力会社一覧</h2>
              <p className="mt-1 text-sm text-slate-600">入力画面に表示する会社名と順番を管理します。</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">一次 {companyGroups.length}社 / 登録 {companyRows.length}件</span>
          </div>

          <div className="grid items-start gap-3 md:grid-cols-[1fr_1fr_1.5fr_auto]">
            <label className="field">
              <span className="label">一次会社</span>
              <input className="input" value={newPrimaryCompany} onChange={(event) => setNewPrimaryCompany(event.target.value)} placeholder="例: 山田設備" />
            </label>
            <label className="field">
              <span className="label">職種</span>
              <input className="input" value={newPrimaryRoles} onChange={(event) => setNewPrimaryRoles(event.target.value)} placeholder="例: 多能工、配管工" />
            </label>
            <label className="field">
              <span className="label">二次会社（複数入力可・1行に1社）</span>
              <textarea className="textarea min-h-28" value={newSecondaryCompanies} onChange={(event) => setNewSecondaryCompanies(event.target.value)} placeholder={"例:\n山田配管工業\n鈴木電設\n佐藤工業"} />
            </label>
            <button className="btn btn-primary mt-6" type="button" onClick={() => void addCompanyMaster()} disabled={companyLoading}>
              まとめて追加
            </button>
          </div>

          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2">
            <div className="text-sm text-slate-700">
              {selectedPrimaryCompany ? (
                <><span className="font-bold text-sky-900">{selectedPrimaryCompany}</span> の登録をまとめて移動します</>
              ) : "一覧の一次会社名をクリックすると、その会社をまとめて並び替えられます。"}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary h-9 px-3" type="button" disabled={companyLoading || selectedPrimaryIndex <= 0} onClick={() => selectedPrimaryCompany && void movePrimaryCompany(selectedPrimaryCompany, -1)}>
                <ArrowUp size={16} aria-hidden="true" /> 上へ
              </button>
              <button className="btn btn-secondary h-9 px-3" type="button" disabled={companyLoading || selectedPrimaryIndex < 0 || selectedPrimaryIndex >= companyGroups.length - 1} onClick={() => selectedPrimaryCompany && void movePrimaryCompany(selectedPrimaryCompany, 1)}>
                <ArrowDown size={16} aria-hidden="true" /> 下へ
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-slate-50">
            <div className="max-h-[36rem] overflow-auto">
              <table className="min-w-[900px] w-full border-collapse text-sm">
                <thead className="bg-slate-200 text-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left">一次会社</th>
                    <th className="px-3 py-2 text-left">職種</th>
                    <th className="px-3 py-2 text-left">二次会社</th>
                    <th className="w-40 px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {companyRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                        協力会社がまだ登録されていません
                      </td>
                    </tr>
                  ) : (
                    companyGroups.flatMap((group) => group.rows).map((row) => (
                      <tr key={row.id} className={`border-t border-border ${selectedPrimaryCompany === row.primary_company ? "bg-sky-50" : "bg-white"}`}>
                        <td className="px-3 py-2">
                          {editingCompanyId === row.id ? (
                            <input className="input h-10" value={editPrimaryCompany} onChange={(event) => setEditPrimaryCompany(event.target.value)} aria-label="一次会社を編集" />
                          ) : (
                            <button className={`rounded px-2 py-1 text-left font-semibold ${selectedPrimaryCompany === row.primary_company ? "bg-sky-700 text-white" : "text-sky-800 hover:bg-sky-100"}`} type="button" onClick={() => setSelectedPrimaryCompany(row.primary_company)}>
                              {row.primary_company}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editingCompanyId === row.id ? (
                            <input className="input h-10" value={editPrimaryRoles} onChange={(event) => setEditPrimaryRoles(event.target.value)} aria-label="職種を編集" placeholder="例: 多能工、配管工" />
                          ) : (
                            <RoleBadges roles={row.primary_trade_roles ?? []} />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editingCompanyId === row.id ? (
                            <input className="input h-10" value={editSecondaryCompany} onChange={(event) => setEditSecondaryCompany(event.target.value)} aria-label="二次会社を編集" placeholder="空欄可" />
                          ) : row.secondary_company ?? "-"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex justify-center gap-1">
                            {editingCompanyId === row.id ? (
                              <>
                                <button className="btn btn-primary h-8 px-2 text-xs" type="button" disabled={companyLoading} onClick={() => void saveCompanyMaster()}>
                                  <Save size={14} aria-hidden="true" /> 保存
                                </button>
                                <button className="btn btn-secondary h-8 w-8 p-0" type="button" title="キャンセル" aria-label="編集をキャンセル" disabled={companyLoading} onClick={() => setEditingCompanyId(null)}>
                                  <X size={15} aria-hidden="true" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button className="btn btn-secondary h-8 w-8 p-0" type="button" title="編集" aria-label={`${row.primary_company}を編集`} disabled={companyLoading} onClick={() => startEditingCompany(row)}>
                                  <Pencil size={15} aria-hidden="true" />
                                </button>
                                <button className="btn btn-secondary h-8 w-8 p-0 text-red-700" type="button" title="削除" aria-label={`${row.primary_company}を削除`} disabled={companyLoading} onClick={() => void removeCompanyMaster(row.id)}>
                                  <Trash2 size={15} aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className={`${activeTab === "schedules" ? "grid" : "hidden"} panel -mx-4 gap-3 px-4 py-4 sm:mx-0 sm:rounded-md sm:border`}>
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <label className="field">
              <span className="label">表示する予定</span>
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="work">作業あり</option>
                <option value="no_work">作業なし</option>
              </select>
            </label>
            <label className="field">
              <span className="label">並び替え</span>
              <select className="input" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}>
                <option value="dateAsc">日付が早い順</option>
                <option value="dateDesc">日付が遅い順</option>
                <option value="primaryAsc">一次会社順</option>
              </select>
            </label>
            <div className="field">
              <span className="label">表示形式</span>
              <div className="inline-flex h-12 overflow-hidden rounded-md border border-border bg-white">
                <button
                  className={`inline-flex items-center gap-2 px-4 text-sm font-semibold ${scheduleView === "summary" ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                  type="button"
                  onClick={() => setScheduleView("summary")}
                >
                  <List size={17} aria-hidden="true" />
                  一覧
                </button>
                <button
                  className={`inline-flex items-center gap-2 border-l border-border px-4 text-sm font-semibold ${scheduleView === "calendar" ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                  type="button"
                  onClick={() => setScheduleView("calendar")}
                >
                  <Table2 size={17} aria-hidden="true" />
                  カレンダー
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={`${activeTab === "schedules" && scheduleView === "summary" ? "block" : "hidden"} overflow-hidden rounded-md border border-border bg-white`}>
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full border-collapse text-sm">
              <thead className="bg-slate-800 text-white">
                <tr>
                  {["作業日", "一次会社", "合計人数", "作業エリア", "作業内容", "内訳"].map((header) => (
                    <th key={header} className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                      データなし
                    </td>
                  </tr>
                ) : (
                  summaryRows.map((row) => {
                    const expanded = expandedScheduleKeys.includes(row.key);
                    return (
                      <tr
                        key={row.key}
                        className="cursor-pointer border-t border-border align-top hover:bg-slate-50"
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleScheduleRow(row.key)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleScheduleRow(row.key);
                          }
                        }}
                      >
                        <td className="whitespace-nowrap px-3 py-3">
                          <button
                            className="inline-flex items-center gap-1 font-semibold text-sky-800 hover:text-sky-950"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleScheduleRow(row.key);
                            }}
                          >
                            {expanded ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" />}
                            {row.workDate}
                          </button>
                          {statusFilter === "no_work" && row.nextVisitDate ? <div className="mt-1 text-xs text-slate-500">来場予定 {row.nextVisitDate}</div> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold">{row.primaryCompany}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-bold">{row.totalCount}</td>
                        <td className="whitespace-nowrap px-3 py-3">{row.workArea}</td>
                        <td className="min-w-56 px-3 py-3">{row.workContent}</td>
                        <td className="px-3 py-3">
                          <button
                            className="btn btn-secondary h-9 px-3"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleScheduleRow(row.key);
                            }}
                          >
                            {expanded ? "閉じる" : `${row.details.length}件`}
                          </button>
                          {expanded ? (
                            <div className="mt-2 grid gap-1 rounded-md bg-slate-50 p-2 text-sm text-slate-700">
                              <div className="grid grid-cols-[1fr_72px] items-center gap-3 rounded bg-white px-2 py-2">
                                <span className="font-semibold text-slate-950">{row.primaryCompany}</span>
                                <span className="text-right font-bold">{row.primaryCount === "" ? "-" : `${row.primaryCount}人`}</span>
                              </div>
                              {row.details.length > 0 ? (
                                row.details.map((detail, index) => (
                                  <div key={`${detail.company}-${index}`} className="grid grid-cols-[1fr_72px] items-center gap-3 border-t border-border px-2 py-2">
                                    <span>{detail.company || "二次会社なし"}</span>
                                    <span className="text-right font-semibold">{detail.count === "" ? "-" : `${detail.count}人`}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="border-t border-border pt-1 text-slate-500">二次会社なし</div>
                              )}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`${activeTab === "schedules" && scheduleView === "calendar" ? "grid" : "hidden"} gap-3`}>
          <div className="overflow-hidden rounded-md border border-border bg-white">
            <div className="grid grid-cols-7 border-b border-border bg-slate-800 text-center text-xs font-bold text-white">
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
                const dayTotal = rows.reduce((sum, row) => sum + row.totalCount, 0);
                const selected = selectedCalendarDate === day;
                return (
                  <button
                    key={day}
                    className={`min-h-32 bg-white p-2 text-left align-top hover:bg-sky-50 ${selected ? "ring-2 ring-inset ring-sky-700" : ""}`}
                    type="button"
                    onClick={() => setSelectedCalendarDate(day)}
                  >
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className="text-sm font-bold text-slate-900">{day.slice(5)}</span>
                      {dayTotal > 0 ? <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-bold text-sky-900">{dayTotal}人</span> : null}
                    </div>
                    <div className="grid gap-1">
                      {rows.slice(0, 3).map((row) => (
                        <div key={row.key} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1">
                          <div className="truncate text-xs font-bold text-slate-900">{row.primaryCompany}</div>
                          <div className="truncate text-[11px] text-slate-600">
                            {row.totalCount}人 / {row.workArea || "-"}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">{row.workContent || "-"}</div>
                        </div>
                      ))}
                      {rows.length > 3 ? <div className="text-[11px] font-semibold text-slate-500">他 {rows.length - 3} 件</div> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border border-border bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-950">{selectedCalendarDate ?? "日付を選択"} の詳細</h2>
              {selectedCalendarDate ? <span className="text-sm font-semibold text-slate-600">{selectedCalendarRows.length} 件</span> : null}
            </div>
            {!selectedCalendarDate ? (
              <p className="text-sm text-slate-500">カレンダーの日付をクリックすると詳細を表示します。</p>
            ) : selectedCalendarRows.length === 0 ? (
              <p className="text-sm text-slate-500">この日の予定はありません。</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {selectedCalendarRows.map((row) => (
                  <button key={row.key} className="rounded-md border border-border p-3 text-left hover:bg-slate-50" type="button" onClick={() => {
                    setScheduleView("summary");
                    setExpandedScheduleKeys((current) => (current.includes(row.key) ? current : [...current, row.key]));
                  }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-bold text-slate-950">{row.primaryCompany}</div>
                        <div className="mt-1 truncate text-sm text-slate-600">{row.workArea || "-"}</div>
                      </div>
                      <div className="shrink-0 rounded bg-slate-100 px-2 py-1 text-sm font-bold text-slate-900">{row.totalCount}人</div>
                    </div>
                    <div className="mt-2 line-clamp-2 text-sm text-slate-700">{row.workContent || "-"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "ja");
}

function decodeFilename(disposition: string) {
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function RoleBadges({ roles }: { roles: string[] }) {
  if (roles.length === 0) return <span className="text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <span key={role} className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
          {role}
        </span>
      ))}
    </div>
  );
}

function buildScheduleSummaryRows(rows: ExportRow[], statusFilter: StatusFilter): ScheduleSummaryRow[] {
  const groups = new Map<string, ScheduleSummaryRow>();

  for (const row of rows) {
    const workArea = statusFilter === "work" ? row.workArea : row.nextWorkArea;
    const workContent = statusFilter === "work" ? row.workContent : row.nextWorkContent;
    const primaryCount = statusFilter === "work" ? row.primaryCount : row.nextPrimaryCount;
    const secondaryCompany = statusFilter === "work" ? row.secondaryCompany : row.nextSecondaryCompany;
    const secondaryCount = statusFilter === "work" ? row.secondaryCount : row.nextSecondaryCount;
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
  if (!start || !end || start > end) return { days: [], leadingBlanks: [] as string[] };

  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(toDateString(cursor));
    cursor = addDays(cursor, 1);
  }

  const mondayBasedIndex = (start.getDay() + 6) % 7;
  return {
    days,
    leadingBlanks: Array.from({ length: mondayBasedIndex }, (_, index) => `blank-${index}`),
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
