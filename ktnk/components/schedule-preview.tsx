"use client";

import type { PreviousSchedule } from "@/lib/types";

export function SchedulePreview({
  schedule,
  primaryCompany,
  notes,
  hideZeroSecondaryCompanies = false,
}: {
  schedule: PreviousSchedule;
  primaryCompany: string;
  notes?: string | null;
  hideZeroSecondaryCompanies?: boolean;
}) {
  const companies = [
    {
      secondaryCompany: primaryCompany,
      workerCount: schedule.primaryCount ?? 0,
    },
    ...schedule.subcompanies.filter((row) => row.secondaryCompany),
  ].filter((row) => !hideZeroSecondaryCompanies || (row.workerCount ?? 0) > 0);
  return (
    <>
    <div className="overflow-hidden rounded-md border border-border text-base">
      <table className="w-full table-fixed text-left">
        <caption className="sr-only">会社ごとの人数</caption>
        <thead className="bg-slate-50 text-sm text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              会社名
            </th>
            <th scope="col" className="w-20 px-4 py-2 text-right font-medium">
              人数
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {companies.map((row, index) => (
            <tr key={index}>
              <td className="break-words px-4 py-2.5">
                {row.secondaryCompany}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                {row.workerCount ?? 0}
                <span className="ml-1 text-sm font-normal text-slate-500">
                  人
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border bg-slate-50">
          <tr>
            <th scope="row" className="px-4 py-2.5 text-sm font-medium">
              合計
            </th>
            <td className="px-4 py-2.5 text-right font-bold tabular-nums">
              {companies.reduce(
                (total, row) => total + (row.workerCount ?? 0),
                0,
              )}
              <span className="ml-1 text-sm font-normal text-slate-500">
                人
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-3 border-t border-border px-4 py-3 text-sm leading-6">
          <dt className="text-slate-500">作業エリア</dt>
          <dd className="whitespace-pre-wrap break-words">
            {schedule.workArea || "未入力"}
          </dd>
          <dt className="text-slate-500">作業内容</dt>
          <dd className="whitespace-pre-wrap break-words">
            {schedule.workContent || "未入力"}
          </dd>
          <dt className="text-slate-500">高車</dt>
          <dd className="space-y-1">
            {schedule.aerialWorkVehicles?.length ? (
              schedule.aerialWorkVehicles.map((vehicle, index) => (
                <p key={index} className="whitespace-pre-wrap break-words">
                  {vehicle.workArea || "使用内容未入力"}
                </p>
              ))
            ) : (schedule.aerialWorkVehicleCount ?? 0) > 0 ? (
              <p className="whitespace-pre-wrap break-words">
                {schedule.aerialWorkVehicleFloor || "使用内容未入力"}
              </p>
            ) : (
              "使用しない"
            )}
          </dd>
          {schedule.usesTachiuma && schedule.tachiumaNotes && <><dt className="text-slate-500">立ち馬連絡事項</dt><dd className="whitespace-pre-wrap break-words">{schedule.tachiumaNotes}</dd></>}
          {schedule.usesFire && <><dt className="text-slate-500">火気</dt><dd className="whitespace-pre-wrap break-words">{schedule.fireArea}</dd></>}
        </dl>
    </div>
    {notes && <div className="mt-4 rounded-md bg-amber-50 p-4 text-sm"><span className="font-semibold">備考：</span><span className="whitespace-pre-wrap break-words">{notes}</span></div>}
    </>
  );
}
