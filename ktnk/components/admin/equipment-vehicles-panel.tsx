"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { EquipmentBoardData, EquipmentVehicle } from "@/lib/equipment-board";

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function EquipmentVehiclesPanel() {
  const [data, setData] = useState<EquipmentBoardData | null>(null);
  const [editing, setEditing] = useState<EquipmentVehicle | "new" | null>(null);
  const [number, setNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [floorId, setFloorId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const response = await apiFetch(`/api/equipment-board?date=${localDate()}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setData(body);
  }, []);

  useEffect(() => { void refresh().catch(error => setMessage(error instanceof Error ? error.message : "取得できませんでした。")); }, [refresh]);

  function open(vehicle: EquipmentVehicle | "new") {
    setEditing(vehicle); setMessage("");
    setNumber(vehicle === "new" ? "" : vehicle.vehicle_number);
    setNotes(vehicle === "new" ? "" : vehicle.notes ?? "");
    setFloorId(vehicle === "new" ? data?.floors[0]?.id ?? "" : vehicle.floor_id);
  }

  async function mutate(payload: object) {
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch("/api/equipment-board", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setEditing(null); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "更新できませんでした。"); }
    finally { setBusy(false); }
  }

  async function reorder(index: number, direction: -1 | 1) {
    if (!data) return;
    const vehicles = [...data.vehicles]; const target = index + direction;
    if (target < 0 || target >= vehicles.length) return;
    [vehicles[index], vehicles[target]] = [vehicles[target], vehicles[index]];
    await mutate({ action: "reorder_vehicles", vehicleIds: vehicles.map(vehicle => vehicle.id) });
  }

  return <section className="panel grid gap-4 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">高所作業車管理</h2><p className="text-sm text-slate-600">号車、現在のフロア、備考、表示順を管理します。</p></div><button type="button" className="btn btn-primary" disabled={busy || !data?.floors.length} onClick={() => open("new")}><Plus size={16}/>号車を追加</button></div>
    {message && <p className="notice-error text-sm" role="alert">{message}</p>}
    {editing && <form className="grid gap-3 rounded-md border-2 border-slate-500 bg-slate-50 p-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const current = editing === "new" ? null : editing; void mutate({ action: "save_vehicle", vehicleId: current?.id ?? null, number, notes, floorId, company: current?.assigned_company ?? null, expected: current?.updated_at ?? null }); }}>
      <label className="field"><span className="label">号車番号</span><input className="input" required maxLength={30} value={number} onChange={event => setNumber(event.target.value)}/></label>
      <label className="field"><span className="label">現在のフロア</span><select className="input" required value={floorId} onChange={event => setFloorId(event.target.value)}>{data?.floors.map(floor => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>
      <label className="field sm:col-span-2"><span className="label">備考（任意）</span><textarea className="textarea min-h-20" maxLength={500} value={notes} onChange={event => setNotes(event.target.value)}/></label>
      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setEditing(null)}>取消</button><button type="submit" className="btn btn-primary" disabled={busy || !number.trim() || !floorId}>保存</button></div>
    </form>}
    {!data && !message && <p className="py-6 text-center text-slate-600">読み込み中…</p>}
    <div className="grid gap-2">{data?.vehicles.map((vehicle, index) => <div key={vehicle.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-slate-500 bg-white p-3"><div className="min-w-0"><p className="font-bold">{vehicle.vehicle_number}号車</p><p className="text-sm text-slate-600">{data.floors.find(floor => floor.id === vehicle.floor_id)?.name ?? "不明"}{vehicle.notes ? ` ／ ${vehicle.notes}` : ""}</p></div><div className="flex flex-wrap justify-end gap-1"><button type="button" className="btn btn-secondary h-11 w-11 p-0" disabled={busy || index === 0} aria-label={`${vehicle.vehicle_number}号車を上へ`} onClick={() => void reorder(index, -1)}><ChevronUp size={17}/></button><button type="button" className="btn btn-secondary h-11 w-11 p-0" disabled={busy || index === data.vehicles.length - 1} aria-label={`${vehicle.vehicle_number}号車を下へ`} onClick={() => void reorder(index, 1)}><ChevronDown size={17}/></button><button type="button" className="btn btn-secondary h-11 w-11 p-0" disabled={busy} aria-label={`${vehicle.vehicle_number}号車を編集`} onClick={() => open(vehicle)}><Pencil size={16}/></button><button type="button" className="btn btn-secondary h-11 w-11 p-0 text-red-700" disabled={busy} aria-label={`${vehicle.vehicle_number}号車を削除`} onClick={() => { if (window.confirm(`${vehicle.vehicle_number}号車を削除しますか？`)) void mutate({ action: "delete_vehicle", vehicleId: vehicle.id, expected: vehicle.updated_at }); }}><Trash2 size={16}/></button></div></div>)}</div>
    {data?.vehicles.length === 0 && <p className="py-6 text-center text-slate-600">登録された号車はありません。</p>}
  </section>;
}
