"use client";

import { useEffect, useState, type ReactNode } from "react";

export function CopyValue({
  value,
  label,
  children,
  stopPropagation = false,
  compact = false,
}: {
  value: string | number;
  label: string;
  children?: ReactNode;
  stopPropagation?: boolean;
  compact?: boolean;
}) {
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (value === "") return <span className="text-slate-400">—</span>;

  return (
    <>
      <button
        type="button"
        className={`${compact ? "px-0.5" : "min-h-9 px-1 whitespace-pre-wrap break-words"} max-w-full rounded text-left underline-offset-4 hover:bg-emerald-50 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700`}
        title={`${label}をコピー`}
        aria-label={`${label}をコピー：${value}`}
        onClick={async (event) => {
          if (stopPropagation) {
            event.preventDefault();
            event.stopPropagation();
          }
          try {
            await navigator.clipboard.writeText(String(value));
            setNotice(`${label}をコピーしました`);
          } catch {
            setNotice("コピーできませんでした。もう一度お試しください。");
          }
        }}
      >
        {children ?? value}
      </button>
      {notice && (
        <span
          role="status"
          className="fixed bottom-5 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 rounded-md bg-slate-800 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          {notice}
        </span>
      )}
    </>
  );
}
