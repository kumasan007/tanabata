"use client";
import { useEffect, useRef, useState } from "react";
import { DatabaseBackup, Download, History, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api-client";
type BackupRow = {
    id: string;
    created_at: string;
    backup_date: string;
    source: "automatic" | "manual";
    schema_version: number;
    row_counts: Record<string, number>;
};
type AuditLogRow = {
    id: number;
    changed_at: string;
    transaction_id: number;
    table_name: string;
    operation: "INSERT" | "UPDATE" | "DELETE";
    row_id: string | null;
    old_data: Record<string, unknown> | null;
    new_data: Record<string, unknown> | null;
    restored_at: string | null;
};
type PendingRestore = {
    kind: "backup";
    backup: BackupRow;
} | {
    kind: "audit";
    log: AuditLogRow;
} | {
    kind: "import";
    file: File;
};
export function RecoveryPanel({ kind, active, onRestored }: {
    kind: "backups" | "auditLogs";
    active: boolean;
    onRestored: () => void;
}) {
    const { confirm, dialog: confirmationDialog } = useConfirmDialog();
    const [backups, setBackups] = useState<BackupRow[]>([]);
    const [backupLoading, setBackupLoading] = useState(false);
    const [backupMessage, setBackupMessage] = useState("");
    const [backupError, setBackupError] = useState(false);
    const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditMessage, setAuditMessage] = useState("");
    const [auditError, setAuditError] = useState(false);
    const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
    const [restorePassword, setRestorePassword] = useState("");
    const loadedAt = useRef({ backups: 0, auditLogs: 0 });
    useEffect(() => { if (!active || Date.now() - loadedAt.current[kind] < 30_000) return;
    if (kind === "backups")
        void refreshBackups();
    else
        void refreshAuditLogs(); }, [kind, active]);
    async function refreshBackups() {
        setBackupLoading(true);
        setBackupMessage("");
        setBackupError(false);
        try {
            const response = await apiFetch("/api/admin/backups", { cache: "no-store" });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "バックアップ履歴を取得できませんでした。");
            setBackups(body.backups ?? []);
            loadedAt.current.backups = Date.now();
        }
        catch (error) {
            setBackupError(true);
            setBackupMessage(error instanceof Error ? error.message : "バックアップ履歴を取得できませんでした。");
        }
        finally {
            setBackupLoading(false);
        }
    }
    async function createBackup() {
        setBackupLoading(true);
        setBackupMessage("");
        setBackupError(false);
        try {
            const response = await apiFetch("/api/admin/backups", { method: "POST" });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "バックアップを作成できませんでした。");
            loadedAt.current.auditLogs = 0;
            await refreshBackups();
            setBackupMessage("バックアップを作成しました。");
        }
        catch (error) {
            setBackupError(true);
            setBackupMessage(error instanceof Error ? error.message : "バックアップを作成できませんでした。");
        }
        finally {
            setBackupLoading(false);
        }
    }
    async function requestBackupImport(file: File) {
        if (!await confirm("バックアップを取り込みますか？", `${file.name}\n現在のデータはファイル内のデータに置き換わります。`, "取り込みへ進む"))
            return;
        setRestorePassword("");
        setPendingRestore({ kind: "import", file });
    }
    async function importBackup(file: File, password: string) {
        setBackupLoading(true);
        setBackupMessage("");
        setBackupError(false);
        try {
            const formData = new FormData();
            formData.set("file", file);
            formData.set("password", password);
            const response = await apiFetch("/api/admin/backups", { method: "POST", body: formData });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "バックアップを取り込めませんでした。");
            loadedAt.current = { backups: 0, auditLogs: 0 };
            onRestored();
            await refreshBackups();
            setBackupMessage("バックアップを取り込みました。");
        }
        catch (error) {
            setBackupError(true);
            setBackupMessage(error instanceof Error ? error.message : "バックアップを取り込めませんでした。");
        }
        finally {
            setBackupLoading(false);
        }
    }
    async function requestBackupRestore(backup: BackupRow) {
        if (!await confirm("この状態へ復元しますか？", `${formatBackupTime(backup.created_at)} の状態に全データを戻します。\n復元前のデータはバックアップとして保存されます。`, "復元へ進む"))
            return;
        setRestorePassword("");
        setPendingRestore({ kind: "backup", backup });
    }
    async function restoreBackup(backup: BackupRow, password: string) {
        setBackupLoading(true);
        setBackupMessage("");
        setBackupError(false);
        try {
            const response = await apiFetch("/api/admin/backups", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id: backup.id, password }),
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "バックアップを復元できませんでした。");
            loadedAt.current = { backups: 0, auditLogs: 0 };
            onRestored();
            await refreshBackups();
            setBackupMessage("バックアップを復元しました。復元前のデータも保険として保存されています。");
        }
        catch (error) {
            setBackupError(true);
            setBackupMessage(error instanceof Error ? error.message : "バックアップを復元できませんでした。");
        }
        finally {
            setBackupLoading(false);
        }
    }
    async function refreshAuditLogs() {
        setAuditLoading(true);
        setAuditMessage("");
        setAuditError(false);
        try {
            const response = await apiFetch("/api/admin/audit-logs", { cache: "no-store" });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "操作履歴を取得できませんでした。");
            setAuditLogs(body.logs ?? []);
            loadedAt.current.auditLogs = Date.now();
        }
        catch (error) {
            setAuditError(true);
            setAuditMessage(error instanceof Error ? error.message : "操作履歴を取得できませんでした。");
        }
        finally {
            setAuditLoading(false);
        }
    }
    async function requestAuditChangeRestore(log: AuditLogRow) {
        if (!await confirm("変更前の状態へ戻しますか？", auditLogDescription(log, auditLogs), "復元へ進む"))
            return;
        setRestorePassword("");
        setPendingRestore({ kind: "audit", log });
    }
    async function restoreAuditChange(log: AuditLogRow, password: string) {
        setAuditLoading(true);
        setAuditMessage("");
        setAuditError(false);
        try {
            let { response, body } = await requestAuditRestore(log.id, false, password);
            if (response.status === 409 && body.code === "AUDIT_NEWER_CHANGE_EXISTS") {
                const force = await confirm("新しい変更を上書きしますか？", "このデータは、その後にも変更されています。続けると新しい内容が失われる可能性があります。", "上書きして戻す");
                if (!force)
                    return;
                ({ response, body } = await requestAuditRestore(log.id, true, password));
            }
            if (!response.ok)
                throw new Error(body.error ?? "変更を戻せませんでした。");
            loadedAt.current = { backups: 0, auditLogs: 0 };
            onRestored();
            await refreshAuditLogs();
            setAuditMessage("変更前の状態に戻しました。この復元操作も履歴に保存されています。");
        }
        catch (error) {
            setAuditError(true);
            setAuditMessage(error instanceof Error ? error.message : "変更を戻せませんでした。");
        }
        finally {
            setAuditLoading(false);
        }
    }
    function confirmPendingRestore(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const pending = pendingRestore;
        const password = restorePassword;
        if (!pending || !password)
            return;
        setPendingRestore(null);
        setRestorePassword("");
        if (pending.kind === "backup")
            void restoreBackup(pending.backup, password);
        else if (pending.kind === "audit")
            void restoreAuditChange(pending.log, password);
        else
            void importBackup(pending.file, password);
    }
    return <>{kind === "backups" ? (<section className="panel grid gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">バックアップ</h2>
              <p className="mt-1 text-sm text-slate-600">
                毎日23:59（日本時間）に自動保存します。バックアップは手動削除できず、10日を過ぎると自動で整理されます。
              </p>
            </div>
            <button className="btn btn-primary" type="button" disabled={backupLoading} onClick={() => void createBackup()}>
              {backupLoading ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true"/> : <DatabaseBackup size={17} aria-hidden="true"/>}
              今すぐバックアップ
            </button>
            <label className="btn btn-secondary cursor-pointer">
              <Upload size={17} aria-hidden="true"/>
              JSONを取り込む
              <input className="sr-only" type="file" accept="application/json,.json" disabled={backupLoading} onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file)
                    requestBackupImport(file);
            }}/>
            </label>
          </div>

          {backupMessage ? (<p className={`rounded-md border px-4 py-3 text-sm ${backupError ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} role={backupError ? "alert" : "status"}>
              {backupMessage}
            </p>) : null}

          <div className="overflow-hidden rounded-md border border-border bg-white">
            {backups.length === 0 ? (<p className="px-4 py-8 text-center text-sm text-slate-500">
                {backupLoading ? "取得中…" : "バックアップはまだありません。"}
              </p>) : (<div className="divide-y divide-slate-200">
                {backups.map((backup) => (<div key={backup.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
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
                        <Download size={16} aria-hidden="true"/>
                        PCに保存
                      </a>
                      <button className="btn btn-secondary" type="button" disabled={backupLoading} onClick={() => requestBackupRestore(backup)}>
                        <RotateCcw size={16} aria-hidden="true"/>
                        復元
                      </button>
                    </div>
                  </div>))}
              </div>)}
          </div>
        </section>) : (<section className="panel grid gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">操作履歴</h2>
              <p className="mt-1 text-sm text-slate-600">
                過去24時間の登録・編集・削除を保存します。復元操作も履歴に残るため、間違えた復元を戻せます。期限切れ履歴は1日1回まとめて削除されます。
              </p>
            </div>
            <button className="btn btn-secondary" type="button" disabled={auditLoading} onClick={() => void refreshAuditLogs()}>
              {auditLoading ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true"/> : <History size={17} aria-hidden="true"/>}
              更新
            </button>
          </div>

          {auditMessage ? (<p className={`rounded-md border px-4 py-3 text-sm ${auditError ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} role={auditError ? "alert" : "status"}>
              {auditMessage}
            </p>) : null}

          <div className="overflow-hidden rounded-md border border-border bg-white">
            {auditLogs.length === 0 ? (<p className="px-4 py-8 text-center text-sm text-slate-500">
                {auditLoading ? "取得中…" : "過去24時間の操作履歴はありません。"}
              </p>) : (<div className="divide-y divide-slate-200">
                {auditLogs.map((log) => (<div key={log.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{auditLogDescription(log, auditLogs)}</p>
                        <span className={`rounded px-2 py-0.5 text-xs font-bold ${auditOperationClass(log.operation)}`}>
                          {auditOperationLabel(log.operation)}
                        </span>
                        {log.restored_at ? <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">復元済み</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{formatBackupTime(log.changed_at)}</p>
                      <AuditChangeDetails log={log}/>
                    </div>
                    <button className="btn btn-secondary" type="button" disabled={auditLoading || Boolean(log.restored_at)} onClick={() => requestAuditChangeRestore(log)}>
                      <RotateCcw size={16} aria-hidden="true"/>
                      この変更を戻す
                    </button>
                  </div>))}
              </div>)}
          </div>
        </section>)}{pendingRestore ? (<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="presentation">
          <form className="panel grid w-full max-w-sm gap-4 p-5" onSubmit={confirmPendingRestore} role="dialog" aria-modal="true" aria-labelledby="restore-password-title">
            <div>
              <h2 id="restore-password-title" className="text-lg font-bold text-slate-950">管理者パスワードの再確認</h2>
              <p className="mt-1 text-sm text-slate-600">
                {pendingRestore.kind === "audit" ? "操作履歴を巻き戻します。" : "バックアップからデータを復元します。"}
              </p>
            </div>
            <label className="field">
              <span className="label">管理者パスワード</span>
              <input className="input" type="password" autoComplete="current-password" autoFocus required value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)}/>
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" type="button" onClick={() => { setPendingRestore(null); setRestorePassword(""); }}>
                キャンセル
              </button>
              <button className="btn btn-primary" type="submit" disabled={!restorePassword}>
                <RotateCcw size={16} aria-hidden="true"/>
                実行
              </button>
            </div>
          </form>
        </div>) : null}{confirmationDialog}</>;
}
function formatBackupTime(value: string) {
    return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}
