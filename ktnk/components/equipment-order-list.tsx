"use client";

import { Children, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { SortableList } from "@/components/ui/sortable-list";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { normalizeEquipmentOrder, reorderDestination } from "@/lib/equipment-order";

export function EquipmentOrderList<T extends { id: string; floor_id: string }>({ rows, floors, children, busy, disabled, className, action, onMove, onReorder }: {
  rows: T[]; floors: { id: string; name: string }[]; children: ReactNode;
  busy?: boolean; disabled?: boolean; className?: string; action?: ReactNode;
  onMove: (row: T, floorId: string) => Promise<boolean>;
  onReorder: (ids: string[]) => Promise<unknown>;
}) {
  const { confirm, dialog } = useConfirmDialog();
  const pending = useRef(false);
  const [working, setWorking] = useState(false);
  const [sorting, setSorting] = useState(false);
  const ids = rows.map(row => row.id);
  const content = Children.toArray(children);
  async function reorder(next: string[], movedId: string, targetId?: string) {
    if (busy || disabled || pending.current) return false;
    pending.current = true;
    setWorking(true);
    try {
      const floorId = reorderDestination(rows, next, movedId, targetId);
      if (floorId) {
        const from = rows.find(row => row.id === movedId)!;
        if (!await confirm("フロアを変更しますか？", `${floors.find(f => f.id === from.floor_id)?.name ?? "不明"} → ${floors.find(f => f.id === floorId)?.name ?? "不明"}`, "変更する")) return false;
        if (!await onMove(from, floorId)) return false;
      }
      const saved = await onReorder(normalizeEquipmentOrder(rows, next, movedId, floorId, floors));
      return saved !== false;
    } finally { pending.current = false; setWorking(false); }
  }
  function step(index: number, direction: number) {
    const next = [...ids];
    next.splice(index + direction, 0, next.splice(index, 1)[0]);
    void reorder(next, ids[index]);
  }
  return <>
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-500">{sorting ? "ドラッグ・矢印で移動" : `フロア別 · ${rows.length}台`}</span>
      <div className="flex items-center gap-1.5">{action}<button type="button" className={`h-9 rounded-md border px-2.5 font-semibold ${sorting ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 text-slate-700"}`} disabled={busy || working || disabled || rows.length < 2} aria-pressed={sorting} onClick={() => setSorting(value => !value)}>{sorting ? "終了" : "並び替え"}</button></div>
    </div>
    {sorting && <p className="text-xs text-slate-500">別フロアへの移動は確認後に反映します。</p>}
    <SortableList ids={ids} handles={sorting} busy={busy || working} disabled={disabled || !sorting} className={`!gap-0 !p-0 overflow-hidden rounded-md border border-slate-200 ${className ?? ""}`} onReorder={reorder} renderBefore={(id, previousId, movingId, currentOrder, targetId) => {
      const row = rows.find(item => item.id === id);
      const previous = rows.find(item => item.id === previousId);
      const destination = movingId ? reorderDestination(rows, currentOrder, movingId, targetId) : null;
      const floorOf = (item: T | undefined) => item?.id === movingId && destination ? destination : item?.floor_id;
      const floorId = floorOf(row);
      if (!row || floorOf(previous) === floorId) return null;
      const count = rows.filter(item => floorOf(item) === floorId).length;
      return <div className="flex items-center justify-between bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700"><span>{floors.find(f => f.id === floorId)?.name ?? "不明"}</span><span className="font-normal">{count}台</span></div>;
    }}>
      {rows.map((row, index) => <div key={row.id} className="border-b border-slate-100">
        <div className="flex items-center"><div className="min-w-0 flex-1">{content[index]}</div>{sorting && <div className="flex shrink-0 pr-1">
          <button type="button" className="h-10 w-8 rounded hover:bg-slate-100 disabled:opacity-25" disabled={busy || working || disabled || index === 0} aria-label="上へ移動" onClick={() => step(index, -1)}><ChevronUp className="mx-auto" size={16}/></button>
          <button type="button" className="h-10 w-8 rounded hover:bg-slate-100 disabled:opacity-25" disabled={busy || working || disabled || index === rows.length - 1} aria-label="下へ移動" onClick={() => step(index, 1)}><ChevronDown className="mx-auto" size={16}/></button>
        </div>}</div>
      </div>)}
    </SortableList>
    {dialog}
  </>;
}
