import { z } from "zod";
import { INVESTOR_HIDEABLE_FIELDS } from "@/lib/investor/fields";

const shortText = z.string().trim().min(1).max(160);
const optionalText = z.string().trim().max(2_000).nullable().optional();

// section 級分享開關（Business 以上可改）
export const portalSettingsSchema = z.object({
  shareProfile: z.boolean(),
  shareStrategy: z.boolean(),
  shareActionPlan: z.boolean(),
  shareKpis: z.boolean(),
  shareMilestones: z.boolean(),
  shareUpdates: z.boolean(),
  shareBusinessPlan: z.boolean(),
});

/**
 * 逐欄位隱藏（Enterprise 才可改，方案檢查在 route 做）。
 * 獨立成一個 schema 而非塞進 portalSettingsSchema，是為了讓 route 能分辨
 * 「這次請求有沒有真的要動 hiddenFields」—— 沒帶就不必觸發 Enterprise 檢查，
 * Business 用戶存 section 開關時才不會被誤擋。
 */
export const fieldVisibilitySchema = z.object({
  hiddenFields: z
    .array(z.enum(INVESTOR_HIDEABLE_FIELDS))
    .max(INVESTOR_HIDEABLE_FIELDS.length)
    // 去重，避免同一 key 重複塞爆陣列
    .transform((values) => [...new Set(values)]),
});

export const kpiSchema = z.object({
  label: shortText,
  value: shortText,
  period: z.string().trim().max(80).nullable().optional(),
  unit: z.string().trim().max(24).nullable().optional(),
});

export const milestoneSchema = z.object({
  title: shortText,
  status: z.enum(["planned", "in_progress", "done"]),
  targetDate: z.iso.datetime().nullable().optional(),
  notes: optionalText,
});

export const updateSchema = z.object({
  title: shortText,
  body: z.string().trim().min(1).max(20_000),
  publishedAt: z.iso.datetime().optional(),
});

/** 單筆隱藏開關。與內容欄位分開，route 才能只對這個欄位做 Enterprise 檢查。 */
export const itemVisibilitySchema = z.object({ hidden: z.boolean() });

/** 撞到 @@unique([kpiId, period]) 時回給前端的訊息。 */
export const DUPLICATE_PERIOD = "同一個 KPI 的每個期間只能有一筆數值，請改用編輯。";

/** KPI 時間序列的單一數值點。 */
export const kpiPointSchema = z.object({
  period: z.string().trim().min(1).max(40),
  value: z.number().finite(),
  order: z.number().int().min(0).max(9_999).optional(),
});

export const createKpiPointSchema = kpiPointSchema.extend({
  kpiId: z.string().trim().min(1).max(40),
});

export const createPortalItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("kpi"), data: kpiSchema }),
  z.object({ kind: z.literal("milestone"), data: milestoneSchema }),
  z.object({ kind: z.literal("update"), data: updateSchema }),
]);

export const inviteSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  locale: z.enum(["en", "zh-tw"]),
});
