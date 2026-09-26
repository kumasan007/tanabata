"use client";

import { useEffect, useState } from "react";
import { DatabaseBackup, Download, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiJson } from "@/lib/api-client";

type Backup = {
  id: string;
  created_at: string;
  source: "automatic" | "manual";
  row_counts: Record<string, number>;
};
type Pending = { kind: "backup"; backup: Backup } | { kind: "import"; file: File };

export function BackupPanel({ onRestored }: { onRestored: () => void }) {
  const { confirm, dialog } = useConfirmDialog();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [password, setPassword] = useState("");

  async function refresh() {
    setBusy(true);
    setMessage("");
    try {
      const body = await apiJson<{ backups: Backup[] }>("/api/admin/backups", { cache: "no-store" });
      setBackups(body.backups);
      setError(false);
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "バックアップを取得できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function create() {
    setBusy(true); setMessage("");
    try {
      await apiJson("/api/admin/backups", { method: "POST" });
      await refresh();
      setError(false); setMessage("バックアップを作成しました。");
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : "作成できませんでした。");
    } finally { setBusy(false); }
  }

  async function requestRestore(backup: Backup) {
    if (!await confirm("この状態へ復元しますか？", `${formatTime(backup.created_at)} の状態に全データを戻します。\n復元直前の状態も自動保存されます。`, "復元へ進む")) return;
    setPassword(""); setPending({ kind: "backup", backup });
  }
  async function requestImport(file: File) {
    if (!await confirm("バックアップを取り込みますか？", `${file.name}\n現在のデータをファイル内の内容に置き換えます。`, "取り込みへ進む")) return;
    setPassword(""); setPending({ kind: "import", file });
  }
  async function execute(event: React.FormEvent) {
    event.preventDefault();
    if (!pending || !password) return;
    const target = pending;
    setPending(null); setPassword(""); setBusy(true); setMessage("");
    try {
      if (target.kind === "backup") {
        await apiJson("/api/admin/backups", {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: target.backup.id, password }),
        });
      } else {
        const data = new FormData(); data.set("file", target.file); data.set("password", password);
        await apiJson("/api/admin/backups", { method: "POST", body: data });
      }
      onRestored(); await refresh(); setError(false);
      setMessage(target.kind === "backup" ? "バックアップを復元しました。" : "バックアップを取り込みました。");
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : "復元できませんでした。");
    } finally { setBusy(false); }
  }

  return <>
    <section className="panel grid gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold text-slate-950">日次バックアップ</h2><p className="mt-1 text-sm text-slate-600">毎日23:59（日本時間）に保存し、10日を過ぎると自動整理します。</p></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void create()}>{busy ? <LoaderCircle className="animate-spin" size={17}/> : <DatabaseBackup size={17}/>}今すぐ保存</button>
          <label className="btn btn-secondary cursor-pointer"><Upload size={17}/>JSONを取り込む<input className="sr-only" type="file" accept="application/json,.json" disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void requestImport(file); }}/></label>
        </div>
      </div>
      {message && <p role={error ? "alert" : "status"} className={error ? "notice-error" : "notice-success"}>{message}</p>}
      <div className="divide-y divide-slate-200 overflow-hidden rounded-md border border-border bg-white">
        {!backups.length && <p className="p-8 text-center text-sm text-slate-500">{busy ? "取得中…" : "バックアップはまだありません。"}</p>}
        {backups.map((backup) => <div key={backup.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-semibold">{formatTime(backup.created_at)} <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{backup.source === "automatic" ? "自動" : "手動"}</span></p><p className="mt-1 text-xs text-slate-500">予定 {backup.row_counts.schedule_groups ?? 0}件・新規入場者 {backup.row_counts.new_entrant_records ?? 0}件</p></div><div className="flex gap-2"><a className="btn btn-secondary" href={`/api/admin/backups?id=${encodeURIComponent(backup.id)}`} download><Download size={16}/>保存</a><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void requestRestore(backup)}><RotateCcw size={16}/>復元</button></div></div>)}
      </div>
    </section>
    {pending && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"><form className="panel grid w-full max-w-sm gap-4 p-5" onSubmit={execute} role="dialog" aria-modal="true"><h2 className="text-lg font-bold">管理者パスワードの再確認</h2><label className="field"><span className="label">管理者パスワード</span><input className="input" type="password" autoComplete="current-password" autoFocus required value={password} onChange={(event) => setPassword(event.target.value)}/></label><div className="flex justify-end gap-2"><button className="btn btn-secondary" type="button" onClick={() => setPending(null)}>キャンセル</button><button className="btn btn-primary" type="submit">実行</button></div></form></div>}
    {dialog}
  </>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
