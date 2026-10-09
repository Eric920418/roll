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
    due: now.getTime() >= start! + 7 * DAY };
}

const answer = z.string().trim().min(1, "請完整回答 / Please answer this question").max(2000);
export const trialDraftSchema = z.object({
  goal: z.string().max(2000), motivation: z.string().max(2000), firstStep: z.string().max(2000),
  continueUsing: z.enum(["", "yes", "no"]), reason: z.string().max(2000), usage: z.string().max(2000),
  painPoint: z.string().max(2000), indispensable: z.string().max(2000),
});
export const trialAnswersSchema = trialDraftSchema.extend({
  goal: answer, motivation: answer, firstStep: answer,
  continueUsing: z.enum(["yes", "no"]), reason: answer, usage: z.string().trim().max(2000),
  painPoint: answer, indispensable: answer,
}).superRefine((data, context) => {
  if (data.continueUsing === "yes" && !data.usage) context.addIssue({ code: "custom", path: ["usage"], message: "請說明如何使用 / Describe how you will use NOVA" });
}).transform(data => ({ ...data, usage: data.continueUsing === "no" ? "" : data.usage }));
export type TrialAnswers = z.output<typeof trialAnswersSchema>;
export const trialSubmissionSchema = z.object({ startsAt: z.iso.datetime(), locale: z.enum(["en", "zh-tw"]), answers: trialAnswersSchema });

export function trialFeedbackCsv(rows: Array<{ email: string; createdAt: string; answers: TrialAnswers }>) {
  const cell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  return ["email,submitted_at,goal,motivation,first_step,continue_using,reason,usage,pain_point,indispensable", ...rows.map(row => [row.email, row.createdAt, ...(["goal", "motivation", "firstStep", "continueUsing", "reason", "usage", "painPoint", "indispensable"] as const).map(key => row.answers[key])].map(cell).join(","))].join("\r\n");
}
