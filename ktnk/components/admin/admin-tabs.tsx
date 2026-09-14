"use client";

import { Building2, DatabaseBackup, History } from "lucide-react";

export type AdminTab = "schedules" | "companies" | "backups" | "auditLogs";
const tabs = [{ key: "companies", label: "協力会社一覧", icon: Building2 }, { key: "backups", label: "バックアップ", icon: DatabaseBackup }, { key: "auditLogs", label: "操作履歴", icon: History }] as const;

export function AdminTabs({ active, onChange }: { active: AdminTab; onChange: (tab: AdminTab) => void }) {
  return <nav className="flex gap-2 overflow-x-auto border-b border-slate-200" aria-label="管理画面メニュー">{tabs.map(({ key, label, icon: Icon }) => <button key={key} className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${active === key ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`} type="button" aria-pressed={active === key} onClick={() => onChange(key)}><Icon size={18} aria-hidden="true" />{label}</button>)}</nav>;
}
