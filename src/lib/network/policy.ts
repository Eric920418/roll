import { z } from "zod";
export const networkEnabled = () => process.env.MEMBER_NETWORK_ENABLED === "true";
export const CONDITIONS = ["interviews_5", "interviews_10", "interviews_complete", "first_paid_customer", "fundraising_open"] as const;
export const SECTIONS = ["signals", "profile", "strategy", "actionPlan", "kpis", "milestones", "updates", "businessPlan"] as const;
export const scope = z.object({ planId: z.string().min(1).max(200).optional(), journeyId: z.string().min(1).max(200).optional() }).strict().refine(v => Number(Boolean(v.planId)) + Number(Boolean(v.journeyId)) === 1);
export const inviteSchema = z.object({ profileId: z.string().min(1).max(200), conditions: z.array(z.enum(CONDITIONS)).max(5).default([]) }).strict();
export const connectionSchema = z.object({ action: z.enum(["accept", "decline", "block", "read"]), revision: z.number().int().positive() }).strict();
export const messageSchema = z.object({ requestId: z.uuid(), body: z.string().trim().min(1).max(4000) }).strict();
export const shareSchema = z.object({ revision: z.number().int().nonnegative(), sections: z.array(z.enum(SECTIONS)).max(8), scope: scope.optional() }).strict().refine(v => !v.sections.includes("signals") || Boolean(v.scope), "觀察通知需要選擇工作區 / Select a workspace for progress sharing");
export const weekKey = (at = new Date()) => {
  const local = new Date(at.getTime() + 8 * 3600000);
  local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7);
  return local.toISOString().slice(0, 10);
};
export const weekDueAt = (week: string) => new Date(Date.parse(week + "T01:00:00Z") + 7 * 86400000);
export const pairKey = (a: string, b: string) => [a, b].sort().join(":");
export function scopeKey(value: z.infer<typeof scope>) { return value.planId ? `plan:${value.planId}` : `journey:${value.journeyId}`; }
export function conditionMet(condition: string, progress: { interviews: number; complete: boolean; paid: number; fundraising: boolean }) {
  return condition === "interviews_5" ? progress.interviews >= 5 : condition === "interviews_10" ? progress.interviews >= 10 : condition === "interviews_complete" ? progress.complete : condition === "first_paid_customer" ? progress.paid > 0 : condition === "fundraising_open" && progress.fundraising;
}
export const conditionLabel = (key: string, zh: boolean) => ({ interviews_5: zh ? "完成 5 家有效訪談" : "5 valid company interviews", interviews_10: zh ? "完成 10 家有效訪談" : "10 valid company interviews", interviews_complete: zh ? "訪談階段完成" : "Interview stage completed", first_paid_customer: zh ? "第一位實際付費客戶" : "First paying customer", fundraising_open: zh ? "開放募資" : "Open for fundraising" })[key] || key;

export const autoCardData = { role: "founder", categories: ["collaboration"], country: "", industry: "", slogan: "", offers: "", looksFor: "", visibleFields: ["country", "industry", "companyPitch", "icp", "photo"], visible: false, sourcePolicy: 2 };

export function visitorPeriods(now = new Date()) {
  const week = weekKey(now), start = new Date(`${week}T00:00:00+08:00`);
  return { week, start, previousWeek: weekKey(new Date(start.getTime() - 1)), previousStart: new Date(start.getTime() - 7 * 86400000), previousCutoff: new Date(now.getTime() - 7 * 86400000) };
}