function auditOperationLabel(operation: AuditLogRow["operation"]) {
    if (operation === "INSERT")
        return "登録";
    if (operation === "UPDATE")
        return "編集";
    return "削除";
}
function auditOperationClass(operation: AuditLogRow["operation"]) {
    if (operation === "INSERT")
        return "bg-emerald-100 text-emerald-800";
    if (operation === "UPDATE")
        return "bg-sky-100 text-sky-800";
    return "bg-red-100 text-red-800";
}
function auditLogDescription(log: AuditLogRow, logs: AuditLogRow[] = []) {
    const data = log.new_data ?? log.old_data ?? {};
    const tableLabels: Record<string, string> = {
        company_master: "会社マスタ",
        schedule_groups: "作業予定",
        schedule_subcompanies: "二次会社の予定",
        new_entrant_records: "新規入場者",
        work_completion_reports: "作業終了",
    };
    const scheduleGroupId = stringField(data, "schedule_group_id");
    const relatedSchedule = scheduleGroupId
        ? logs.find((candidate) => {
            if (candidate.transaction_id !== log.transaction_id || candidate.table_name !== "schedule_groups") return false;
            const candidateData = candidate.new_data ?? candidate.old_data ?? {};
            return stringField(candidateData, "id") === scheduleGroupId;
        })
        : undefined;
    const relatedScheduleData = relatedSchedule?.new_data ?? relatedSchedule?.old_data ?? {};
    const details = [
        stringField(data, "work_date") || stringField(data, "entry_date"),
        stringField(data, "primary_company") || stringField(relatedScheduleData, "primary_company"),
        stringField(data, "secondary_company"),
        stringField(data, "person_names"),
    ].filter(Boolean);
    return `${tableLabels[log.table_name] ?? log.table_name}${details.length ? `（${details.join("・")}）` : ""}`;
}
const auditFieldLabels: Record<string, string> = {
    work_date: "作業日",
    entry_date: "入場日",
    primary_company: "一次会社",
    secondary_company: "二次会社",
    primary_trade_roles: "職種",
    primary_count: "一次会社人数",
    worker_count: "人数",
    person_count: "入場者数",
    person_names: "氏名",
    nationality_status: "国籍区分",
    work_area: "作業場所",
    work_content: "作業内容",
    uses_aerial_work_vehicle: "高所作業車使用",
    aerial_work_vehicle_notes: "高所作業車使用内容",
    uses_fire: "火気使用",
    uses_tachiuma: "立馬使用",
    tachiuma_notes: "立馬備考",
    notes: "備考",
    sort_order: "表示順",
    reported_at: "終了報告日時",
};
const hiddenAuditFields = new Set(["id", "schedule_group_id", "created_at", "updated_at", "sort_order"]);
function AuditChangeDetails({ log }: { log: AuditLogRow }) {
    const oldData = log.old_data ?? {};
    const newData = log.new_data ?? {};
    const keys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]))
        .filter((key) => !hiddenAuditFields.has(key))
        .filter((key) => log.operation !== "UPDATE" || !sameAuditValue(oldData[key], newData[key]));
    if (keys.length === 0)
        return null;
    return <dl className="mt-3 grid gap-1.5 rounded-md bg-slate-50 px-3 py-2 text-xs">
      {keys.map((key) => <div key={key} className="grid min-w-0 gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-2">
        <dt className="font-semibold text-slate-600">{auditFieldLabels[key] ?? key}</dt>
        <dd className="min-w-0 whitespace-pre-wrap break-words text-slate-800">
          {log.operation === "UPDATE"
            ? <><span className="text-slate-500">{formatAuditValue(key, oldData[key])}</span><span className="mx-1.5" aria-label="から">→</span><span>{formatAuditValue(key, newData[key])}</span></>
            : formatAuditValue(key, (log.operation === "INSERT" ? newData : oldData)[key])}
        </dd>
      </div>)}
    </dl>;
}
function sameAuditValue(left: unknown, right: unknown) {
    return JSON.stringify(left) === JSON.stringify(right);
}
function formatAuditValue(key: string, value: unknown) {
    if (value === null || value === undefined || value === "")
        return "未設定";
    if (key === "nationality_status")
        return value === "japanese_only" ? "日本人のみ" : value === "includes_foreign" ? "外国籍を含む" : String(value);
    if (typeof value === "boolean")
        return value ? "あり" : "なし";
    if (Array.isArray(value))
        return value.length ? value.map(String).join("、") : "未設定";
    if ((key === "reported_at" || key.endsWith("_at")) && typeof value === "string") {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime()))
            return formatBackupTime(value);
    }
    return String(value);
}
function stringField(data: Record<string, unknown>, key: string) {
    return typeof data[key] === "string" ? data[key] : "";
}
async function requestAuditRestore(id: number, force: boolean, password: string) {
    const response = await apiFetch("/api/admin/audit-logs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, force, password }),
    });
    const body = await response.json();
    return { response, body };
}
