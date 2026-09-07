"use client";

import { LoadingIndicator } from "@/components/loading-indicator";

import {
  GripVertical,
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  DatabaseBackup,
  Download,
  LogIn,
  LogOut,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { AdminScheduleEditor } from "@/components/admin-schedule-editor";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CompanyMaster, CompanyMasterRow, ScheduleListRow, ScheduleWithSubcompanies } from "@/lib/types";
import { addDays, toDateString } from "@/lib/utils";

type AdminResult = {
  rows: ScheduleListRow[];
  count: number;
  schedules: ScheduleWithSubcompanies[];
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
type AdminTab = "schedules" | "companies" | "backups";
type BackupRow = {
  id: string;
  created_at: string;
  backup_date: string;
  source: "automatic" | "manual";
  schema_version: number;
  row_counts: Record<string, number>;
};
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

function currentWeek() {
  const today = new Date();
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  return {
    today: toDateString(today),
    from: toDateString(monday),
    to: toDateString(addDays(monday, 6)),
  };
}

export function AdminDashboard() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("companies");
  const [initialWeek] = useState(currentWeek);
  const [rangePreset, setRangePreset] = useState<RangePreset>("week");
  const [dateFrom, setDateFrom] = useState(initialWeek.from);
  const [dateTo, setDateTo] = useState(initialWeek.to);
  const [primaryCompany, setPrimaryCompany] = useState("");
  const [secondaryCompany, setSecondaryCompany] = useState("");
  const [companyMaster, setCompanyMaster] = useState<CompanyMaster | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("work");
  const [sortBy, setSortBy] = useState<SortBy>("dateAsc");
  const [expandedScheduleKeys, setExpandedScheduleKeys] = useState<string[]>(
    [],
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(
    initialWeek.today,
  );
  const [result, setResult] = useState<AdminResult>({ rows: [], count: 0, schedules: [] });
  const [editingSchedule, setEditingSchedule] = useState<ScheduleWithSubcompanies | null>(null);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupError, setBackupError] = useState(false);

  function scheduleEditButton(row: ScheduleSummaryRow) {
    const schedule = result.schedules.find((item) => item.work_date === row.workDate && item.primary_company === row.primaryCompany);
    return <button type="button" className="btn btn-secondary" disabled={loading || !schedule} aria-label={`${row.workDate} ${row.primaryCompany}の予定を編集`} onClick={() => schedule && setEditingSchedule(schedule)}>編集</button>;
  }
  const [companyRows, setCompanyRows] = useState<CompanyMasterRow[]>([]);
  const [newPrimaryCompany, setNewPrimaryCompany] = useState("");
  const [newSecondaryCompanies, setNewSecondaryCompanies] = useState("");
  const [newPrimaryRoles, setNewPrimaryRoles] = useState("");
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editPrimaryCompany, setEditPrimaryCompany] = useState("");
  const [editSecondaryCompany, setEditSecondaryCompany] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [companyFetching, setCompanyFetching] = useState(true);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [draggedCompany, setDraggedCompany] = useState<{ primary: string; rowId?: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  function clearCompanyDrag() {
    setDraggedCompany(null);
    setDropTarget(null);
  }

  async function dropCompany(primary: string, rowId?: string) {
    const source = draggedCompany;
    clearCompanyDrag();
    if (!source || companyLoading || editingCompanyId) return;
    if (source.rowId) {
      if (source.primary !== primary || !rowId || source.rowId === rowId) return;
      const group = companyGroups.find((item) => item.primaryCompany === primary);
      if (!group) return;
      const rows = [...group.rows];
      const from = rows.findIndex((row) => row.id === source.rowId);
      const to = rows.findIndex((row) => row.id === rowId);
      if (from < 0 || to < 0) return;
      rows.splice(to, 0, rows.splice(from, 1)[0]);
      await saveCompanyOrder(companyGroups.flatMap((item) => item === group ? rows : item.rows));
    } else {
      if (rowId || source.primary === primary) return;
      const groups = [...companyGroups];
      const from = groups.findIndex((item) => item.primaryCompany === source.primary);
      const to = groups.findIndex((item) => item.primaryCompany === primary);
      if (from < 0 || to < 0) return;
      groups.splice(to, 0, groups.splice(from, 1)[0]);
      await saveCompanyOrder(groups.flatMap((item) => item.rows));
    }
  }

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
      primaryCompany
        ? companyMaster.secondariesByPrimary[primaryCompany] ?? []
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
  const addingToExistingPrimary = companyGroups.some(
    (group) => group.primaryCompany === newPrimaryCompany.trim(),
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

    setCompanyFetching(true);
    void Promise.all([refreshCompanyOptions(), refreshCompanyMaster()]).catch(
      (error) => {
        setCompanyMaster(null);
        setMessage(
          error instanceof Error
            ? error.message
            : "会社マスタの取得に失敗しました。",
        );
      },
    ).finally(() => setCompanyFetching(false));
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || activeTab !== "backups") return;
    void refreshBackups();
  }, [authenticated, activeTab]);

  useEffect(() => {
    setExpandedScheduleKeys([]);
    setSelectedCalendarDate((selected) => {
      const { dateFrom: from, dateTo: to } = appliedFilters;
      if (selected && selected >= from && selected <= to) return selected;
      const today = toDateString(new Date());
      return today >= from && today <= to ? today : from || null;
    });
  }, [appliedFilters]);

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
    setResult({ rows: [], count: 0, schedules: [] });
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
      setResult({ rows: body.rows ?? [], count: body.count ?? 0, schedules: body.schedules ?? [] });
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

  async function refreshBackups() {
    setBackupLoading(true);
    setBackupMessage("");
    setBackupError(false);
    try {
      const response = await fetch("/api/admin/backups", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "バックアップ履歴を取得できませんでした。");
      setBackups(body.backups ?? []);
    } catch (error) {
      setBackupError(true);
      setBackupMessage(error instanceof Error ? error.message : "バックアップ履歴を取得できませんでした。");
    } finally {
      setBackupLoading(false);
    }
  }

  async function createBackup() {
    setBackupLoading(true);
    setBackupMessage("");
    setBackupError(false);
    try {
      const response = await fetch("/api/admin/backups", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "バックアップを作成できませんでした。");
      await refreshBackups();
      setBackupMessage("バックアップを作成しました。");
    } catch (error) {
      setBackupError(true);
      setBackupMessage(error instanceof Error ? error.message : "バックアップを作成できませんでした。");
    } finally {
      setBackupLoading(false);
    }
  }

  async function importBackup(file: File) {
    if (!window.confirm(`${file.name} のバックアップを取り込み、現在のデータを置き換えます。よろしいですか？`)) return;
    setBackupLoading(true);
    setBackupMessage("");
    setBackupError(false);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/admin/backups", { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "バックアップを取り込めませんでした。");
      await Promise.all([refreshBackups(), refreshCompanyMaster(), refreshCompanyOptions(), search()]);
      setBackupMessage("バックアップを取り込みました。");
    } catch (error) {
      setBackupError(true);
      setBackupMessage(error instanceof Error ? error.message : "バックアップを取り込めませんでした。");
    } finally {
      setBackupLoading(false);
    }
  }

  async function restoreBackup(backup: BackupRow) {
    if (!window.confirm(`${formatBackupTime(backup.created_at)} の状態に全データを戻します。復元前に現在のデータをバックアップして保険として保存します。現在のデータは置き換わります。よろしいですか？`)) return;
    setBackupLoading(true);
    setBackupMessage("");
    setBackupError(false);
    try {
      const response = await fetch("/api/admin/backups", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: backup.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "バックアップを復元できませんでした。");
      await Promise.all([refreshBackups(), refreshCompanyMaster(), refreshCompanyOptions(), search()]);
      setBackupMessage("バックアップを復元しました。復元前のデータも保険として保存されています。");
    } catch (error) {
      setBackupError(true);
      setBackupMessage(error instanceof Error ? error.message : "バックアップを復元できませんでした。");
    } finally {
      setBackupLoading(false);
    }
  }

  async function deleteBackup(backup: BackupRow) {
    if (!window.confirm(`${formatBackupTime(backup.created_at)} のバックアップを削除しますか？`)) return;
    setBackupLoading(true);
    setBackupMessage("");
    setBackupError(false);
    try {
      const response = await fetch(`/api/admin/backups?id=${encodeURIComponent(backup.id)}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "バックアップを削除できませんでした。");
      await refreshBackups();
      setBackupMessage("バックアップを削除しました。");
    } catch (error) {
      setBackupError(true);
      setBackupMessage(error instanceof Error ? error.message : "バックアップを削除できませんでした。");
    } finally {
      setBackupLoading(false);
    }
  }

  async function addCompanyMaster() {
    if (!authenticated) return;
    const primaryCompany = newPrimaryCompany.trim();
    const primaryTradeRoles = addingToExistingPrimary ? [] : parseRoleText(newPrimaryRoles);
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

  async function removeCompanyMaster(id: string, group?: CompanyGroup) {
    if (!authenticated || companyLoading) return;
    const confirmation = group
      ? `「${group.primaryCompany}」と配下の登録${group.rows.length}件を協力会社一覧から削除しますか？登録済みの作業予定は残ります。`
      : "この協力会社を一覧から削除しますか？";
    if (!window.confirm(confirmation)) return;
    const params = new URLSearchParams(group ? { primaryCompany: group.primaryCompany } : { id });
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

      if (editingCompanyId === id || group?.rows.some((row) => row.id === editingCompanyId)) setEditingCompanyId(null);
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
    if (companyLoading || editingCompanyId) return;
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
    await saveCompanyOrder(reorderedGroups.flatMap((group) => group.rows));
  }

  async function moveSecondaryCompany(
    group: CompanyGroup,
    index: number,
    direction: -1 | 1,
  ) {
    if (companyLoading || editingCompanyId) return;
    const destination = index + direction;
    if (destination < 0 || destination >= group.rows.length) return;
    const rows = [...group.rows];
    [rows[index], rows[destination]] = [rows[destination], rows[index]];
    await saveCompanyOrder(
      companyGroups.flatMap((item) =>
        item.primaryCompany === group.primaryCompany ? rows : item.rows,
      ),
    );
  }

  async function saveCompanyOrder(reordered: CompanyMasterRow[]) {
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
      <main className="admin-dashboard mx-auto grid min-h-screen max-w-xl place-items-center px-4">
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
      <main className="admin-dashboard min-h-screen bg-[#f6f7f5]">
        <div className="mx-auto grid max-w-md px-5 py-14 sm:py-24">
          <h1 className="mb-6 text-xl font-bold text-slate-900">管理画面</h1>
          <form
            onSubmit={login}
            className="compact-panel grid w-full gap-3 p-4 sm:p-4"
            aria-busy={loginLoading}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-md bg-slate-100 text-slate-600">
                <LogIn size={19} aria-hidden="true" />
              </span>
              <h2 className="text-lg font-bold tracking-tight text-slate-950">
                管理画面にログイン
              </h2>
            </div>
            {message ? (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
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
    <main className="admin-dashboard min-h-screen bg-[#f6f7f5]">
      <div className="mx-auto grid max-w-6xl gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex justify-end">
          <button
            className="btn btn-secondary px-3"
            type="button"
            onClick={logout}
          >
            <LogOut size={17} aria-hidden="true" />
            ログアウト
          </button>
        </div>
        <nav
          className="flex gap-2 border-b border-slate-200"
          aria-label="管理画面メニュー"
        >
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
          <button
            className={`flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors sm:px-4 ${activeTab === "backups" ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            type="button"
            aria-pressed={activeTab === "backups"}
            onClick={() => {
              setActiveTab("backups");
              setMessage("");
            }}
          >
            <DatabaseBackup size={18} aria-hidden="true" />
            バックアップ
          </button>
        </nav>

        {message ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
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
          className={`${activeTab === "schedules" ? "grid" : "hidden"} panel gap-3 p-4 sm:p-4`}
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
              <select
                className="input"
                value={primaryCompany}
                onChange={(event) => { setPrimaryCompany(event.target.value); setSecondaryCompany(""); }}
              >
                <option value="">すべての一次会社</option>
                {primaryCompanyOptions.map((company) => (
                  <option key={company} value={company}>{company}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">二次会社</span>
              <select
                className="input"
                value={secondaryCompany}
                onChange={(event) => setSecondaryCompany(event.target.value)}
              >
                <option value="">すべての二次会社</option>
                {secondaryCompanyOptions.map((company) => (
                  <option key={company} value={company}>{company}</option>
                ))}
              </select>
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
          className={`${activeTab === "companies" ? "grid" : "hidden"} panel gap-3 p-4 sm:p-4`}
        >
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">協力会社一覧</h2>
              <p className="mt-1 text-sm text-slate-600">
                入力画面に表示する会社名と順番を管理します。
              </p>
            </div>
            <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              一次 {companyGroups.length}社 / 登録 {companyRows.length}件
            </span>
          </div>

          <div className={`grid items-start gap-4 rounded-md bg-slate-50 p-4 ${addingToExistingPrimary ? "md:grid-cols-[1fr_1.5fr_auto]" : "md:grid-cols-[1fr_1fr_1.5fr_auto]"}`}>
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
            {!addingToExistingPrimary && <label className="field">
              <span className="label">職種</span>
              <input
                className="input"
                value={newPrimaryRoles}
                onChange={(event) => setNewPrimaryRoles(event.target.value)}
                placeholder="例: 多能工、配管工"
              />
            </label>}
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

          <p className="hidden text-sm text-slate-600 sm:block">
            つまみをドラッグするか、↑・↓で並び替えできます。二次会社は同じ一次会社内で移動でき、変更は自動保存されます。
          </p>

          <div className="grid gap-3">
            {companyFetching && <LoadingIndicator label="協力会社一覧を読み込み中…" />}
            {!companyFetching && companyGroups.length === 0 && (
              <p className="py-6 text-center text-slate-500">
                協力会社がまだ登録されていません
              </p>
            )}
            {companyGroups.map((group, groupIndex) => (
              <div
                key={group.primaryCompany}
                className={`grid grid-cols-1 items-start gap-2 rounded-md sm:grid-cols-[auto_minmax(0,1fr)] ${dropTarget === group.primaryCompany ? "ring-2 ring-emerald-500 bg-emerald-50" : ""}`}
                onDragOver={(event) => {
                  if (!draggedCompany || draggedCompany.rowId || companyLoading || editingCompanyId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTarget(group.primaryCompany);
                }}
                onDrop={(event) => {
                  if (!draggedCompany || draggedCompany.rowId) return;
                  event.preventDefault();
                  void dropCompany(group.primaryCompany);
                }}
              >
                <div className="hidden h-11 items-center gap-1 sm:flex">
                  <span
                    className="inline-flex h-9 w-5 items-center justify-center cursor-grab text-slate-400 active:cursor-grabbing"
                    draggable={!companyLoading && !editingCompanyId}
                    title="ドラッグして一次会社を並び替え"
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", group.primaryCompany);
                      event.dataTransfer.effectAllowed = "move";
                      setDraggedCompany({ primary: group.primaryCompany });
                    }}
                    onDragEnd={clearCompanyDrag}
                  ><GripVertical size={18} aria-hidden="true" /></span>
                  <button
                    className="btn btn-secondary h-9 w-9 p-0"
                    type="button"
                    aria-label={`${group.primaryCompany}を上へ`}
                    disabled={companyLoading || !!editingCompanyId || groupIndex === 0}
                    onClick={() => void movePrimaryCompany(group.primaryCompany, -1)}
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    className="btn btn-secondary h-9 w-9 p-0"
                    type="button"
                    aria-label={`${group.primaryCompany}を下へ`}
                    disabled={companyLoading || !!editingCompanyId || groupIndex === companyGroups.length - 1}
                    onClick={() => void movePrimaryCompany(group.primaryCompany, 1)}
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                </div>
              <details className="min-w-0 flex-1 rounded-md border border-border bg-white">
                <summary className="min-h-11 cursor-pointer rounded-md px-3 py-2.5 font-semibold text-slate-900 marker:text-emerald-700">
                  <span className="break-words">{group.primaryCompany}</span>
                  <span className="ml-3 text-sm font-normal text-slate-500">{(group.rows.find((row) => (row.primary_trade_roles?.length ?? 0) > 0)?.primary_trade_roles ?? []).join("・")}</span>
                  <span className="ml-3 text-sm font-normal text-slate-500">
                    二次会社{" "}
                    {group.rows.filter((row) => row.secondary_company).length}社
                  </span>
                </summary>
                <div className="grid gap-3 border-t border-border p-3 sm:p-4">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-semibold text-slate-600">職種</span>
                    <RoleBadges roles={group.rows.find((row) => (row.primary_trade_roles?.length ?? 0) > 0)?.primary_trade_roles ?? []} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary h-9 w-9 p-0"
                      aria-label={`${group.primaryCompany}に追加`}
                      title="この一次会社に追加"
                      onClick={() => {
                        setNewPrimaryCompany(group.primaryCompany);
                        setNewSecondaryCompanies("");
                        setNewPrimaryRoles("");
                        document.getElementById("add-company-primary")?.focus();
                      }}
                    >
                      <Plus size={17} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary h-9 w-9 p-0 text-red-700"
                      disabled={companyLoading || !!editingCompanyId}
                      aria-label={`${group.primaryCompany}と配下の二次会社を削除`}
                      title="一次会社ごと削除"
                      onClick={() => void removeCompanyMaster("", group)}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                  {group.rows.map((row, rowIndex) => (
                    <div
                      key={row.id}
                      className={`grid items-center gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] ${dropTarget === row.id ? "ring-2 ring-emerald-500" : ""}`}
                      onDragOver={(event) => {
                        if (!draggedCompany?.rowId || draggedCompany.primary !== group.primaryCompany || companyLoading || editingCompanyId) return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = "move";
                        setDropTarget(row.id);
                      }}
                      onDrop={(event) => {
                        if (!draggedCompany?.rowId) return;
                        event.preventDefault();
                        event.stopPropagation();
                        void dropCompany(group.primaryCompany, row.id);
                      }}
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
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <p className="break-words font-semibold">
                            {row.secondary_company || "一次会社のみ"}
                          </p>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {group.rows.length > 1 ? (
                          <div className="hidden items-center gap-2 sm:flex">
                            <span
                              className="inline-flex h-9 w-5 items-center justify-center cursor-grab text-slate-400 active:cursor-grabbing"
                              draggable={!companyLoading && !editingCompanyId}
                              title="ドラッグして二次会社を並び替え"
                              onDragStart={(event) => {
                                event.stopPropagation();
                                event.dataTransfer.setData("text/plain", row.id);
                                event.dataTransfer.effectAllowed = "move";
                                setDraggedCompany({ primary: group.primaryCompany, rowId: row.id });
                              }}
                              onDragEnd={clearCompanyDrag}
                            ><GripVertical size={18} aria-hidden="true" /></span>
                            <button
                              className="btn btn-secondary h-9 w-9 p-0"
                              type="button"
                              aria-label={`${group.primaryCompany}の${row.secondary_company || "一次会社のみ"}を上へ`}
                              disabled={companyLoading || !!editingCompanyId || rowIndex === 0}
                              onClick={() => void moveSecondaryCompany(group, rowIndex, -1)}
                            >
                              <ArrowUp size={16} aria-hidden="true" />
                            </button>
                            <button
                              className="btn btn-secondary h-9 w-9 p-0"
                              type="button"
                              aria-label={`${group.primaryCompany}の${row.secondary_company || "一次会社のみ"}を下へ`}
                              disabled={companyLoading || !!editingCompanyId || rowIndex === group.rows.length - 1}
                              onClick={() => void moveSecondaryCompany(group, rowIndex, 1)}
                            >
                              <ArrowDown size={16} aria-hidden="true" />
                            </button>
                          </div>
                        ) : null}
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
              </div>
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
          </div>
        </section>

        <section className={`${activeTab === "backups" ? "grid" : "hidden"} panel gap-4 p-4 sm:p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">バックアップ</h2>
              <p className="mt-1 text-sm text-slate-600">
                毎日23:59（日本時間）に自動保存します。必要な時は手動でも保存できます。
              </p>
            </div>
            <button className="btn btn-primary" type="button" disabled={backupLoading} onClick={() => void createBackup()}>
              {backupLoading ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <DatabaseBackup size={17} aria-hidden="true" />}
              今すぐバックアップ
            </button>
            <label className="btn btn-secondary cursor-pointer">
              <Upload size={17} aria-hidden="true" />
              JSONを取り込む
              <input
                className="sr-only"
                type="file"
                accept="application/json,.json"
                disabled={backupLoading}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void importBackup(file);
                }}
              />
            </label>
          </div>

          {backupMessage ? (
            <p className={`rounded-md border px-4 py-3 text-sm ${backupError ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} role={backupError ? "alert" : "status"}>
              {backupMessage}
            </p>
          ) : null}

          <div className="overflow-hidden rounded-md border border-border bg-white">
            {backups.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                {backupLoading ? "取得中…" : "バックアップはまだありません。"}
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {backups.map((backup) => (
                  <div key={backup.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{formatBackupTime(backup.created_at)}</p>
                        <span className={`rounded px-2 py-0.5 text-xs font-bold ${backup.source === "automatic" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}>
                          {backup.source === "automatic" ? "自動" : "手動"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        予定 {backup.row_counts.schedule_groups ?? 0}件・新規入場者 {backup.row_counts.new_entrant_records ?? 0}件・会社マスタ {backup.row_counts.company_master ?? 0}件
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a className="btn btn-secondary" href={`/api/admin/backups?id=${encodeURIComponent(backup.id)}`} download>
                        <Download size={16} aria-hidden="true" />
                        PCに保存
                      </a>
                      <button className="btn btn-secondary" type="button" disabled={backupLoading} onClick={() => void restoreBackup(backup)}>
                        <RotateCcw size={16} aria-hidden="true" />
                        復元
                      </button>
                      <button className="btn btn-secondary text-red-700" type="button" disabled={backupLoading} onClick={() => void deleteBackup(backup)}>
                        <Trash2 size={16} aria-hidden="true" />
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section
          className={`${activeTab === "schedules" ? "block" : "hidden"} overflow-hidden rounded-md border border-border bg-white`}
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
                      <span className="shrink-0 rounded-md bg-emerald-50 px-3 py-2 text-lg font-bold tabular-nums text-emerald-800">
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
                    <div className="mt-3 flex justify-end">{scheduleEditButton(row)}</div>
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
                    "編集",
                  ].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2 text-left font-semibold"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
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
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          {scheduleEditButton(row)}
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
          className="hidden"
        >
          <div className="overflow-x-auto rounded-md border border-border bg-white">
            <div className="min-w-[630px]">
              <div className="grid grid-cols-6 border-b border-border bg-slate-50 text-center text-xs font-semibold text-slate-500">
                {["月", "火", "水", "木", "金", "土"].map((day) => (
                  <div key={day} className="px-2 py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-6 bg-border gap-px">
                {calendarDays.leadingBlanks.map((blank) => (
                  <div key={blank} className="min-h-28 bg-slate-50" />
                ))}
                {calendarDays.days.map((day) => {
                  const rows = calendarRowsByDate[day] ?? [];
                  const selected = selectedCalendarDate === day;
                  const isToday = day === toDateString(new Date());
                  const companyCount = new Set(rows.flatMap((row) => [
                    row.primaryCompany,
                    ...row.details.map((detail) => detail.company),
                  ]).filter(Boolean)).size;
                  const workerCount = rows.reduce((sum, row) => sum + row.totalCount, 0);
                  return (
                    <button
                      key={day}
                      type="button"
                      className={`flex h-28 min-w-0 flex-col gap-1 overflow-hidden p-2 text-left transition-colors hover:bg-emerald-50 ${selected ? "bg-emerald-50 ring-2 ring-inset ring-emerald-700" : "bg-white"}`}
                      aria-pressed={selected}
                      aria-current={isToday ? "date" : undefined}
                      aria-label={`${day}、${companyCount}社、合計${workerCount}人の予定`}
                      onClick={() => setSelectedCalendarDate(day)}
                    >
                      <span className="text-sm font-bold text-emerald-800">
                        {Number(day.slice(5, 7))}/{Number(day.slice(8))}
                        {isToday && <span className="ml-1 text-xs">今日</span>}
                      </span>
                      <span className="mt-auto text-xs text-slate-600">{companyCount}社</span>
                      <span className="text-sm font-semibold tabular-nums text-slate-900">
                        合計 {workerCount}人
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-white p-2 sm:p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
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
              <div className="divide-y divide-border border-t border-border">
                <div className="hidden grid-cols-[minmax(0,1fr)_4rem] gap-2 bg-slate-50 sm:grid">
                <div className="grid grid-cols-[minmax(0,1.2fr)_4rem_minmax(0,0.8fr)_minmax(0,1.8fr)_1rem] gap-3 px-2 py-1.5 text-xs font-semibold text-slate-500">
                  <span>一次会社</span>
                  <span className="text-right">合計人数</span>
                  <span>作業エリア</span>
                  <span>作業内容</span>
                  <span />
                </div>
                <span aria-hidden="true" />
                </div>
                {selectedCalendarRows.map((row) => {
                  const expanded = expandedScheduleKeys.includes(row.key);
                  return (
                    <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_4rem] items-start gap-2">
                      <div className="min-w-0">
                        <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_4rem_2rem] items-center gap-x-3 gap-y-0.5 px-2 py-1.5 text-sm hover:bg-slate-50 sm:grid-cols-[minmax(0,1.2fr)_4rem_minmax(0,0.8fr)_minmax(0,1.8fr)_2rem]">
                          <div className="col-start-1 row-start-1 min-w-0 font-semibold text-slate-950" title={row.primaryCompany}>
                            <CopyValue value={row.primaryCompany} label="一次会社" />
                          </div>
                          <div className="col-start-2 row-start-1 text-right font-semibold tabular-nums">
                            <CopyValue value={row.totalCount} label="合計人数">
                              {row.totalCount}人
                            </CopyValue>
                          </div>
                          <div className="col-span-2 col-start-1 row-start-2 min-w-0 text-xs text-slate-600 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:text-sm" title={row.workArea}>
                            <CopyValue value={row.workArea} label="作業エリア" />
                          </div>
                          <div className="col-span-2 col-start-1 row-start-3 min-w-0 text-xs text-slate-600 sm:col-span-1 sm:col-start-4 sm:row-start-1 sm:text-sm" title={row.workContent}>
                            <CopyValue value={row.workContent} label="作業内容" />
                          </div>
                          <button
                            type="button"
                            className="col-start-3 row-start-1 inline-flex size-8 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800 sm:col-start-5"
                            aria-expanded={expanded}
                            aria-label={`${row.primaryCompany}の詳細を${expanded ? "閉じる" : "開く"}`}
                            onClick={() => toggleScheduleRow(row.key)}
                          >
                            {expanded ? (
                              <ChevronDown size={17} aria-hidden="true" />
                            ) : (
                              <ChevronRight size={17} aria-hidden="true" />
                            )}
                          </button>
                        </div>
                        {expanded ? (
                          <div className="border-t border-border bg-slate-50 px-3 py-2 text-sm">
                            <div className="grid gap-x-4 sm:grid-cols-2">
                              <div><span className="text-xs text-slate-500">一次会社：</span><CopyValue value={row.primaryCompany} label="一次会社" /></div>
                              <div><span className="text-xs text-slate-500">作業エリア：</span><CopyValue value={row.workArea} label="作業エリア" /></div>
                            </div>
                            <div><span className="text-xs text-slate-500">作業内容：</span><CopyValue value={row.workContent} label="作業内容" /></div>
                            <ScheduleDetails row={row} />
                          </div>
                        ) : null}
                      </div>
                      <div className="flex justify-end py-1">{scheduleEditButton(row)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
      {editingSchedule && <AdminScheduleEditor
        key={editingSchedule.id}
        schedule={editingSchedule}
        master={companyMaster}
        onClose={() => setEditingSchedule(null)}
        onSaved={() => { setEditingSchedule(null); void search(); }}
      />}
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
          className="fixed bottom-5 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 rounded-md bg-slate-800 px-4 py-3 text-sm font-medium text-white shadow-lg"
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
      className={`rounded-md border px-3 py-2 ${accent ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-white"}`}
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
        className={`mt-1 text-xl font-bold tracking-tight tabular-nums ${accent ? "text-emerald-900" : "text-slate-900"}`}
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
      <span className="grid size-12 place-items-center rounded-md bg-slate-50 text-slate-400">
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
    <div className="mt-2 grid min-w-40 gap-1 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md bg-white px-3 py-2.5">
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
  rows: ScheduleListRow[],
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
    if (cursor.getDay() !== 0) days.push(toDateString(cursor));
    cursor = addDays(cursor, 1);
  }

  const mondayBasedIndex = (start.getDay() + 6) % 7 % 6;
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

function formatBackupTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
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

