"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { notifySessionChanged, OPEN_EMPLOYEE_LOGIN, useEmployeeSession } from "@/lib/employee-session";

export function EmployeeAccount() {
  const authenticated = useEmployeeSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    const open = () => { setMessage(""); dialog.current?.showModal(); };
    window.addEventListener(OPEN_EMPLOYEE_LOGIN, open);
    return () => window.removeEventListener(OPEN_EMPLOYEE_LOGIN, open);
  }, []);
  async function submit() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const response = await apiFetch(authenticated ? "/api/admin/logout" : "/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: authenticated ? undefined : JSON.stringify({ password, remember }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "操作できませんでした。");
      notifySessionChanged(!authenticated);
      setPassword(""); dialog.current?.close();
    } catch (error) { setMessage(error instanceof Error ? error.message : "接続できませんでした。"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <>
    <button type="button" className={`relative ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 sm:h-10 sm:w-10 ${authenticated ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-400"}`} aria-label={authenticated ? "社員ログイン中：アカウントメニュー" : "監理者ログイン"} title={authenticated ? "社員ログイン中" : "監理者ログイン"} onClick={() => { setMessage(""); dialog.current?.showModal(); }}>
      <Image src="/icon.png" alt="" width={26} height={26} className="rounded-full" />
      {authenticated && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-600" />}
    </button>
    <dialog ref={dialog} className="w-[calc(100%-2rem)] max-w-sm rounded-xl p-5 shadow-xl backdrop:bg-black/40" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => setPassword("")}>
      <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <h2 className="text-lg font-bold">{authenticated ? "社員ログイン中" : "監理者ログイン"}</h2>
        {message && <p role="alert" className="notice-error text-sm">{message}</p>}
        {authenticated ? <Link href="/admin" className="btn btn-secondary" onClick={() => dialog.current?.close()}>監理者ページを開く</Link> : <>
          <label className="grid gap-1 text-sm font-semibold">パスワード<input className="input" type="password" autoComplete="current-password" value={password} required disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" className="size-4 accent-emerald-700" checked={remember} disabled={busy} onChange={event => setRemember(event.target.checked)} />
            ログイン状態を30日間保持します。
          </label>
        </>}
        <div className="flex justify-end gap-2"><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => dialog.current?.close()}>閉じる</button><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "処理中…" : authenticated ? "ログアウト" : "ログイン"}</button></div>
      </form>
    </dialog>
  </>;
}
