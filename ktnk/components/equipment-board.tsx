"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, X } from "lucide-react";
import { SESSION_CHANGED } from "@/lib/employee-session";
import { apiFetch } from "@/lib/api-client";
import type { EquipmentBoardData, EquipmentVehicle, TachiumaUnit } from "@/lib/equipment-board";
import type { EquipmentType } from "@/lib/types";

const boardCache = new Map<string, EquipmentBoardData>();

export function EquipmentBoard({ date, version }: { date: string; version: number }) {
  const [data, setData] = useState<EquipmentBoardData | null>(() => boardCache.get(date) ?? null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(() => !boardCache.has(date));
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const sequence = useRef(0);
  const [extra, setExtra] = useState<Record<EquipmentType, string[]>>({ aerial_work_vehicle: [], tachiuma: [] });
  const [adding, setAdding] = useState<EquipmentType | null>(null);
  const [info, setInfo] = useState<{ title: string; notes: string } | null>(null);
  const managerDialog = useRef<HTMLDialogElement>(null);
  const tachiumaDialog = useRef<HTMLDialogElement>(null);
  const [vehicleEditor, setVehicleEditor] = useState<EquipmentVehicle | "new" | null>(null);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleNotes, setVehicleNotes] = useState("");
  const [vehicleFloor, setVehicleFloor] = useState("");
  const [vehicleCompany, setVehicleCompany] = useState("");
  const [managerDelete, setManagerDelete] = useState(false);
  const [tachiumaEditor, setTachiumaEditor] = useState<TachiumaUnit | "new" | null>(null);
  const [tachiumaName, setTachiumaName] = useState("");
  const [tachiumaNotes, setTachiumaNotes] = useState("");
  const [tachiumaFloor, setTachiumaFloor] = useState("");

  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/equipment-board?date=${date}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (current === sequence.current) { boardCache.set(date, body); setData(body); }
    } catch (error) {
      if (current === sequence.current) setMessage(error instanceof Error ? error.message : "取得できませんでした。");
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

  async function save(payload: object, closeOperation = true) {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const response = await apiFetch("/api/equipment-board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (closeOperation) { tachiumaDialog.current?.close(); setTachiumaEditor(null); }
      await refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存できませんでした。");
      // Keep the expected revision on the open form; never silently overwrite a newer edit.
      await refresh();
      return false;
    } finally { pending.current = false; setBusy(false); }
  }

  const disabled = busy || (loading && !data);
  const requestedCompanies = data ? [...new Set(data.requests.filter(row => row.equipment_type === "aerial_work_vehicle").map(row => row.company))].sort((a, b) => a.localeCompare(b, "ja")) : [];
  function editVehicle(vehicle: EquipmentVehicle | "new") {
    setManagerDelete(false); setVehicleEditor(vehicle);
    setVehicleNumber(vehicle === "new" ? "" : vehicle.vehicle_number);
    setVehicleNotes(vehicle === "new" ? "" : vehicle.notes ?? "");
    setVehicleFloor(vehicle === "new" ? data?.floors[0]?.id ?? "" : vehicle.floor_id);
    setVehicleCompany(vehicle === "new" || !vehicle.assigned_company || !requestedCompanies.includes(vehicle.assigned_company) ? "" : vehicle.assigned_company);
  }
  async function reorderVehicle(index: number, direction: -1 | 1) {
    if (!data) return;
    const next = [...data.vehicles]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await save({ action: "reorder_vehicles", vehicleIds: next.map(vehicle => vehicle.id) }, false);
  }
  function editTachiuma(item: TachiumaUnit | "new") {
    setTachiumaEditor(item); setMessage("");
    setTachiumaName(item === "new" ? "" : item.name);
    setTachiumaNotes(item === "new" ? "" : item.notes ?? "");
    setTachiumaFloor(item === "new" ? data?.floors[0]?.id ?? "" : item.floor_id);
  }
  async function reorderTachiuma(index: number, direction: -1 | 1) {
    if (!data) return; const next = [...data.tachiumas]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await save({ action: "reorder_tachiumas", unitIds: next.map(item => item.id) }, false);
  }
  function assignDropped(event: React.DragEvent, floorId: string, company: string | null) {
    event.preventDefault(); event.stopPropagation();
    if (!data?.canEdit || disabled) return;
    const vehicle = data.vehicles.find(row => row.id === event.dataTransfer.getData("text/plain"));
    if (vehicle && (vehicle.floor_id !== floorId || vehicle.assigned_company !== company)) {
      void save({ action: "move_vehicle", vehicleId: vehicle.id, floorId, company, date, expected: vehicle.updated_at });
    }
  }
  function vehicleChip(vehicle: EquipmentVehicle, compact = false) {
    const number = Number(vehicle.vehicle_number);
    const circled = Number.isInteger(number) && number >= 1 && number <= 20 && String(number) === vehicle.vehicle_number
      ? String.fromCodePoint(0x2460 + number - 1) : vehicle.vehicle_number;
    const label = compact ? circled : `${vehicle.vehicle_number}号車`;
    return <span key={vehicle.id} draggable={Boolean(data?.canEdit && !disabled)}
      onDragStart={event => { event.dataTransfer.setData("text/plain", vehicle.id); event.dataTransfer.effectAllowed = "move"; }}
      className={`inline-flex min-h-9 items-center justify-center rounded border border-sky-400 bg-sky-50 font-bold leading-tight text-sky-900 cursor-grab select-none ${compact ? "min-w-9 text-2xl" : "text-base"}`}>
      {vehicle.notes ? <button type="button" className="h-full min-h-9 w-full rounded px-2 py-1" aria-label={`${vehicle.vehicle_number}号車の備考を表示`} onMouseEnter={() => setInfo({ title: `${vehicle.vehicle_number}号車`, notes: vehicle.notes! })} onMouseLeave={() => setInfo(null)} onFocus={() => setInfo({ title: `${vehicle.vehicle_number}号車`, notes: vehicle.notes! })} onBlur={() => setInfo(null)} onClick={() => setInfo(current => current?.title === `${vehicle.vehicle_number}号車` ? null : { title: `${vehicle.vehicle_number}号車`, notes: vehicle.notes! })}>{label}</button> : <span className="px-2 py-1" aria-label={`${vehicle.vehicle_number}号車：${vehicle.assigned_company ?? "未割当"}${data?.canEdit ? "、移動・会社割当" : ""}`}>{label}</span>}
    </span>;
  }
  function tachiumaChip(item: TachiumaUnit) {
    return <button key={item.id} type="button" className="min-h-9 rounded border border-emerald-500 bg-emerald-50 px-2 py-1 font-bold text-emerald-950" aria-label={`${item.name}${item.notes ? `、${item.notes}` : ""}`} onMouseEnter={() => item.notes && setInfo({ title: item.name, notes: item.notes })} onMouseLeave={() => setInfo(null)} onFocus={() => item.notes && setInfo({ title: item.name, notes: item.notes })} onBlur={() => setInfo(null)} onClick={() => item.notes && setInfo(current => current?.title === item.name ? null : { title: item.name, notes: item.notes! })}>{item.name}</button>;
  }
  return <div className="grid gap-4" aria-busy={disabled}>
    {data && !data.canEdit && <p className="text-xs text-slate-500">編集する場合は、サイト右上のアイコンからログインしてください。</p>}
    {message && <p className="notice-error" role="alert">{message}</p>}
    {!data && message === "" && <div className="min-h-24" aria-label="機材情報を読み込み中" />}
    {data && (["aerial_work_vehicle", "tachiuma"] as const).map(type => {
      const requests = data.requests.filter(row => row.equipment_type === type);
      const companies = [...new Set(requests.map(row => row.company))].sort((a, b) => a.localeCompare(b, "ja"));
      const countAt = (floor: string) => type === "aerial_work_vehicle" ? data.vehicles.filter(v => v.floor_id === floor).length : data.tachiumas.filter(item => item.floor_id === floor).length;
      const visible = data.floors.filter(floor => countAt(floor.id) > 0 || requests.some(row => row.floor_id === floor.id) || (data.canEdit && extra[type].includes(floor.id)));
      const hidden = data.floors.filter(floor => !visible.some(row => row.id === floor.id));
      return <section className="panel min-w-0 overflow-hidden" key={type}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-500 p-3">
          <h3 className="font-bold">{type === "aerial_work_vehicle" ? "高所作業車" : "立ち馬"}</h3>
          {data.canEdit && <div className="flex flex-wrap gap-2">
            {type === "aerial_work_vehicle" && <button type="button" className="btn btn-primary h-8 min-h-0 px-2 py-1 text-xs" disabled={disabled || !data.floors.length} onClick={() => { setVehicleEditor(null); setMessage(""); managerDialog.current?.showModal(); }}>号車管理</button>}
            {type === "tachiuma" && <button type="button" className="btn btn-primary h-8 min-h-0 px-2 py-1 text-xs" disabled={disabled || !data.floors.length} onClick={() => { setTachiumaEditor(null); setMessage(""); tachiumaDialog.current?.showModal(); }}>立ち馬管理</button>}
            <button type="button" className="btn btn-secondary h-8 min-h-0 px-2 py-1 text-xs" disabled={disabled || hidden.length === 0} onClick={() => setAdding(adding === type ? null : type)}>フロアを追加</button>
          </div>}
        </div>
        {adding === type && data.canEdit && <label className="block px-3 pb-3 text-sm">表示するフロア<select className="input mt-1" value="" onChange={event => { const id = event.target.value; if (id) setExtra(current => ({ ...current, [type]: [...current[type], id] })); setAdding(null); }}><option value="">フロアを選択</option>{hidden.map(floor => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>}
        <div className="overflow-x-auto">
          <table className="w-full select-none border-collapse whitespace-nowrap text-center text-sm [&_th]:border [&_th]:border-slate-500 [&_td]:border [&_td]:border-slate-400">
            <caption className="sr-only">{type === "aerial_work_vehicle" ? "高所作業車" : "立ち馬"}の現在配置と会社別希望台数</caption>
            <thead className="bg-slate-100"><tr><th scope="col" className="sticky left-0 z-10 w-16 bg-slate-100 px-1 py-2">フロア</th><th scope="col" className="w-20 px-2 py-2 text-xs">現在台数</th><th scope="col" className="p-3">{type === "aerial_work_vehicle" ? "号車" : "立ち馬"}</th>{companies.map(company => <th scope="col" className="p-3" key={company}>{company}</th>)}<th scope="col" className="p-3">希望合計</th></tr></thead>
            <tbody>{visible.map(floor => {
              const count = countAt(floor.id);
              const total = requests.filter(row => row.floor_id === floor.id).reduce((sum, row) => sum + row.requested_count, 0);
              return <tr key={floor.id} className="hover:bg-sky-50" onDragOver={event => { if (data.canEdit && !disabled && type === "aerial_work_vehicle") { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={event => {
                event.preventDefault(); if (!data.canEdit || disabled || type !== "aerial_work_vehicle") return;
                const vehicle = data.vehicles.find(row => row.id === event.dataTransfer.getData("text/plain"));
                if (vehicle && vehicle.floor_id !== floor.id) void save({ action: "move_vehicle", vehicleId: vehicle.id, floorId: floor.id, company: null, date, expected: vehicle.updated_at });
              }}>
                <th scope="row" className="sticky left-0 z-10 w-16 bg-white px-1 py-2"><span className="inline-flex items-center gap-1">{floor.name}{data.canEdit && count === 0 && total === 0 && <button type="button" disabled={disabled} className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" aria-label={`${floor.name}を表から削除`} title="表から削除" onClick={() => { if (countAt(floor.id) === 0 && !requests.some(row => row.floor_id === floor.id && row.requested_count > 0)) setExtra(current => ({ ...current, [type]: current[type].filter(id => id !== floor.id) })); }}><X size={14} aria-hidden="true" /></button>}</span></th>
                <td className={`w-20 px-2 py-1.5 font-bold leading-tight ${total > count ? "bg-amber-50 text-amber-800" : ""}`}>
                  {count}<span className="ml-0.5 text-xs font-normal">台</span>
                  {total > count && <span className="block text-[11px] font-medium">{total - count}台不足</span>}
                </td>
                {type === "aerial_work_vehicle" && <td className="w-44 min-w-44 p-1 hover:bg-sky-100" onDrop={event => assignDropped(event, floor.id, null)}><div className="flex flex-wrap justify-center gap-1">{data.vehicles.filter(row => row.floor_id === floor.id && (!row.assigned_company || !requests.some(request => request.floor_id === floor.id && request.company === row.assigned_company && request.requested_count > 0))).map(vehicle => vehicleChip(vehicle, true))}</div></td>}
                {type === "tachiuma" && <td className="w-44 min-w-44 p-1"><div className="flex flex-wrap justify-center gap-1">{data.tachiumas.filter(item => item.floor_id === floor.id).map(tachiumaChip)}</div></td>}
                {companies.map(company => {
                  const requested = requests.filter(row => row.floor_id === floor.id && row.company === company).reduce((sum, row) => sum + row.requested_count, 0);
                  const assigned = type === "aerial_work_vehicle" && requested > 0 ? data.vehicles.filter(row => row.floor_id === floor.id && row.assigned_company === company) : [];
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
        {data.canEdit && type === "aerial_work_vehicle" && <p className="p-3 text-xs text-slate-500">号車を会社欄へドラッグして割当。「号車」欄へ戻すと解除できます。追加・編集・削除・並び替えは「号車管理」から行えます。</p>}
        {data.canEdit && type === "tachiuma" && <p className="p-3 text-xs text-slate-500">名称・スペック・配置フロアは「立ち馬管理」から変更できます。</p>}
      </section>;
    })}
    <dialog ref={managerDialog} aria-labelledby="vehicle-manager-title" className="w-[calc(100%-2rem)] max-w-lg rounded-xl border border-border p-5 backdrop:bg-black/40" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => { setVehicleEditor(null); setManagerDelete(false); }}>
      {data && <div className="grid gap-4">
        <div className="flex items-center justify-between gap-2"><h3 id="vehicle-manager-title" className="text-lg font-bold">号車管理</h3>{vehicleEditor === null && <button type="button" className="btn btn-primary min-h-11 px-2 py-1 text-sm" disabled={disabled || !data.floors.length} onClick={() => editVehicle("new")}><Plus size={14} aria-hidden="true" />号車を追加</button>}</div>
        {message && <p role="alert" className="notice-error text-sm">{message}</p>}
        {vehicleEditor === null ? <>
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
            {data.vehicles.map((vehicle, index) => <div key={vehicle.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-slate-200 p-2">
              <strong className="min-w-12 text-center">{vehicle.vehicle_number}号車</strong>
              <div className="min-w-0 text-xs text-slate-600"><p>{data.floors.find(floor => floor.id === vehicle.floor_id)?.name ?? "不明"}{vehicle.assigned_company && requestedCompanies.includes(vehicle.assigned_company) ? ` ／ ${vehicle.assigned_company}` : ""}</p>{vehicle.notes && <p className="truncate" title={vehicle.notes}>{vehicle.notes}</p>}</div>
              <div className="flex gap-1"><button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded border border-slate-400 disabled:opacity-30" disabled={disabled || index === 0} aria-label={`${vehicle.vehicle_number}号車を上へ`} onClick={() => void reorderVehicle(index, -1)}><ChevronUp size={16} /></button><button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded border border-slate-400 disabled:opacity-30" disabled={disabled || index === data.vehicles.length - 1} aria-label={`${vehicle.vehicle_number}号車を下へ`} onClick={() => void reorderVehicle(index, 1)}><ChevronDown size={16} /></button><button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded border border-slate-400" disabled={disabled} aria-label={`${vehicle.vehicle_number}号車を編集`} onClick={() => editVehicle(vehicle)}><Pencil size={15} /></button></div>
            </div>)}
            {data.vehicles.length === 0 && <p className="py-5 text-center text-sm text-slate-500">登録された号車はありません。</p>}
          </div>
          <div className="flex justify-end"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => managerDialog.current?.close()}>閉じる</button></div>
        </> : <form className="grid gap-3" onSubmit={async event => {
          event.preventDefault(); if (managerDelete) return;
          const current = vehicleEditor === "new" ? null : vehicleEditor;
          if (await save({ action: "save_vehicle", vehicleId: current?.id ?? null, number: vehicleNumber.trim(), notes: vehicleNotes.trim(), floorId: vehicleFloor, company: vehicleCompany || null, expected: current?.updated_at ?? null }, false)) setVehicleEditor(null);
        }}>
          <label className="grid gap-1 text-sm font-semibold">号車番号<input className="input" required maxLength={30} value={vehicleNumber} onChange={event => setVehicleNumber(event.target.value)} /></label>
          <label className="grid gap-1 text-sm font-semibold">フロア<select className="input" required value={vehicleFloor} onChange={event => { setVehicleFloor(event.target.value); setVehicleCompany(""); }}>{data.floors.map(floor => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">割当会社<select className="input" value={vehicleCompany} onChange={event => setVehicleCompany(event.target.value)}><option value="">未割当</option>{requestedCompanies.map(company => <option key={company} value={company}>{company}</option>)}</select><span className="text-xs font-normal text-slate-500">選択日の高所作業車を希望している会社だけ表示します。</span></label>
          <label className="grid gap-1 text-sm font-semibold">備考（任意）<textarea className="textarea min-h-20" maxLength={500} value={vehicleNotes} onChange={event => setVehicleNotes(event.target.value)} /></label>
          {vehicleEditor !== "new" && <div className="rounded-lg border border-red-200 p-3">{managerDelete ? <><p className="text-sm font-semibold text-red-800">{vehicleEditor.vehicle_number}号車を削除しますか？</p><p className="mt-1 text-xs text-slate-600">移動履歴は残ります。</p><div className="mt-3 flex justify-end gap-2"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setManagerDelete(false)}>戻る</button><button type="button" className="btn bg-red-700 text-white hover:bg-red-800" disabled={disabled} onClick={async () => { if (await save({ action: "delete_vehicle", vehicleId: vehicleEditor.id, expected: vehicleEditor.updated_at }, false)) setVehicleEditor(null); }}>削除する</button></div></> : <button type="button" className="text-sm font-semibold text-red-700 hover:underline" disabled={disabled} onClick={() => setManagerDelete(true)}>この号車を削除</button>}</div>}
          {!managerDelete && <div className="flex justify-end gap-2"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setVehicleEditor(null)}>一覧へ戻る</button><button type="submit" className="btn btn-primary" disabled={disabled || !vehicleNumber.trim() || !vehicleFloor}>保存</button></div>}
        </form>}
      </div>}
    </dialog>
    <dialog ref={tachiumaDialog} aria-labelledby="tachiuma-manager-title" className="w-[calc(100%-2rem)] max-w-lg rounded-xl border border-border p-5 backdrop:bg-black/40" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => setTachiumaEditor(null)}>{data && <div className="grid gap-4"><div className="flex items-center justify-between gap-2"><h3 id="tachiuma-manager-title" className="text-lg font-bold">立ち馬管理</h3>{tachiumaEditor===null&&<button type="button" className="btn btn-primary" disabled={disabled||!data.floors.length} onClick={()=>editTachiuma("new")}><Plus size={14}/>追加</button>}</div>{message&&<p role="alert" className="notice-error text-sm">{message}</p>}{tachiumaEditor===null?<><div className="grid max-h-[60vh] gap-2 overflow-y-auto">{data.tachiumas.map((item,index)=><div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-slate-400 p-2"><div><strong>{item.name}</strong><p className="text-xs text-slate-600">{data.floors.find(f=>f.id===item.floor_id)?.name??"不明"}{item.notes?` ／ ${item.notes}`:""}</p></div><div className="flex gap-1"><button type="button" className="h-11 w-11 rounded border border-slate-400" disabled={disabled||index===0} aria-label={`${item.name}を上へ`} onClick={()=>void reorderTachiuma(index,-1)}><ChevronUp className="mx-auto" size={16}/></button><button type="button" className="h-11 w-11 rounded border border-slate-400" disabled={disabled||index===data.tachiumas.length-1} aria-label={`${item.name}を下へ`} onClick={()=>void reorderTachiuma(index,1)}><ChevronDown className="mx-auto" size={16}/></button><button type="button" className="h-11 w-11 rounded border border-slate-400" aria-label={`${item.name}を編集`} onClick={()=>editTachiuma(item)}><Pencil className="mx-auto" size={15}/></button></div></div>)}</div><div className="flex justify-end"><button type="button" className="btn btn-secondary" onClick={()=>tachiumaDialog.current?.close()}>閉じる</button></div></>:<form className="grid gap-3" onSubmit={async event=>{event.preventDefault();const current=tachiumaEditor==="new"?null:tachiumaEditor;if(await save({action:"save_tachiuma",unitId:current?.id??null,name:tachiumaName,notes:tachiumaNotes,floorId:tachiumaFloor,expected:current?.updated_at??null},false))setTachiumaEditor(null);}}><label className="field"><span className="label">名称</span><input className="input" required maxLength={50} placeholder="例：LL、SM" value={tachiumaName} onChange={e=>setTachiumaName(e.target.value)}/></label><label className="field"><span className="label">フロア</span><select className="input" required value={tachiumaFloor} onChange={e=>setTachiumaFloor(e.target.value)}>{data.floors.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label className="field"><span className="label">スペック・備考（任意）</span><textarea className="textarea min-h-20" maxLength={500} placeholder="例：作業床高さ 1400mm" value={tachiumaNotes} onChange={e=>setTachiumaNotes(e.target.value)}/></label>{tachiumaEditor!=="new"&&<button type="button" className="justify-self-start text-sm font-semibold text-red-700 underline" disabled={disabled} onClick={async()=>{if(window.confirm(`${tachiumaEditor.name}を削除しますか？`)&&await save({action:"delete_tachiuma",unitId:tachiumaEditor.id,expected:tachiumaEditor.updated_at},false))setTachiumaEditor(null);}}>この立ち馬を削除</button>}<div className="flex justify-end gap-2"><button type="button" className="btn btn-secondary" onClick={()=>setTachiumaEditor(null)}>一覧へ戻る</button><button type="submit" className="btn btn-primary" disabled={disabled||!tachiumaName.trim()||!tachiumaFloor}>保存</button></div></form>}</div>}</dialog>
    {info && <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-sm rounded-lg border-2 border-sky-700 bg-white p-4 shadow-xl" role="status"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-sky-950">{info.title}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{info.notes}</p></div><button type="button" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-500" aria-label="備考を閉じる" onClick={() => setInfo(null)}><X size={18}/></button></div></div>}
  </div>;
}
