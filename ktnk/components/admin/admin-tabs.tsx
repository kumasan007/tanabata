"use client";

import { Building2, DatabaseBackup, Forklift, Layers3, Scaling } from "lucide-react";

export type AdminTab = "companies" | "floors" | "vehicles" | "tachiumas" | "backups";
const tabs = [
  { key: "companies", label: "協力会社一覧", icon: Building2 },
  { key: "floors", label: "設備フロア管理", icon: Layers3 },
  { key: "vehicles", label: "高所作業車管理", icon: Forklift },
  { key: "tachiumas", label: "立ち馬管理", icon: Scaling },
  { key: "backups", label: "バックアップ", icon: DatabaseBackup },
] as const;

export function AdminTabs({ active, onChange }: { active: AdminTab; onChange: (tab: AdminTab) => void }) {
  return <nav className="flex gap-2 overflow-x-auto border-b border-slate-500" aria-label="管理画面メニュー" role="tablist">{tabs.map(({ key, label, icon: Icon }) => <button key={key} className={`flex min-h-12 shrink-0 items-center gap-2 border-b-[3px] px-3 text-sm font-semibold ${active === key ? "border-emerald-800 bg-emerald-50 text-emerald-900" : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`} type="button" role="tab" aria-selected={active === key} onClick={() => onChange(key)}><Icon size={18} aria-hidden="true" />{label}</button>)}</nav>;
}
