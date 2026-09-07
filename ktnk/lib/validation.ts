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
  usePreviousWorkerCount: z.boolean().optional().default(false),
});

export const scheduleSubmitSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "開始日を入力してください。"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "終了日を入力してください。"),
    excludeWeekends: z.boolean().default(false),
    status: z.enum(["work", "no_work"]),
    primaryCompany: z.string().min(1, "一次会社を選択してください。"),
    primaryCount: countSchema,
    usePreviousPrimaryCount: z.boolean().optional().default(false),
    currentSubcompanies: z.array(subcompanySchema).default([]),
    workArea: z.string().default(""),
    workContent: z.string().default(""),
    nextVisitDate: nullableDate,
    nextPrimaryCount: countSchema,
    usePreviousNextPrimaryCount: z.boolean().optional().default(false),
    nextSubcompanies: z.array(subcompanySchema).default([]),
    nextWorkArea: z.string().default(""),
    nextWorkContent: z.string().default(""),
    aerialWorkVehicleCount: countSchema.default(null),
    aerialWorkVehicleDetails: z.string().max(500, "高所作業車の内容は500文字以内で入力してください。").default(""),
    notes: z.string().max(2000, "備考は2000文字以内で入力してください。").default(""),
    overwriteExisting: z.boolean().optional().default(false),
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
      for (const [field, label] of [
        ["workArea", "作業エリア"],
        ["workContent", "作業内容"],
      ] as const) {
        if (!value[field].trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${label}を入力してください。`,
          });
        }
      }

      if (!value.usePreviousPrimaryCount && value.primaryCount === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["primaryCount"],
          message: "一次会社人数を入力してください。",
        });
      }

      const secondaryTotal = value.currentSubcompanies.reduce((sum, row) => {
        return sum + (row.secondaryCompany.trim() && !row.usePreviousWorkerCount ? row.workerCount ?? 0 : 0);
      }, 0);

      const hasPreviousSecondaryCount = value.currentSubcompanies.some(
        (row) => row.secondaryCompany.trim() !== "" && row.usePreviousWorkerCount,
      );

      if (!value.usePreviousPrimaryCount && value.primaryCount === 0 && secondaryTotal < 1 && !hasPreviousSecondaryCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["currentSubcompanies"],
          message: "一次会社人数が0人の場合は、二次会社人数の合計を1人以上にしてください。",
        });
      }
    }

    const subcompanyField = value.status === "work" ? "currentSubcompanies" : "nextSubcompanies";
    for (const [index, subcompany] of value[subcompanyField].entries()) {
      if (value.status === "work" && subcompany.secondaryCompany.trim() !== "" && !subcompany.usePreviousWorkerCount && subcompany.workerCount === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [subcompanyField, index, "workerCount"],
          message: "二次会社人数を入力してください。",
        });
      }

      if (((subcompany.workerCount ?? 0) > 0 || subcompany.usePreviousWorkerCount) && subcompany.secondaryCompany.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [subcompanyField, index, "secondaryCompany"],
          message: "二次会社人数を入力する場合は、二次会社を選択してください。",
        });
      }
    }
  });

export type ScheduleSubmitParsed = z.infer<typeof scheduleSubmitSchema>;
