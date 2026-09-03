"use client";

import { CalendarDays, Download, LogIn, LogOut, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ExportRow } from "@/lib/types";
import { addDays, toDateString } from "@/lib/utils";

type AdminResult = {
  rows: ExportRow[];
  count: number;
};

type StatusFilter = "all" | "work" | "no_work";
type SortBy = "dateAsc" | "dateDesc" | "primaryAsc" | "status";

const today = () => toDateString(new Date());

export function AdminDashboard() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [primaryCompany, setPrimaryCompany] = useState("");
  const [secondaryCompany, setSecondaryCompany] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("dateAsc");
  const [result, setResult] = useState<AdminResult>({ rows: [], count: 0 });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const visibleRows = useMemo(() => {
    const filtered = result.rows.filter((row) => {
      if (statusFilter === "work") return row.status === "作業あり";
      if (statusFilter === "no_work") return row.status === "作業なし";
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "dateDesc") return compareText(b.workDate, a.workDate) || compareText(a.primaryCompany, b.primaryCompany);
      if (sortBy === "primaryAsc") return compareText(a.primaryCompany, b.primaryCompany) || compareText(a.workDate, b.workDate);
      if (sortBy === "status") return compareText(a.status, b.status) || compareText(a.workDate, b.workDate);
      return compareText(a.workDate, b.workDate) || compareText(a.primaryCompany, b.primaryCompany);
    });
  }, [result.rows, sortBy, statusFilter]);

  const rowsByDate = useMemo(() => {
    return visibleRows.reduce<Record<string, ExportRow[]>>((acc, row) => {
      acc[row.workDate] ??= [];
      acc[row.workDate].push(row);
      return acc;
    }, {});
  }, [visibleRows]);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((response) => response.json())
      .then((body) => setAuthenticated(Boolean(body.authenticated)))
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckingSession(false));
  }, []);

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
    if (primaryCompany) params.set("primaryCompany", primaryCompany);
    if (secondaryCompany) params.set("secondaryCompany", secondaryCompany);
    return params.toString();
  }

  function setQuickRange(days: number) {
    const start = new Date();
    setDateFrom(toDateString(start));
    setDateTo(toDateString(addDays(start, days - 1)));
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
      <main className="mx-auto grid min-h-screen max-w-md place-items-center px-4">
        <form onSubmit={login} className="compact-panel grid w-full gap-4 p-5">
          <div>
            <h1 className="text-xl font-bold text-slate-950">管理画面</h1>
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
          <button className="btn btn-secondary" type="button" onClick={logout}>
            <LogOut size={18} aria-hidden="true" />
            ログアウト
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4">
        <section className="panel -mx-4 grid gap-3 px-4 py-4 sm:mx-0 sm:rounded-md sm:border">
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary h-10" type="button" onClick={() => setQuickRange(1)}>
              今日
            </button>
            <button className="btn btn-secondary h-10" type="button" onClick={() => setQuickRange(2)}>
              今日・明日
            </button>
            <button className="btn btn-secondary h-10" type="button" onClick={() => setQuickRange(7)}>
              7日分
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-[150px_150px_1fr_1fr_auto]">
            <label className="field">
              <span className="label">開始日</span>
              <input className="input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="field">
              <span className="label">終了日</span>
              <input className="input" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label className="field">
              <span className="label">一次会社</span>
              <input className="input" value={primaryCompany} onChange={(event) => setPrimaryCompany(event.target.value)} />
            </label>
            <label className="field">
              <span className="label">二次会社</span>
              <input className="input" value={secondaryCompany} onChange={(event) => setSecondaryCompany(event.target.value)} />
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span className="label">表示する予定</span>
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="all">すべて</option>
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
                <option value="status">予定順</option>
              </select>
            </label>
          </div>
        </section>

        {message ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">{message}</div> : null}

        <section className="grid gap-3">
          {visibleRows.length === 0 ? (
            <div className="rounded-md border border-border bg-white px-4 py-6 text-center text-sm text-slate-500">
              表示する予定がありません
            </div>
          ) : (
            Object.entries(rowsByDate).map(([date, rows]) => (
              <div key={date} className="rounded-md border border-border bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 font-bold text-slate-950">
                    <CalendarDays size={18} className="text-primary" aria-hidden="true" />
                    {date}
                  </div>
                  <div className="text-xs font-semibold text-slate-600">{rows.length} 行</div>
                </div>
                <div className="grid gap-2 p-3">
                  {rows.map((row, index) => (
                    <div
                      key={`${date}-${row.primaryCompany}-${row.secondaryCompany}-${row.nextSecondaryCompany}-${index}`}
                      className="rounded-md border border-slate-200 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            row.status === "作業あり"
                              ? "rounded bg-sky-100 px-2 py-1 text-xs font-bold text-sky-800"
                              : "rounded bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700"
                          }
                        >
                          {row.status}
                        </span>
                        <span className="font-bold text-slate-950">{row.primaryCompany}</span>
                        {row.primaryCount !== "" ? <span className="text-sm text-slate-700">一次 {row.primaryCount}人</span> : null}
                      </div>
                      <div className="mt-2 grid gap-1 text-sm text-slate-700">
                        {row.secondaryCompany ? (
                          <div>
                            二次 {row.secondaryCompany}
                            {row.secondaryCount !== "" ? ` ${row.secondaryCount}人` : ""}
                          </div>
                        ) : null}
                        {row.workArea || row.workContent ? <div>{[row.workArea, row.workContent].filter(Boolean).join(" / ")}</div> : null}
                        {row.nextVisitDate || row.nextSecondaryCompany || row.nextWorkArea || row.nextWorkContent ? (
                          <div className="text-slate-600">
                            来場予定 {[row.nextVisitDate, row.nextSecondaryCompany, row.nextWorkArea, row.nextWorkContent]
                              .filter(Boolean)
                              .join(" / ")}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        <section className="overflow-hidden rounded-md border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full border-collapse text-sm">
              <thead className="bg-slate-800 text-white">
                <tr>
                  {[
                    "作業日",
                    "予定",
                    "一次会社",
                    "一次人数",
                    "二次会社",
                    "二次人数",
                    "エリア",
                    "作業内容",
                    "来場予定日",
                    "来場予定二次会社",
                    "来場予定人数",
                    "来場予定エリア",
                  ].map((header) => (
                    <th key={header} className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-slate-500">
                      データなし
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row, index) => (
                    <tr key={`${row.workDate}-${row.primaryCompany}-${row.secondaryCompany}-${row.nextSecondaryCompany}-${index}`} className="border-t border-border">
                      <td className="whitespace-nowrap px-3 py-2">{row.workDate}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.status}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.primaryCompany}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{row.primaryCount}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.secondaryCompany}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{row.secondaryCount}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.workArea}</td>
                      <td className="min-w-48 px-3 py-2">{row.workContent}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.nextVisitDate}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.nextSecondaryCompany}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{row.nextSecondaryCount}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.nextWorkArea}</td>
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
