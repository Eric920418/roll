import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPaidPlan } from "@/lib/billing/gate";
import { toPlanKey } from "@/lib/billing/plans";
import { MemberError } from "@/lib/member-http";
import { monthlyCycle } from "@/lib/ai/allowance-cycle";
import { trialWindow, trialIncentiveEnd, type SimpleTrialAnswers } from "./next-steps";

async function statusIn(db: Prisma.TransactionClient, userId: string, now: Date) {
  const user = await db.user.findUnique({ where: { id: userId }, include: { trialFeedbackGrant: true } });
  if (!user) throw new MemberError("請重新登入 / Please sign in", 401);
  const trial = trialWindow(user, now);
  const report = trial ? await db.feedbackReport.findUnique({ where: { trialKey: `${userId}:${trial.startsAt}` }, select: { id: true, surveyAnswers: true } }) : null;
  const paid = getPaidPlan({ ...user, plan: toPlanKey(user.plan), trialPlan: user.trialPlan ? toPlanKey(user.trialPlan) : null, betaAccess: false }, now) !== "free";
  return { user, trial, report, paid, eligible: Boolean(trial?.available && !paid && !user.trialFeedbackGrant) };
}
export async function trialFeedbackStatus(userId: string, db = prisma as unknown as Prisma.TransactionClient, now = new Date()) {
  const { user, trial, report, paid, eligible } = await statusIn(db, userId, now);
  return { trial, paid, submitted: Boolean(report), eligible, grantedEndsAt: user.trialFeedbackGrant?.grantedEndsAt.toISOString() || null, granted: Boolean(user.trialFeedbackGrant) };
}
export async function submitTrialFeedback(userId: string, input: { startsAt: string; locale: string; answers?: SimpleTrialAnswers; claim?: boolean }, now = new Date()) {
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const { user, trial, report, eligible } = await statusIn(tx, userId, now);
    if (!trial?.available || trial.startsAt !== input.startsAt) throw new MemberError("試用設定已變更或已撤銷，請重新載入 / Trial changed or revoked; reload", 409);
    if (!report && !input.answers) throw new MemberError("請先完成問卷 / Complete the survey first", 409);
    if (input.claim && !report) throw new MemberError("請先完成問卷 / Complete the survey first", 409);
    if (!report && input.answers) {
      const answers = input.answers;
      await tx.feedbackReport.create({ data: { userId, type: "other", title: "NOVA trial feedback", trialKey: `${userId}:${trial.startsAt}`, locale: input.locale, pageUrl: "/dashboard/agenda",
        body: `Did you like the product? ${answers.liked}${answers.reason ? `\nReason: ${answers.reason}` : ""}`,
        surveyAnswers: { version: 3, startsAt: trial.startsAt, endsAt: trial.endsAt, answers },
      } });
    }
    if (eligible) {
      const endsAt = trialIncentiveEnd(user.trialEndsAt!, now);
      const allowance = await tx.aiAllowance.findUnique({ where: { userId } });
      const cycle = monthlyCycle(user.trialStartsAt!, new Date(Math.min(now.getTime(), user.trialEndsAt!.getTime() - 1)));
      await tx.trialFeedbackGrant.create({ data: { userId, trialStartsAt: user.trialStartsAt!, originalEndsAt: user.trialEndsAt!, grantedEndsAt: endsAt,
        aiCycleStart: allowance?.cycleStart || cycle.start, aiCycleEnd: allowance?.cycleEnd || cycle.end } });
      await tx.user.update({ where: { id: userId }, data: { trialEndsAt: endsAt } });
    }
    return trialFeedbackStatus(userId, tx, now);
  });
}
