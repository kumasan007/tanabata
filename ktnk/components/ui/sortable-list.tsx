"use client";

import { Children, Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { LoadingOverlay } from "@/components/loading-indicator";

export function SortableList({ ids, children, onReorder, busy = false, disabled = false, handles = true, className = "", renderBefore }: {
  ids: string[]; children: ReactNode; onReorder: (ids: string[], movedId: string, targetId?: string) => void | Promise<boolean | void>;
  busy?: boolean; disabled?: boolean; handles?: boolean; className?: string;
  renderBefore?: (id: string, previousId: string | undefined, movingId: string | undefined, order: string[], targetId: string | undefined) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const drag = useRef<{ id: string; order: string[]; start: string[]; pointer: number; targetId?: string } | null>(null);
  const positions = useRef(new Map<string, number>());
  const suppressAnimation = useRef(false);
  const order = preview ?? ids;
  const rows = Children.toArray(children);
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    root.current?.querySelectorAll<HTMLElement>(":scope > [data-sort-id]").forEach(row => {
      const id = row.dataset.sortId!;
      const top = row.offsetTop;
      const previous = positions.current.get(id);
      if (!suppressAnimation.current && previous !== undefined && previous !== top && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        row.animate([{ transform: `translateY(${previous - top}px)` }, { transform: "translateY(0)" }], { duration: 180, easing: "ease-out" });
      }
      next.set(id, top);
    });
    positions.current = next;
    suppressAnimation.current = false;
  }, [order]);
  async function finish(commit: boolean) {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (commit && current.order.some((id, i) => id !== current.start[i])) {
      suppressAnimation.current = true;
      setPreview(current.order);
      const saved = await onReorder(current.order, current.id, current.targetId);
      if (saved === false) suppressAnimation.current = true;
    }
    setPreview(null);
  }
  return <div className="relative min-w-0" aria-busy={busy}>
    <div ref={root} className={`relative grid gap-2 p-1 ${className}`} inert={busy || undefined}
      onPointerDown={event => {
        if (busy || disabled || event.button !== 0) return;
        const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-sort-handle]");
        const row = handle?.closest<HTMLElement>("[data-sort-id]");
        if (!row || row.parentElement !== root.current) return;
        event.preventDefault(); event.stopPropagation();
        handle?.focus({ preventScroll: true });
        root.current?.setPointerCapture(event.pointerId);
        drag.current = { id: row.dataset.sortId!, order: [...ids], start: [...ids], pointer: event.pointerId };
        setPreview([...ids]);
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.pointer !== event.pointerId) return;
        event.stopPropagation();
        const candidates = root.current?.querySelectorAll<HTMLElement>(":scope > [data-sort-id], :scope > [data-sort-before]");
        const target = Array.from(candidates ?? []).find(row => {
          const rect = row.getBoundingClientRect();
          return event.clientY >= rect.top && event.clientY <= rect.bottom;
        });
        const beforeId = target?.dataset.sortBefore;
        const targetId = beforeId ?? target?.dataset.sortId;
        if (!targetId || targetId === current.id) return;
        current.targetId = targetId;
        const next = [...current.order];
        const from = next.indexOf(current.id), to = next.indexOf(targetId);
        if (beforeId) {
          next.splice(from, 1);
          next.splice(next.indexOf(targetId), 0, current.id);
          current.order = next; setPreview(next);
          target?.scrollIntoView({ block: "nearest" });
          return;
        }
        const rect = target!.getBoundingClientRect();
        if (from < to ? event.clientY < rect.top + rect.height / 2 : event.clientY > rect.top + rect.height / 2) return;
        next.splice(to, 0, next.splice(from, 1)[0]);
        current.order = next; setPreview(next);
        target?.scrollIntoView({ block: "nearest" });
      }}
      onPointerUp={event => { if (drag.current) { event.stopPropagation(); void finish(true); } }}
      onPointerCancel={() => void finish(false)} onLostPointerCapture={() => void finish(false)}
      onKeyDown={event => { if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); finish(false); } }}>
      {order.map((id, index) => <Fragment key={id}>
        {renderBefore && <div data-sort-before={id}>{renderBefore(id, order[index - 1], drag.current?.id, order, drag.current?.targetId)}</div>}
        <div data-sort-id={id} className={`relative min-w-0 rounded-md transition-colors ${handles ? "flex items-center gap-1" : ""} ${preview && drag.current?.id === id ? "bg-emerald-50" : ""}`}>
        {preview && drag.current?.id === id && <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 rounded-md border-2 border-emerald-500"/>}
        {handles && <button type="button" data-sort-handle className="flex h-11 w-8 shrink-0 touch-none items-center justify-center rounded-md text-slate-500 cursor-grab hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 active:cursor-grabbing disabled:opacity-40" disabled={disabled || busy} aria-label="ドラッグして並び替え（矢印キーでも移動できます）" onKeyDown={event => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault(); event.stopPropagation();
          const next = [...ids], from = next.indexOf(id), to = from + (event.key === "ArrowUp" ? -1 : 1);
          if (to < 0 || to >= next.length) return;
          const targetId = next[to];
          next.splice(to, 0, next.splice(from, 1)[0]); onReorder(next, id, targetId);
        }}><GripVertical size={18}/></button>}
        <div className="min-w-0 flex-1">{rows[ids.indexOf(id)]}</div>
        </div>
      </Fragment>)}
    </div>
    {busy && <LoadingOverlay label="保存中…"/>}
  </div>;
}
