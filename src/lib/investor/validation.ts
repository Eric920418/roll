import { z } from "zod";

const shortText = z.string().trim().min(1).max(160);
const optionalText = z.string().trim().max(2_000).nullable().optional();

export const portalSettingsSchema = z.object({
  shareProfile: z.boolean(),
  shareStrategy: z.boolean(),
  shareActionPlan: z.boolean(),
  shareKpis: z.boolean(),
  shareMilestones: z.boolean(),
  shareUpdates: z.boolean(),
  shareBusinessPlan: z.boolean(),
});

export const kpiSchema = z.object({
  label: shortText,
  value: shortText,
  period: z.string().trim().max(80).nullable().optional(),
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

export const createPortalItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("kpi"), data: kpiSchema }),
  z.object({ kind: z.literal("milestone"), data: milestoneSchema }),
  z.object({ kind: z.literal("update"), data: updateSchema }),
]);

export const inviteSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  locale: z.enum(["en", "zh-tw"]),
});
