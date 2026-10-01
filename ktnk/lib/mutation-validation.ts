import { z } from "zod";

export const expectedUpdatedAtSchema = z.string().datetime({ offset: true, message: "最新の内容を読み込み直してください。" });
export const recordMutationSchema = z.object({ id: z.string().uuid(), expectedUpdatedAt: expectedUpdatedAtSchema });

