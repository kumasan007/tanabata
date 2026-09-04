"use client";

import { Download, LogIn, LogOut, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CompanyMaster, ExportRow } from "@/lib/types";
import { addDays, toDateString } from "@/lib/utils";

type AdminResult = {
  rows: ExportRow[];
  count: number;
};

type RangePreset = "today" | "tomorrow" | "week";
type StatusFilter = "work" | "no_work";
type SortBy = "dateAsc" | "dateDesc" | "primaryAsc";

const tomorrow = () => toDateString(addDays(new Date(), 1));

export function AdminDashboard() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [rangePreset, setRangePreset] = useState<RangePreset>("tomorrow");
  const [dateFrom, setDateFrom] = useState(tomorrow);
  const [dateTo, setDateTo] = useState(tomorrow);
  const [primaryCompany, setPrimaryCompany] = useState("");
  const [secondaryCompany, setSecondaryCompany] = useState("");
  const [companyMaster, setCompanyMaster] = useState<CompanyMaster | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("work");
  const [sortBy, setSortBy] = useState<SortBy>("dateAsc");
  const [result, setResult] = useState<AdminResult>({ rows: [], count: 0 });
  const [companyRows, setCompanyRows] = useState<Array<{ id: string; primary_company: string; secondary_company: string | null; sort_order: number }>>([]);
  const [newPrimaryCompany, setNewPrimaryCompany] = useState("");
  const [newSecondaryCompany, setNewSecondaryCompany] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

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

  const primaryCompanyOptions = companyMaster?.primaryCompanies ?? [];

  const secondaryCompanyOptions = useMemo(() => {
    if (!companyMaster) return [];

    const options =
      primaryCompany && companyMaster.secondariesByPrimary[primaryCompany]
        ? companyMaster.secondariesByPrimary[primaryCompany]
        : Object.values(companyMaster.secondariesByPrimary).flat();

    return [...new Set(options)].sort(compareText);
  }, [companyMaster, primaryCompany]);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((response) => response.json())
      .then((body) => setAuthenticated(Boolean(body.authenticated)))
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    fetch("/api/companies")
      .then((response) => response.json())
      .then((body) => setCompanyMaster(body))
      .catch(() => setCompanyMaster(null));

    void refreshCompanyMaster();
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    void search();
  }, [authenticated]);

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
      return;
    }
    setCompanyRows(body.rows ?? []);
  }

  async function addCompanyMaster() {
    if (!authenticated) return;
    const primaryCompany = newPrimaryCompany.trim();
    const secondaryCompany = newSecondaryCompany.trim();

    if (!primaryCompany) {
      setMessage("一次会社を入力してください。");
      return;
    }

    setMessage("");

    const response = await fetch("/api/admin/company-master", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ primaryCompany, secondaryCompany }),
    });
    const body = await response.json();

    if (!response.ok) {
      setMessage(body.error ?? "会社マスタの追加に失敗しました。");
      return;
    }

    setNewPrimaryCompany("");
    setNewSecondaryCompany("");
    await refreshCompanyMaster();
    fetch("/api/companies?force=1")
      .then((res) => res.ok ? res.json() : null)
      .catch(() => null);
  }

  async function removeCompanyMaster(id: string) {
    if (!authenticated) return;
    const response = await fetch(`/api/admin/company-master?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = await response.json();

    if (!response.ok) {
      setMessage(body.error ?? "会社マスタの削除に失敗しました。");
      return;
    }

    setMessage("");
    await refreshCompanyMaster();
    fetch("/api/companies?force=1")
      .then((res) => res.ok ? res.json() : null)
      .catch(() => null);
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

  function setQuickRange(preset: RangePreset) {
    setRangePreset(preset);

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
            <h1 className="text-xl font-bold text-slate-950">作業予定管理</h1>
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
        <section className="panel -mx-4 grid gap-3 px-4 py-4 sm:mx-0 sm:rounded-md sm:border">
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
            <div className="flex min-h-10 items-center text-sm font-semibold text-slate-600">
              {dateFrom === dateTo ? dateFrom : `${dateFrom} - ${dateTo}`}
            </div>
          </div>

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
              予定 {result.count} 件 / 表示 {visibleRows.length} 行 / 出力 {result.rows.length} 行
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

        <section className="panel -mx-4 grid gap-3 px-4 py-4 sm:mx-0 sm:rounded-md sm:border">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-950">会社マスタ編集</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="field">
              <span className="label">一次会社</span>
              <input className="input" value={newPrimaryCompany} onChange={(event) => setNewPrimaryCompany(event.target.value)} placeholder="例: 山田設備" />
            </label>
            <label className="field">
              <span className="label">二次会社</span>
              <input className="input" value={newSecondaryCompany} onChange={(event) => setNewSecondaryCompany(event.target.value)} placeholder="例: 山田配管工業（空欄可）" />
            </label>
            <button className="btn btn-primary mt-6" type="button" onClick={() => void addCompanyMaster()}>
              追加
            </button>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-slate-50">
            <div className="max-h-64 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-200 text-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left">一次会社</th>
                    <th className="px-3 py-2 text-left">二次会社</th>
                    <th className="px-3 py-2 text-center">削除</th>
                  </tr>
                </thead>
                <tbody>
                  {companyRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                        会社マスタがありません
                      </td>
                    </tr>
                  ) : (
                    companyRows.map((row) => (
                      <tr key={row.id} className="border-t border-border bg-white">
                        <td className="px-3 py-2">{row.primary_company}</td>
                        <td className="px-3 py-2">{row.secondary_company ?? "-"}</td>
                        <td className="px-3 py-2 text-center">
                          <button className="btn btn-secondary h-8 px-3 text-xs" type="button" onClick={() => void removeCompanyMaster(row.id)}>
                            削除
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="panel -mx-4 grid gap-3 px-4 py-4 sm:mx-0 sm:rounded-md sm:border">
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        </section>

        {message ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">{message}</div> : null}

        <section className="overflow-hidden rounded-md border border-border bg-white">
          <div className="overflow-x-auto">
            <table className={statusFilter === "work" ? "min-w-[840px] w-full border-collapse text-sm" : "min-w-[960px] w-full border-collapse text-sm"}>
              <thead className="bg-slate-800 text-white">
                <tr>
                  {(statusFilter === "work"
                    ? ["作業日", "一次会社", "一次人数", "二次会社", "二次人数", "作業エリア", "作業内容"]
                    : ["作業日", "一次会社", "来場予定日", "一次人数", "二次会社", "二次人数", "作業エリア", "作業内容"]
                  ).map((header) => (
                    <th key={header} className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={statusFilter === "work" ? 7 : 8} className="px-3 py-8 text-center text-slate-500">
                      データなし
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row, index) => (
                    <tr key={`${row.workDate}-${row.primaryCompany}-${row.secondaryCompany}-${row.nextSecondaryCompany}-${index}`} className="border-t border-border">
                      {statusFilter === "work" ? (
                        <>
                          <td className="whitespace-nowrap px-3 py-2">{row.workDate}</td>
                          <td className="whitespace-nowrap px-3 py-2">{row.primaryCompany}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">{row.primaryCount}</td>
                          <td className="whitespace-nowrap px-3 py-2">{row.secondaryCompany}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">{row.secondaryCount}</td>
                          <td className="whitespace-nowrap px-3 py-2">{row.workArea}</td>
                          <td className="min-w-48 px-3 py-2">{row.workContent}</td>
                        </>
                      ) : (
                        <>
                          <td className="whitespace-nowrap px-3 py-2">{row.workDate}</td>
                          <td className="whitespace-nowrap px-3 py-2">{row.primaryCompany}</td>
                          <td className="whitespace-nowrap px-3 py-2">{row.nextVisitDate}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">{row.nextPrimaryCount}</td>
                          <td className="whitespace-nowrap px-3 py-2">{row.nextSecondaryCompany}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">{row.nextSecondaryCount}</td>
                          <td className="whitespace-nowrap px-3 py-2">{row.nextWorkArea}</td>
                          <td className="min-w-48 px-3 py-2">{row.nextWorkContent}</td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
