"use client";

import type { Session } from "@supabase/supabase-js";
import { Download, LogIn, LogOut, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { ExportRow } from "@/lib/types";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { toDateString } from "@/lib/utils";

type AdminResult = {
  rows: ExportRow[];
  count: number;
};

const today = () => toDateString(new Date());

export function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [primaryCompany, setPrimaryCompany] = useState("");
  const [secondaryCompany, setSecondaryCompany] = useState("");
  const [result, setResult] = useState<AdminResult>({ rows: [], count: 0 });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [supabase] = useState(() => createBrowserSupabaseClient());

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
    }
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setResult({ rows: [], count: 0 });
  }

  async function search() {
    if (!session) return;
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/schedules?${queryString()}`, {
        headers: {
          authorization: `Bearer ${session.access_token}`,
        },
      });
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
    if (!session) return;
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/export?format=${format}&${queryString()}`, {
        headers: {
          authorization: `Bearer ${session.access_token}`,
        },
      });

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

  if (!supabase) {
    return (
      <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-4">
        <div className="compact-panel grid gap-3 p-5">
          <h1 className="text-lg font-bold">管理画面</h1>
          <p className="text-sm text-slate-700">
            `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定してください。
          </p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto grid min-h-screen max-w-md place-items-center px-4">
        <form onSubmit={login} className="compact-panel grid w-full gap-4 p-5">
          <div>
            <h1 className="text-xl font-bold text-slate-950">管理画面</h1>
            <p className="mt-1 text-sm text-slate-600">作業予定確認</p>
          </div>
          {message ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{message}</div> : null}
          <label className="field">
            <span className="label">メールアドレス</span>
            <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
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
            <p className="mt-1 text-sm text-slate-600">{session.user.email}</p>
          </div>
          <button className="btn btn-secondary" type="button" onClick={logout}>
            <LogOut size={18} aria-hidden="true" />
            ログアウト
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4">
        <section className="panel -mx-4 grid gap-3 px-4 py-4 sm:mx-0 sm:rounded-md sm:border">
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
              予定 {result.count} 件 / 出力行 {result.rows.length} 行
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

        {message ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">{message}</div> : null}

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
                {result.rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-slate-500">
                      データなし
                    </td>
                  </tr>
                ) : (
                  result.rows.map((row, index) => (
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

function decodeFilename(disposition: string) {
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
