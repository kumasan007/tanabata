import { LoaderCircle } from "lucide-react";

export function LoadingIndicator({ label = "読み込み中…", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`loading-reveal flex items-center justify-center gap-2 p-6 text-sm text-slate-600 ${className}`}>
      <LoaderCircle className="animate-spin" size={20} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function LoadingOverlay({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div className="loading-reveal absolute inset-0 z-10 grid place-items-center bg-white/70 backdrop-blur-[1px]">
      <LoadingIndicator label={label} className="rounded-md bg-white/90 px-4 py-3 shadow-sm" />
    </div>
  );
}
