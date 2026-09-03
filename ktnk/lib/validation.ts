import { z } from "zod";

const nullableDate = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable();

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
});

export const scheduleSubmitSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "開始日を入力してください。"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "終了日を入力してください。"),
    excludeWeekends: z.boolean().default(false),
    status: z.enum(["work", "no_work"]),
    primaryCompany: z.string().min(1, "一次会社を選択してください。"),
    primaryCount: countSchema,
    currentSubcompanies: z.array(subcompanySchema).default([]),
    workArea: z.string().default(""),
    workContent: z.string().default(""),
    nextVisitDate: nullableDate,
    nextPrimaryCount: countSchema,
    nextSubcompanies: z.array(subcompanySchema).default([]),
    nextWorkContent: z.string().default(""),
  })
  .superRefine((value, ctx) => {
    if (value.startDate > value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "終了日は開始日以降にしてください。",
      });
    }

    if (value.status === "work") {
      if (value.primaryCount === null && value.currentSubcompanies.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["primaryCount"],
          message: "一次会社人数、または二次会社人数を入力してください。",
        });
      }
    }
  });

export type ScheduleSubmitParsed = z.infer<typeof scheduleSubmitSchema>;
