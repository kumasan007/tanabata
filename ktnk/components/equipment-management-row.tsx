"use client";

export function EquipmentManagementRow({ name, notes, company, disabled, onEdit }: {
  name: string; notes?: string | null; company?: string | null; disabled?: boolean; onEdit: () => void;
}) {
  return <div className="flex min-h-12 items-center gap-2 px-2 py-1">
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-bold" title={name}>{name}{company && <span className="ml-2 text-xs font-normal text-slate-600">{company}</span>}</p>
      {notes && <p className="truncate text-xs text-slate-500" title={notes}>{notes}</p>}
    </div>
    <button type="button" className="h-10 shrink-0 rounded px-2 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-40" disabled={disabled} aria-label={`${name}を編集`} onClick={onEdit}>編集</button>
  </div>;
}
