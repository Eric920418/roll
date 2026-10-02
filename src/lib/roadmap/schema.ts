import { z } from "zod";
import { diagnosisSchema, generatedPlanSchema } from "@/lib/action-plan/schemas";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "無效日期 / Invalid date");
export function today(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addMonths(start: string, months: number) {
  const date = new Date(start + "T00:00:00Z"), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}
export function goalDeadline(goal: string, explicit: string | null, start: string) {
  if (explicit) return explicit;
  const absolute = goal.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (absolute) return absolute;
  const calendar = goal.match(/(\d{4})\s*(?:年|\/)\s*(\d{1,2})\s*(?:月|\/)\s*(\d{1,2})\s*(?:日|號)?/);
  if (calendar) {
    const value = `${calendar[1]}-${calendar[2].padStart(2, "0")}-${calendar[3].padStart(2, "0")}`;
    return value;
  }
  const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const writtenDate = goal.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/i);
  if (writtenDate) {
    const value = `${writtenDate[3]}-${String(monthNames.indexOf(writtenDate[1].toLowerCase()) + 1).padStart(2, "0")}-${writtenDate[2].padStart(2, "0")}`;
    return value;
  }
  if (/半年|half a year/i.test(goal)) return addMonths(start, 6);
  const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, twelve: 12, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十二: 12 };
  const duration = goal.match(/(\d+|twelve|three|four|five|six|one|two|十二|[一二兩三四五六七八九十])\s*(?:個\s*)?(months?|月|weeks?|週|周|days?|天|years?|年)/i);
  if (duration) {
    const n = Number(duration[1]) || numbers[duration[1].toLowerCase()];
    if (n > 0 && n <= 3650) {
      if (/month|月|year|年/i.test(duration[2])) return addMonths(start, n * (/year|年/i.test(duration[2]) ? 12 : 1));
      const date = new Date(start + "T00:00:00Z"); date.setUTCDate(date.getUTCDate() + n * (/week|週|周/i.test(duration[2]) ? 7 : 1)); return date.toISOString().slice(0, 10);
    }
  }
  return addMonths(start, 6);
}
export const milestoneSchema = z.object({
  title: z.string().trim().min(3).max(200), expectedOutcome: z.string().trim().min(3).max(1000),
  acceptanceCriteria: z.string().trim().min(3).max(1000), targetDate: dateSchema,
}).strict();
export const roadmapDraftSchema = z.object({
  goal: z.string().trim().min(3).max(2000), startsAt: dateSchema, deadline: dateSchema,
  assumptions: z.array(z.string().trim().min(1).max(1000)).max(12), diagnosis: diagnosisSchema,
  milestones: z.array(milestoneSchema).min(3).max(5), actions: generatedPlanSchema.shape.actions.length(5),
  mode: z.enum(["new", "next"]), milestoneId: z.string().nullable(),
}).strict().superRefine((v, ctx) => {
  if (v.deadline <= v.startsAt) ctx.addIssue({ code: "custom", message: "目標期限必須在起始日之後 / Deadline must follow the start date" });
  let previous = v.startsAt;
  for (const m of v.milestones) {
    if (m.targetDate < previous || m.targetDate > v.deadline) ctx.addIssue({ code: "custom", message: "里程碑日期須依序且在目標期限內 / Milestone dates must be ordered within the goal horizon" });
    previous = m.targetDate;
  }
  const parsed = generatedPlanSchema.safeParse({ actions: v.actions });
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", message: issue.message });
  if ((v.mode === "next") !== Boolean(v.milestoneId)) ctx.addIssue({ code: "custom", message: "階段資料不一致 / Invalid stage" });
});
export type RoadmapDraft = z.infer<typeof roadmapDraftSchema>;
export type MilestoneView = z.infer<typeof milestoneSchema> & { id: string; position: number; achievedAt: string | null; outcomeNote: string | null; total: number; done: number; status: "blocked" | "unplanned" | "active" | "awaiting" | "achieved" };
export function milestoneViews(milestones: Array<z.infer<typeof milestoneSchema> & { id: string; position: number; achievedAt: string | null; outcomeNote: string | null }>, actions: Array<{ milestoneId?: string | null; done: boolean }>): MilestoneView[] {
  let unlocked = true;
  return [...milestones].sort((a, b) => a.position - b.position).map(m => {
    const rows = actions.filter(a => a.milestoneId === m.id), done = rows.filter(a => a.done).length;
    const status: MilestoneView["status"] = !unlocked ? "blocked" : m.achievedAt ? "achieved" : !rows.length ? "unplanned" : done === rows.length ? "awaiting" : "active";
    unlocked = unlocked && Boolean(m.achievedAt);
    return { ...m, total: rows.length, done, status };
  });
}
export const baseRequest = { revision: z.number().int().nonnegative(), requestId: z.string().uuid(), locale: z.enum(["en", "zh-tw"]).default("en") };
export const roadmapPostSchema = z.discriminatedUnion("action", [
  z.object({ ...baseRequest, action: z.literal("generate"), goal: z.string().trim().min(3).max(2000), deadline: dateSchema.nullable().default(null) }).strict(),
  z.object({ ...baseRequest, action: z.literal("next"), planId: z.string().min(1), planRevision: z.number().int().nonnegative(), milestoneId: z.string().min(1) }).strict(),
]);
export const roadmapPatchSchema = z.object({ ...baseRequest, action: z.enum(["edit", "activate"]), draft: roadmapDraftSchema }).strict();
export const outcomePatchSchema = z.object({ revision: z.number().int().nonnegative(), achieved: z.boolean(), outcomeNote: z.string().trim().max(4000).default("") }).strict();
