"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { SESSION_CHANGED } from "@/lib/employee-session";
import { apiFetch } from "@/lib/api-client";
import type { EquipmentBoardData, EquipmentVehicle } from "@/lib/equipment-board";
import type { EquipmentType } from "@/lib/types";

type Operation = { action: "register_vehicle" | "move_vehicle" | "set_stock" | "move_stock"; floorId: string; vehicle?: EquipmentVehicle; expected?: string | null };

export function EquipmentBoard({ date, version }: { date: string; version: number }) {
  const [data, setData] = useState<EquipmentBoardData | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const sequence = useRef(0);
  const [extra, setExtra] = useState<Record<EquipmentType, string[]>>({ aerial_work_vehicle: [], tachiuma: [] });
  const [adding, setAdding] = useState<EquipmentType | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [target, setTarget] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [number, setNumber] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assignedCompany, setAssignedCompany] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/equipment-board?date=${date}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (current === sequence.current) setData(body);
    } catch (error) {
      if (current === sequence.current) { setData(null); setMessage(error instanceof Error ? error.message : "取得できませんでした。"); }
    } finally { if (current === sequence.current) setLoading(false); }
  }, [date]);

  useEffect(() => {
    setMessage("");
    void refresh();
    const onFocus = () => { if (!pending.current) void refresh(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener(SESSION_CHANGED, onFocus);
    const onStorage = (event: StorageEvent) => { if (event.key === SESSION_CHANGED) onFocus(); };
    window.addEventListener("storage", onStorage);
    return () => { ++sequence.current; window.removeEventListener("focus", onFocus); window.removeEventListener(SESSION_CHANGED, onFocus); window.removeEventListener("storage", onStorage); };
  }, [refresh, version]);

  function open(next: Operation) {
    setConfirmDelete(false);
    setOperation(next); setTarget(next.floorId); setNumber("");
    setAssignedCompany(next.vehicle?.assigned_company ?? "");
    setQuantity(next.action === "set_stock" ? String(data?.stocks.find(stock => stock.floor_id === next.floorId)?.quantity ?? 0) : "1");
    setMessage(""); dialog.current?.showModal();
  }

  async function save(payload: object) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const response = await apiFetch("/api/equipment-board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      dialog.current?.close(); setOperation(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存できませんでした。");
      // Keep the expected revision on the open form; never silently overwrite a newer edit.
      await refresh();
    } finally { pending.current = false; setBusy(false); }
  }

  const disabled = busy || loading;
  function assignDropped(event: React.DragEvent, floorId: string, company: string | null) {
    event.preventDefault(); event.stopPropagation();
    if (!data?.canEdit || disabled) return;
    const vehicle = data.vehicles.find(row => row.id === event.dataTransfer.getData("text/plain"));
    if (vehicle && (vehicle.floor_id !== floorId || vehicle.assigned_company !== company)) {
      void save({ action: "move_vehicle", vehicleId: vehicle.id, floorId, company, expected: vehicle.updated_at });
    }
  }
  function vehicleChip(vehicle: EquipmentVehicle, compact = false) {
    const number = Number(vehicle.vehicle_number);
    const circled = Number.isInteger(number) && number >= 1 && number <= 20 && String(number) === vehicle.vehicle_number
      ? String.fromCodePoint(0x2460 + number - 1) : vehicle.vehicle_number;
    return <span key={vehicle.id} draggable={Boolean(data?.canEdit && !disabled)}
      onDragStart={event => { event.dataTransfer.setData("text/plain", vehicle.id); event.dataTransfer.effectAllowed = "move"; }}
      className={`inline-flex min-h-9 items-center justify-center rounded border border-sky-200 bg-sky-50 px-2 py-1 font-bold leading-tight text-sky-900 cursor-grab select-none ${compact ? "min-w-9 text-2xl" : "text-base"}`}
      aria-label={`${vehicle.vehicle_number}号車：${vehicle.assigned_company ?? "未割当"}${data?.canEdit ? "、移動・会社割当" : ""}`}>{compact ? circled : `${vehicle.vehicle_number}号車`}</span>;
  }
  return <div className="grid gap-4" aria-busy={disabled}>
    {data && !data.canEdit && <p className="text-xs text-slate-500">編集する場合は、サイト右上のアイコンからログインしてください。</p>}
    {message && <p className="notice-error" role="alert">{message}</p>}
    {loading && <p role="status">機材情報を読み込み中…</p>}
    {data && (["aerial_work_vehicle", "tachiuma"] as const).map(type => {
      const requests = data.requests.filter(row => row.equipment_type === type);
      const companies = [...new Set([...requests.map(row => row.company), ...(type === "aerial_work_vehicle" ? data.vehicles.flatMap(vehicle => vehicle.assigned_company ? [vehicle.assigned_company] : []) : [])])].sort((a, b) => a.localeCompare(b, "ja"));
      const countAt = (floor: string) => type === "aerial_work_vehicle" ? data.vehicles.filter(v => v.floor_id === floor).length : data.stocks.find(s => s.floor_id === floor)?.quantity ?? 0;
      const visible = data.floors.filter(floor => countAt(floor.id) > 0 || requests.some(row => row.floor_id === floor.id) || (data.canEdit && extra[type].includes(floor.id)));
      const hidden = data.floors.filter(floor => !visible.some(row => row.id === floor.id));
      return <section className="panel min-w-0 overflow-hidden" key={type}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
          <h3 className="font-bold">{type === "aerial_work_vehicle" ? "高所作業車" : "立ち馬"}</h3>
          {data.canEdit && <div className="flex flex-wrap gap-2">
            {type === "aerial_work_vehicle" && <select aria-label="号車を選んで操作" className="rounded-md border border-slate-300 px-2 text-sm" value="" disabled={disabled} onChange={event => { const vehicle = data.vehicles.find(row => row.id === event.target.value); if (vehicle) open({ action: "move_vehicle", floorId: vehicle.floor_id, vehicle }); }}><option value="">号車を選んで操作</option>{data.vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_number}号車</option>)}</select>}

            <button type="button" className="btn btn-secondary" disabled={disabled || hidden.length === 0} onClick={() => setAdding(adding === type ? null : type)}>フロアを追加</button>
            {type === "aerial_work_vehicle" && <button type="button" className="btn btn-primary" disabled={disabled || !data.floors.length} onClick={() => open({ action: "register_vehicle", floorId: data.floors[0].id })}>号車を登録</button>}
          </div>}
        </div>
        {adding === type && data.canEdit && <label className="block px-3 pb-3 text-sm">表示するフロア<select className="input mt-1" value="" onChange={event => { const id = event.target.value; if (id) setExtra(current => ({ ...current, [type]: [...current[type], id] })); setAdding(null); }}><option value="">フロアを選択</option>{hidden.map(floor => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>}
        <div className="overflow-x-auto">
          <table className="w-full select-none border-collapse whitespace-nowrap text-center text-sm [&_th]:border-r [&_th]:border-slate-300 [&_td]:border-r [&_td]:border-slate-300">
            <caption className="sr-only">{type === "aerial_work_vehicle" ? "高所作業車" : "立ち馬"}の現在配置と会社別希望台数</caption>
            <thead className="bg-slate-100"><tr><th scope="col" className="sticky left-0 z-10 w-16 bg-slate-100 px-1 py-2">フロア</th><th scope="col" className="w-20 px-2 py-2 text-xs">現在台数</th>{type === "aerial_work_vehicle" && <th scope="col" className="p-3">号車</th>}{companies.map(company => <th scope="col" className="p-3" key={company}>{company}</th>)}<th scope="col" className="p-3">希望合計</th></tr></thead>
            <tbody>{visible.map(floor => {
              const count = countAt(floor.id);
              const total = requests.filter(row => row.floor_id === floor.id).reduce((sum, row) => sum + row.requested_count, 0);
              const stock = data.stocks.find(row => row.floor_id === floor.id);
              return <tr key={floor.id} className="border-t border-slate-200 hover:bg-sky-50" onDragOver={event => { if (data.canEdit && !disabled && type === "aerial_work_vehicle") { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={event => {
                event.preventDefault(); if (!data.canEdit || disabled || type !== "aerial_work_vehicle") return;
                const vehicle = data.vehicles.find(row => row.id === event.dataTransfer.getData("text/plain"));
                if (vehicle && vehicle.floor_id !== floor.id) void save({ action: "move_vehicle", vehicleId: vehicle.id, floorId: floor.id, company: vehicle.assigned_company, expected: vehicle.updated_at });
              }}>
                <th scope="row" className="sticky left-0 z-10 w-16 bg-white px-1 py-2"><span className="inline-flex items-center gap-1">{floor.name}{data.canEdit && count === 0 && total === 0 && <button type="button" disabled={disabled} className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" aria-label={`${floor.name}を表から削除`} title="表から削除" onClick={() => { if (countAt(floor.id) === 0 && !requests.some(row => row.floor_id === floor.id && row.requested_count > 0)) setExtra(current => ({ ...current, [type]: current[type].filter(id => id !== floor.id) })); }}><X size={14} aria-hidden="true" /></button>}</span></th>
                <td className={`w-20 px-2 py-1.5 font-bold leading-tight ${total > count ? "bg-amber-50 text-amber-800" : ""}`}>
                  {type === "tachiuma" && data.canEdit ? <button type="button" className="min-h-8 min-w-10 rounded px-1 text-sky-800 underline decoration-dotted underline-offset-4 hover:bg-sky-100 disabled:opacity-40" disabled={disabled} aria-label={`${floor.name}の立ち馬 ${count}台を変更`} onClick={() => open({ action: "set_stock", floorId: floor.id, expected: stock?.updated_at ?? null })}>{count}<span className="ml-0.5 text-xs font-normal">台</span></button> : <>{count}<span className="ml-0.5 text-xs font-normal">台</span></>}
                  {total > count && <span className="block text-[11px] font-medium">{total - count}台不足</span>}
                </td>
                {type === "aerial_work_vehicle" && <td className="w-44 min-w-44 p-1 hover:bg-sky-100" onDrop={event => assignDropped(event, floor.id, null)}><div className="flex flex-wrap justify-center gap-1">{data.vehicles.filter(row => row.floor_id === floor.id && !row.assigned_company).map(vehicle => vehicleChip(vehicle, true))}</div></td>}
                {companies.map(company => {
                  const requested = requests.filter(row => row.floor_id === floor.id && row.company === company).reduce((sum, row) => sum + row.requested_count, 0);
                  const assigned = type === "aerial_work_vehicle" ? data.vehicles.filter(row => row.floor_id === floor.id && row.assigned_company === company) : [];
                  const shortage = type === "aerial_work_vehicle" && requested > assigned.length;
                  return <td className="min-w-24 p-1.5 hover:bg-sky-50" key={company} onDrop={type === "aerial_work_vehicle" ? event => assignDropped(event, floor.id, company) : undefined}>
                    {(requested > 0 || assigned.length > 0) && <div className={`rounded px-2 py-1.5 ${shortage ? "border-2 border-amber-400 bg-amber-50" : "border-2 border-transparent"}`}>
                      {requested > 0 && <span className="text-xs text-slate-600">{type === "aerial_work_vehicle" ? "希望 " : ""}{requested}台</span>}
                      {assigned.length > 0 && <div className="mt-1 flex flex-wrap justify-center gap-1">{assigned.map(vehicle => vehicleChip(vehicle))}</div>}
                    </div>}
                  </td>;
                })}
                <td className="p-3 font-bold">{total}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {!visible.length && <p className="p-4 text-sm text-slate-500">配置・使用希望のあるフロアはありません。</p>}
        {data.canEdit && type === "aerial_work_vehicle" && <p className="p-3 text-xs text-slate-500">号車を会社欄へドラッグして割当。「号車」欄へ戻すと解除できます。「号車を選んで操作」からも移動・割当できます。</p>}
      </section>;
    })}
    <dialog ref={dialog} className="w-[calc(100%-2rem)] max-w-md rounded-xl p-5 backdrop:bg-black/40" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => setOperation(null)}>
      {operation && <form className="grid gap-4" onSubmit={event => {
        event.preventDefault();
        if (confirmDelete) return;
        void save({ action: operation.action, floorId: target,
          ...(operation.action === "register_vehicle" ? { number: number.trim() } : {}),
          ...(operation.action === "move_vehicle" ? { vehicleId: operation.vehicle!.id, expected: operation.vehicle!.updated_at, company: assignedCompany || null } : {}),
          ...(operation.action === "move_stock" ? { fromFloorId: operation.floorId, quantity: Number(quantity), expected: operation.expected } : {}),
          ...(operation.action === "set_stock" ? { quantity: Number(quantity), expected: operation.expected } : {}),
        });
      }}>
        <h3 className="text-lg font-bold">{operation.action === "register_vehicle" ? "号車を登録" : operation.action === "set_stock" ? "立ち馬の台数設定" : operation.action === "move_vehicle" ? `${operation.vehicle?.vehicle_number}号車を移動` : "立ち馬を移動"}</h3>
        {message && <p role="alert" className="notice-error">{message}</p>}
        {operation.action === "move_vehicle" && <div className="rounded-lg border border-red-200 p-3">
          {confirmDelete ? <>
            <p className="text-sm font-semibold text-red-800">{operation.vehicle?.vehicle_number}号車を削除しますか？</p>
            <p className="mt-1 text-xs text-slate-600">現在の配置と会社への割当を削除します。移動履歴は残ります。</p>
            <div className="mt-3 flex justify-end gap-2"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>戻る</button><button type="button" className="btn bg-red-700 text-white hover:bg-red-800" disabled={disabled} onClick={() => void save({ action: "delete_vehicle", vehicleId: operation.vehicle!.id, expected: operation.vehicle!.updated_at })}>削除する</button></div>
          </> : <button type="button" className="text-sm font-semibold text-red-700 hover:underline" disabled={disabled} onClick={() => setConfirmDelete(true)}>この号車を削除</button>}
        </div>}
        {operation.action === "register_vehicle" && <label>号車番号<input className="input mt-1" value={number} maxLength={30} required placeholder="例：1" onChange={event => setNumber(event.target.value)} /></label>}
        {operation.action === "move_vehicle" && <label>割当会社<select className="input mt-1" value={assignedCompany} onChange={event => setAssignedCompany(event.target.value)}><option value="">未割当</option>{[...new Set([...(data?.companies ?? []), ...(data?.requests.map(row => row.company) ?? []), ...(data?.vehicles.flatMap(vehicle => vehicle.assigned_company ? [vehicle.assigned_company] : []) ?? [])])].sort((a, b) => a.localeCompare(b, "ja")).map(company => <option key={company} value={company}>{company}</option>)}</select></label>}
        {operation.action !== "set_stock" ? <label>{operation.action === "register_vehicle" ? "配置先" : "移動先"}<select className="input mt-1" value={target} required onChange={event => setTarget(event.target.value)}>{data?.floors.map(floor => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label> : <p>{data?.floors.find(floor => floor.id === operation.floorId)?.name}の現在の総台数を設定します。</p>}
        {(operation.action === "set_stock" || operation.action === "move_stock") && <label>台数<input className="input mt-1" type="number" min={operation.action === "set_stock" ? 0 : 1} max={operation.action === "move_stock" ? data?.stocks.find(stock => stock.floor_id === operation.floorId)?.quantity ?? 0 : 9999} step={1} value={quantity} required onChange={event => setQuantity(event.target.value)} /></label>}
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => dialog.current?.close()}>キャンセル</button><button type="submit" className="btn btn-primary" disabled={disabled || (operation.action === "move_stock" && target === operation.floorId) || (operation.action === "move_vehicle" && target === operation.floorId && assignedCompany === (operation.vehicle?.assigned_company ?? ""))}>保存</button></div>
      </form>}
    </dialog>
  </div>;
}
