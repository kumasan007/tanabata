import { LoaderCircle } from "lucide-react";

export function LoadingIndicator({ label = "読み込み中…" }: { label?: string }) {
  return <div role="status" className="flex items-center justify-center gap-2 p-6 text-sm text-slate-600"><LoaderCircle className="animate-spin" size={20} aria-hidden="true" />{label}</div>;
}
