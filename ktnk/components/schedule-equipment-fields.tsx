"use client";
import type { ScheduleSubmitInput } from "@/lib/types";
import { aerialVehicleFields } from "@/lib/schedule-fields";
type Equipment = Pick<ScheduleSubmitInput, "aerialWorkVehicles" | "usesFire" | "usesTachiuma" | "tachiumaNotes">;
export function ScheduleEquipmentFields({ form, onChange }: {
    form: Equipment;
    onChange: (fields: Partial<ScheduleSubmitInput>) => void;
}) {
    function setAerialVehicles(vehicles: NonNullable<ScheduleSubmitInput["aerialWorkVehicles"]>) { onChange(aerialVehicleFields(vehicles)); }
    return (<div className="space-y-3">
          <div className="rounded-xl border border-sky-300 bg-sky-50/60 p-3">
            <label className="flex cursor-pointer items-center gap-2 font-bold text-sky-950"><input type="checkbox" className="h-5 w-5 accent-sky-600" checked={(form.aerialWorkVehicles?.length ?? 0) > 0} onChange={(event) => setAerialVehicles(event.target.checked ? [{ workArea: "", vehicleCount: 1 }] : [])}/>高所作業車</label>
          {(form.aerialWorkVehicles?.length ?? 0) > 0 && <div className="mt-3 border-t border-sky-200 pt-3">
          <p className="font-bold text-sky-900">高所作業車の使用内容</p>
          <p className="mt-1 text-sm text-sky-800">使用場所と台数を入力してください。</p>
          {(form.aerialWorkVehicles ?? []).map((vehicle, index) => <div key={index} className="mt-3 grid gap-2 rounded-lg border border-sky-200 bg-white p-3 sm:grid-cols-[1fr_7rem_auto]">
            <label className="field"><span className="label">使用場所（必須）</span><input className="input" required maxLength={100} value={vehicle.workArea} placeholder="例：10階" onChange={(event) => setAerialVehicles((form.aerialWorkVehicles ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, workArea: event.target.value } : row))}/></label>
            <label className="field"><span className="label">台数</span><input className="input" type="number" inputMode="numeric" min={1} step={1} required value={vehicle.vehicleCount ?? ""} onChange={(event) => setAerialVehicles((form.aerialWorkVehicles ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, vehicleCount: event.target.value === "" ? null : Math.max(1, Number(event.target.value)) } : row))}/></label>
            <button type="button" className="btn btn-secondary self-end px-4 text-xl" aria-label={`${index + 1}件目の高所作業車を削除`} onClick={() => setAerialVehicles((form.aerialWorkVehicles ?? []).filter((_, rowIndex) => rowIndex !== index))}>×</button>
          </div>)}
          {(form.aerialWorkVehicles?.length ?? 0) > 0 && <button type="button" className="btn btn-secondary mt-3 w-full" onClick={() => setAerialVehicles([...(form.aerialWorkVehicles ?? []), { workArea: "", vehicleCount: 1 }])}>使用場所を追加</button>}
          </div>}
          </div>
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-3">
            <label className="flex cursor-pointer items-center gap-2 font-bold text-emerald-950"><input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={form.usesTachiuma} onChange={(event) => onChange({ usesTachiuma: event.target.checked, tachiumaNotes: event.target.checked ? form.tachiumaNotes : "" })}/>立ち馬</label>
            {form.usesTachiuma && <div className="mt-3 border-t border-emerald-200 pt-3"><p className="font-bold text-emerald-900">立ち馬の使用内容</p><p className="mt-1 text-sm text-emerald-800">使用する階と個数を入力してください。</p><label className="field mt-3"><span className="label">使用場所・個数（任意）</span><textarea className="textarea" maxLength={500} value={form.tachiumaNotes} placeholder="例：10階で3個使用" onChange={(event) => onChange({ tachiumaNotes: event.target.value })}/></label></div>}
          </div>
          <div className="rounded-xl border border-red-300 bg-red-50/60 p-3">
            <label className="flex cursor-pointer items-center gap-2 font-bold text-red-950"><input type="checkbox" className="h-5 w-5 accent-red-600" checked={form.usesFire} onChange={(event) => onChange({ usesFire: event.target.checked })}/>火気使用</label>
          </div>
        </div>);
}
