import { z } from "zod";
import { expandDateRange, isWorkingDate } from "@/lib/utils";

const MAX_SUBMISSION_DATES = 180;

const countSchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  })
  .refine((value) => value === null || (Number.isInteger(value) && value >= 0), "人数は0以上の整数で入力してください。");

export const subcompanySchema = z.object({
  secondaryCompany: z.string(),
  workerCount: countSchema,
  usePreviousWorkerCount: z.boolean().optional().default(false),
});

const equipmentRequestSchema = z.object({
  floorId: z.string().uuid("フロアを選択してください。"),
  floorName: z.string().optional(),
  count: countSchema.refine((value) => value !== null && value > 0, "台数は1以上で入力してください。"),
});

export const scheduleSubmitSchema = z
  .object({
    dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(MAX_SUBMISSION_DATES).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "開始日を入力してください。"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "終了日を入力してください。"),
    excludeWeekends: z.boolean().default(false),
    primaryCompany: z.string().min(1, "一次会社を選択してください。"),
    primaryCount: countSchema,
    usePreviousPrimaryCount: z.boolean().optional().default(false),
    currentSubcompanies: z.array(subcompanySchema).default([]),
    workArea: z.string().default(""),
    workContent: z.string().default(""),
    usesAerialWorkVehicle: z.boolean().default(false),
    aerialWorkVehicleNotes: z.string().max(500, "高所作業車の使用内容は500文字以内で入力してください。").default(""),
    aerialWorkVehicleRequests: z.array(equipmentRequestSchema).max(20).default([]),
    usesFire: z.boolean().default(false),
    fireArea: z.string().max(200, "火気使用エリアは200文字以内で入力してください。").default(""),
    usesTachiuma: z.boolean().default(false),
    tachiumaNotes: z.string().max(500).default(""),
    tachiumaRequests: z.array(equipmentRequestSchema).max(20).default([]),
    notes: z.string().max(2000, "備考は2000文字以内で入力してください。").default(""),
    overwriteExisting: z.boolean().optional().default(false),
    skipExisting: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.dates?.length) {
      value.dates.forEach((date, index) => {
        if (!isWorkingDate(date)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dates", index], message: "日曜日は入力できません。" });
      });
    }
    for (const field of ["startDate", "endDate"] as const) {
      if (!isWorkingDate(value[field])) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "日曜日は入力できません。月曜〜土曜を選択してください。" });
    }
    if (value.startDate > value.endDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "終了日は開始日以降にしてください。" });
    if (!value.dates?.length && expandDateRange(value.startDate, value.endDate, false).length > MAX_SUBMISSION_DATES) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: `登録期間は${MAX_SUBMISSION_DATES}日以内にしてください。` });
    }

    for (const [field, label] of [["workArea", "作業エリア"], ["workContent", "作業内容"]] as const) {
      if (!value[field].trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${label}を入力してください。` });
    }
    if (!value.usePreviousPrimaryCount && value.primaryCount === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["primaryCount"], message: "一次会社人数を入力してください。" });
    }

    const secondaryTotal = value.currentSubcompanies.reduce((sum, row) => sum + (row.secondaryCompany.trim() && !row.usePreviousWorkerCount ? row.workerCount ?? 0 : 0), 0);
    const hasPreviousSecondaryCount = value.currentSubcompanies.some((row) => row.secondaryCompany.trim() !== "" && row.usePreviousWorkerCount);
    if (!value.usePreviousPrimaryCount && value.primaryCount === 0 && secondaryTotal < 1 && !hasPreviousSecondaryCount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["currentSubcompanies"], message: "一次会社人数が0人の場合は、二次会社人数の合計を1人以上にしてください。" });
    }
    for (const [enabled, requests, legacyNotes, path, label] of [
      [value.usesAerialWorkVehicle, value.aerialWorkVehicleRequests, value.aerialWorkVehicleNotes, "aerialWorkVehicleRequests", "高所作業車"],
      [value.usesTachiuma, value.tachiumaRequests, value.tachiumaNotes, "tachiumaRequests", "立ち馬"],
    ] as const) {
      if (enabled && requests.length === 0 && !legacyNotes.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: `${label}のフロアと台数を入力してください。` });
      if (new Set(requests.map((row) => row.floorId)).size !== requests.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: `${label}で同じフロアは重複して選択できません。` });
    }
    for (const [index, subcompany] of value.currentSubcompanies.entries()) {
      if (subcompany.secondaryCompany.trim() !== "" && !subcompany.usePreviousWorkerCount && subcompany.workerCount === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["currentSubcompanies", index, "workerCount"], message: "二次会社人数を入力してください。" });
      }
      if (((subcompany.workerCount ?? 0) > 0 || subcompany.usePreviousWorkerCount) && subcompany.secondaryCompany.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["currentSubcompanies", index, "secondaryCompany"], message: "二次会社人数を入力する場合は、二次会社を選択してください。" });
      }
    }
  });

export type ScheduleSubmitParsed = z.infer<typeof scheduleSubmitSchema>;
