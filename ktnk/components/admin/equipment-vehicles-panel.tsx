"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { EquipmentManagementRow } from "@/components/equipment-management-row";
import { EquipmentOrderList } from "@/components/equipment-order-list";
import { apiFetch } from "@/lib/api-client";
import type { EquipmentBoardData, EquipmentVehicle } from "@/lib/equipment-board";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function EquipmentVehiclesPanel() {
  const { confirm, dialog } = useConfirmDialog();
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
      setEditing(null); await refresh(); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "更新できませんでした。"); return false; }
    finally { setBusy(false); }
  }


  async function retry() {
    setBusy(true); setMessage("");
    try { await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "取得できませんでした。"); }
    finally { setBusy(false); }
  }
  return <section className="panel grid gap-2 p-3 sm:p-4">
    <h2 className="text-lg font-bold">高車管理</h2>
    {message && <div className="notice-error text-sm"><p role="alert">{message}</p><button type="button" className="btn btn-secondary mt-2" disabled={busy} onClick={() => void retry()}>再読み込み</button></div>}
    {editing && <form className="grid gap-3 rounded-md border border-slate-300 bg-slate-50 p-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const current = editing === "new" ? null : editing; void mutate({ action: "save_vehicle", vehicleId: current?.id ?? null, number, notes, floorId, company: current?.assigned_company ?? null, date: localDate(), expected: current?.updated_at ?? null }); }}>
      <label className="field"><span className="label">号車番号</span><input className="input" required maxLength={30} value={number} onChange={event => setNumber(event.target.value)}/></label>
      <label className="field"><span className="label">現在のフロア</span><select className="input" required value={floorId} onChange={event => setFloorId(event.target.value)}>{data?.floors.map(floor => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>
      <label className="field sm:col-span-2"><span className="label">備考（任意）</span><textarea className="textarea min-h-20" maxLength={500} value={notes} onChange={event => setNotes(event.target.value)}/></label>
      {editing !== "new" && <button type="button" className="justify-self-start text-xs text-red-700 underline sm:col-span-2" disabled={busy} onClick={async () => { if (await confirm("号車を削除しますか？", `${editing.vehicle_number}号車を削除します。`, "削除する")) void mutate({ action: "delete_vehicle", vehicleId: editing.id, expected: editing.updated_at }); }}>この号車を削除</button>}
      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setEditing(null)}>戻る</button><button type="submit" className="btn btn-primary min-h-9 px-3 py-1 text-sm" disabled={busy || !number.trim() || !floorId}>保存</button></div>
    </form>}
    {!data && !message && <p className="py-6 text-center text-slate-600">読み込み中…</p>}
    <EquipmentOrderList rows={data?.vehicles ?? []} floors={data?.floors ?? []} busy={busy} disabled={editing !== null}
      action={<button type="button" className="btn btn-primary min-h-9 px-2.5 py-1 text-xs" disabled={busy || editing !== null || !data?.floors.length} onClick={() => open("new")}><Plus size={14}/>追加</button>}
      onMove={(vehicle, floorId) => mutate({ action: "move_vehicle", vehicleId: vehicle.id, floorId, company: null, date: localDate(), expected: vehicle.updated_at })}
      onReorder={ids => mutate({ action: "reorder_vehicles", vehicleIds: ids })}>{data?.vehicles.map(vehicle => <EquipmentManagementRow key={vehicle.id} name={`${vehicle.vehicle_number}号車`} notes={vehicle.notes} disabled={busy || editing !== null} onEdit={() => open(vehicle)}/>)}</EquipmentOrderList>
    {data?.vehicles.length === 0 && <p className="py-6 text-center text-slate-600">登録された号車はありません。</p>}
    {dialog}
  </section>;
}
