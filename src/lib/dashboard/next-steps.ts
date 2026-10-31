import { z } from "zod";

const DAY = 86_400_000;
export function actionProgress(actions: Array<{ done: boolean; metric?: { target: number | null; current: number | null } }>) {
  if (!actions.length) return 0;
  const completed = actions.reduce((sum, action) => {
    if (action.done) return sum + 1;
    const { target, current } = action.metric || {};
    return sum + (Number.isFinite(target) && target! > 0 && Number.isFinite(current) ? Math.max(0, Math.min(0.99, current! / target!)) : 0);
  }, 0);
  return Math.floor(completed / actions.length * 1000) / 10;
}

export function trialWindow(user: { trialPlan: string | null; trialStartsAt: Date | null; trialEndsAt: Date | null }, now = new Date()) {
  const start = user.trialStartsAt?.getTime(), end = user.trialEndsAt?.getTime();
  if (!["pro", "business"].includes(user.trialPlan || "") || !Number.isFinite(start) || !Number.isFinite(end) || end! <= start!) return null;
  return { startsAt: user.trialStartsAt!.toISOString(), endsAt: user.trialEndsAt!.toISOString(),
    active: now.getTime() >= start! && now.getTime() < end!,
    daysRemaining: Math.max(0, Math.ceil((end! - now.getTime()) / DAY)),
    due: now.getTime() >= end!,
    available: now.getTime() >= start!,
    totalDays: Math.ceil((end! - start!) / DAY),
    day: Math.max(1, Math.min(Math.ceil((end! - start!) / DAY), Math.floor((now.getTime() - start!) / DAY))),
    elapsedPercent: Math.max(0, Math.min(100, (now.getTime() - start!) / (end! - start!) * 100)) };
}

const answer = z.string().trim().min(1, "請完整回答 / Please answer this question").max(2000);
export const trialDraftSchema = z.object({
  goal: z.string().max(2000), motivation: z.string().max(2000), firstStep: z.string().max(2000),
  continueUsing: z.enum(["", "yes", "no"]), reason: z.string().max(2000), usage: z.string().max(2000),
  painPoint: z.string().max(2000), indispensable: z.string().max(2000),
  yesReason: z.string().max(2000).optional(), noReason: z.string().max(2000).optional(),
  linkedinSharing: z.enum(["", "yes", "no"]).optional(), linkedinDraft: z.string().max(3000).optional(),
});
export const trialAnswersSchema = trialDraftSchema.omit({ yesReason: true, noReason: true }).extend({
  goal: answer, motivation: answer, firstStep: answer,
  continueUsing: z.enum(["yes", "no"]), reason: answer, usage: z.string().trim().max(2000),
  painPoint: answer, indispensable: answer,
}).superRefine((data, context) => {
  if (data.continueUsing === "yes" && !data.usage) context.addIssue({ code: "custom", path: ["usage"], message: "請說明如何使用 / Describe how you will use NOVA" });
  if (data.continueUsing === "yes" && data.linkedinSharing === "yes" && !data.linkedinDraft?.trim()) context.addIssue({ code: "custom", path: ["linkedinDraft"], message: "請確認分享草稿，或選擇暫時不要 / Review your sharing draft or choose Not now" });
}).transform(data => ({ ...data, usage: data.continueUsing === "no" ? "" : data.usage,
  linkedinSharing: data.continueUsing === "yes" ? data.linkedinSharing || "" : "",
  linkedinDraft: data.continueUsing === "yes" && data.linkedinSharing === "yes" ? data.linkedinDraft!.trim() : "",
}));
export type TrialAnswers = z.output<typeof trialAnswersSchema>;
export const trialSubmissionSchema = z.object({ startsAt: z.iso.datetime(), locale: z.enum(["en", "zh-tw"]), answers: trialAnswersSchema });

export function trialLinkedInDraft(answers: { reason: string; usage: string }, locale: string) {
  const excerpt = (value: string) => value.trim().length > 1200 ? `${value.trim().slice(0, 1199)}…` : value.trim();
  return locale === "zh-tw"
    ? `我正在試用 @Nova AI。\n\n我想繼續使用的原因：\n${excerpt(answers.reason)}\n\n接下來我打算這樣用：\n${excerpt(answers.usage)}\n\nhttps://rollon.com.tw/product`
    : `I've been trying @Nova AI.\n\nWhy I want to keep using it:\n${excerpt(answers.reason)}\n\nHow I plan to use it:\n${excerpt(answers.usage)}\n\nhttps://rollon.com.tw/product`;
}

export type TrialFeedbackCsvRow = { email: string; createdAt: string; answers: TrialAnswers | SimpleTrialAnswers; version?: number; grantedEndsAt?: string };
export function trialFeedbackCsv(rows: TrialFeedbackCsvRow[]) {
  const cell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  const headers = "email,submitted_at,goal,motivation,first_step,continue_using,reason,usage,pain_point,indispensable,linkedin_sharing_willingness,linkedin_draft,survey_version,liked_product,no_reason,trial_extension_until";
  return [headers, ...rows.map(row => {
    const legacy = "continueUsing" in row.answers ? row.answers : null, simple = "liked" in row.answers ? row.answers : null;
    return [row.email, row.createdAt, ...(["goal", "motivation", "firstStep", "continueUsing", "reason", "usage", "painPoint", "indispensable", "linkedinSharing", "linkedinDraft"] as const).map(key => legacy?.[key] || ""), String(row.version || (simple ? 3 : 2)), simple?.liked || "", simple?.reason || "", row.grantedEndsAt || ""].map(cell).join(",");
  })].join("\r\n");
}

export const SIMPLE_FEEDBACK_REASONS = ["needs", "complexity", "price"] as const;
export const simpleTrialAnswersSchema = z.object({ liked: z.enum(["yes", "no"]), reason: z.enum(SIMPLE_FEEDBACK_REASONS).nullable().default(null) }).strict().superRefine((v, ctx) => {
  if (v.liked === "no" && !v.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "請選擇原因 / Select a reason" });
}).transform(v => ({ ...v, reason: v.liked === "yes" ? null : v.reason }));
export type SimpleTrialAnswers = z.output<typeof simpleTrialAnswersSchema>;
export const simpleTrialSubmissionSchema = z.object({ action: z.literal("trialSurvey"), version: z.literal(3), startsAt: z.iso.datetime(), locale: z.enum(["en", "zh-tw"]), answers: simpleTrialAnswersSchema }).strict();
export const trialIncentiveEnd = (oldEnd: Date, now = new Date()) => new Date(Math.max(oldEnd.getTime(), now.getTime()) + 72 * 3600000);
