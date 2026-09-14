"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "実行する",
  destructive = true,
  busy = false,
  children,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={description ? "confirm-description" : undefined} className="panel w-full max-w-md p-5 shadow-xl">
        <h2 id="confirm-title" className="text-lg font-bold text-slate-950">{title}</h2>
        {description && <p id="confirm-description" className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{description}</p>}
        {children}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>キャンセル</button>
          <button type="button" className={`btn ${destructive ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={onConfirm}>{busy ? "処理中…" : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

export function useConfirmDialog() {
  const [request, setRequest] = useState<{ title: string; description: string; confirmLabel?: string } | null>(null);
  const resolver = useRef<((accepted: boolean) => void) | null>(null);
  const close = useCallback((accepted: boolean) => {
    resolver.current?.(accepted);
    resolver.current = null;
    setRequest(null);
  }, []);
  const confirm = useCallback((title: string, description: string, confirmLabel?: string) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setRequest({ title, description, confirmLabel });
  }), []);
  const dialog = <ConfirmDialog open={Boolean(request)} title={request?.title ?? "確認"} description={request?.description} confirmLabel={request?.confirmLabel} onConfirm={() => close(true)} onClose={() => close(false)} />;
  return { confirm, dialog };
}
