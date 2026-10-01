"use client";
import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { SortableList } from "@/components/ui/sortable-list";
import { apiFetch } from "@/lib/api-client";
import type { EquipmentFloorRow } from "@/lib/types";
export function EquipmentFloorsPanel() {
  const [floors, setFloors] = useState<EquipmentFloorRow[]>([]); const [name, setName] = useState(""); const [editing, setEditing] = useState<string | null>(null); const [editName, setEditName] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = async () => { const response = await apiFetch("/api/admin/equipment-floors"); const body = await response.json(); if (!response.ok) throw new Error(body.error); setFloors(body.floors ?? []); };
  useEffect(() => { void refresh().catch(() => setMessage("フロア一覧を取得できませんでした。")); }, []);
  async function reorder(orderedIds: string[]) {
    if (busy) return;
    const previous = floors;
    setFloors(orderedIds.map(id => floors.find(floor => floor.id === id)!));
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch("/api/admin/equipment-floors", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderedIds }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "並び順を保存できませんでした。");
      await refresh();
    } catch (error) {
      setFloors(previous);
      setMessage(error instanceof Error ? error.message : "並び順を保存できませんでした。");
      await refresh().catch(() => {});
    } finally { setBusy(false); }
  }
  const mutate = async (method: string, body?: object, query = "") => { setBusy(true); setMessage(""); try { const response = await apiFetch(`/api/admin/equipment-floors${query}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setName(""); setEditing(null); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "更新できませんでした。"); } finally { setBusy(false); } };
  return <section className="panel grid gap-3 p-4 sm:p-4"><div><h2 className="text-lg font-bold">設備フロア管理</h2><p className="text-sm text-slate-600">高所作業車・立ち馬の入力候補を管理します。上の行ほど上階として、各画面にこの順番で表示します。</p></div>{message && <p className="notice-error text-sm">{message}</p>}<div className="flex gap-2"><input className="input min-w-0 flex-1" value={name} maxLength={30} placeholder="例：4F" aria-label="追加するフロア名" onChange={e => setName(e.target.value)}/><button type="button" className="btn btn-primary shrink-0" disabled={busy || !name.trim()} onClick={() => void mutate("POST", { name })}><Plus size={16}/>追加</button></div><SortableList ids={floors.map(floor => floor.id)} busy={busy} disabled={editing !== null} onReorder={ids => void reorder(ids)}>{floors.map(floor => <div key={floor.id} className="grid items-center gap-2 rounded-md border border-slate-300 bg-slate-200 px-2 py-1.5 text-slate-900 sm:grid-cols-[minmax(0,1fr)_auto]">{editing === floor.id ? <input className="input" aria-label={`${floor.name}の新しい名称`} value={editName} onChange={e => setEditName(e.target.value)}/> : <span className="min-w-0 break-words font-semibold">{floor.name}</span>}<div className="flex flex-wrap items-center gap-2">{editing === floor.id ? <><button className="btn btn-primary" type="button" disabled={busy || !editName.trim()} onClick={() => void mutate("PATCH", { id: floor.id, name: editName })}>保存</button><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setEditing(null)}>戻る</button></> : <><button className="btn btn-secondary h-8 w-8 p-0" type="button" disabled={busy} onClick={() => { setEditing(floor.id); setEditName(floor.name); }} aria-label={`${floor.name}を編集`}><Pencil size={16}/></button><button className="btn btn-secondary h-8 w-8 p-0 text-red-700" type="button" disabled={busy} onClick={() => void mutate("DELETE", undefined, `?id=${encodeURIComponent(floor.id)}`)} aria-label={`${floor.name}を削除`}><Trash2 size={16}/></button></>}</div></div>)}</SortableList></section>;
}
