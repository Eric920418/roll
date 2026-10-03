import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import { fortnightIndex, periodEnd } from "@/lib/playbook/quiz";
import { REWARD_RULES as rules, completeRewardProfile, rewardKeys } from "./policy";

export class RewardError extends Error {
  constructor(message: string, public status = 409, public code = "reward_conflict") { super(message); }
}
export async function rewardTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await prisma.$transaction(tx => work(tx as Prisma.TransactionClient), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
        if (attempt < 2) continue;
        throw new RewardError("積分交易忙碌，請重試 / Reward transaction busy; retry", 409, "reward_busy");
      }
      throw error;
    }
  }
  throw new RewardError("積分交易忙碌，請重試 / Reward transaction busy; retry", 409);
}
// Every award/redemption serializes on this row, including awards from other feature transactions.
export async function lockRewardAccount(tx: Prisma.TransactionClient, userId: string) {
  const existing = await tx.rewardAccount.findUnique({ where: { userId } });
  const account = await tx.rewardAccount.upsert({ where: { userId }, create: { userId }, update: { balance: { increment: 0 } } });
  if (!existing) {
    // Old completed tasks are permanently marked as already claimed, without awarding points.
    const done = await tx.actionItem.findMany({ where: { done: true, actionPlan: { userId } }, select: { id: true } });
    if (done.length) await tx.rewardEntry.createMany({ data: done.map(a => ({ userId, eventKey: `action:${a.id}`, kind: "action", points: 0, dayKey: rewardKeys().day })), skipDuplicates: true });
  }
  return account;
}
export async function prepareActionReward(tx: Prisma.TransactionClient, userId: string, actionId: string, alreadyDone: boolean) {
  await lockRewardAccount(tx, userId);
  if (alreadyDone) await tx.rewardEntry.createMany({ data: [{ userId, eventKey: `action:${actionId}`, kind: "action", points: 0, dayKey: rewardKeys().day }], skipDuplicates: true });
}
export async function awardReward(tx: Prisma.TransactionClient, userId: string, kind: "visit" | "action" | "quiz" | "profile", source: string, now = new Date()) {
  await lockRewardAccount(tx, userId);
  const eventKey = `${kind}:${source}`, { day } = rewardKeys(now);
  if (await tx.rewardEntry.findUnique({ where: { userId_eventKey: { userId, eventKey } } })) return false;
  let points: number = rules[kind];
  if (kind === "action" && await tx.rewardEntry.count({ where: { userId, kind, dayKey: day, points: { gt: 0 } } }) >= rules.dailyActions) points = 0;
  await tx.rewardEntry.create({ data: { userId, eventKey, kind, points, dayKey: day } });
  if (points) await tx.rewardAccount.update({ where: { userId }, data: { balance: { increment: points } } });
  return points > 0;
}
export async function awardProfile(tx: Prisma.TransactionClient, userId: string) {
  const profile = await tx.onboardingProfile.findUnique({ where: { userId } });
  if (completeRewardProfile(profile)) await awardReward(tx, userId, "profile", "complete");
}
export async function claimVisit(userId: string) {
  await rewardTransaction(async tx => { await awardReward(tx, userId, "visit", rewardKeys().day); await awardProfile(tx, userId); });
}
export async function redeemReward(userId: string, requestId: string) {
  return rewardTransaction(async tx => {
    const account = await lockRewardAccount(tx, userId);
    const replay = await tx.rewardRedemption.findUnique({ where: { userId_requestId: { userId, requestId } } });
    if (replay) return replay;
    const { day, month } = rewardKeys();
    const used = await tx.rewardRedemption.aggregate({ where: { userId, monthKey: month }, _sum: { credits: true } });
    if ((used._sum.credits ?? 0) + rules.redemptionCredits > rules.monthlyCredits) throw new RewardError("本月已達 20 次兌換上限 / Monthly redemption limit of 20 credits reached", 409, "monthly_limit");
    if (account.balance < rules.redemptionPoints) throw new RewardError("積分不足，需要 100 分 / Insufficient points; 100 required", 409, "insufficient_points");
    const redemption = await tx.rewardRedemption.create({ data: { userId, requestId, monthKey: month, points: rules.redemptionPoints, credits: rules.redemptionCredits } });
    await tx.rewardAccount.update({ where: { userId }, data: { balance: { decrement: rules.redemptionPoints } } });
    await tx.rewardEntry.create({ data: { userId, eventKey: `redeem:${requestId}`, kind: "redeem", points: -rules.redemptionPoints, dayKey: day } });
    await tx.aiAllowance.upsert({ where: { userId }, create: { userId, rewardBalance: rules.redemptionCredits }, update: { rewardBalance: { increment: rules.redemptionCredits } } });
    return redemption;
  });
}
export type RewardOpportunity = { kind: "profile" | "action" | "quiz"; href: string; points: number; title?: string };
export async function rewardOpportunities(userId: string, paid: boolean, createdAt: Date, profile: unknown, now = new Date()) {
  const { day } = rewardKeys(now), period = fortnightIndex(createdAt, now);
  const [profileClaim, actionClaims, plan] = await Promise.all([
    prisma.rewardEntry.findUnique({ where: { userId_eventKey: { userId, eventKey: "profile:complete" } } }),
    prisma.rewardEntry.findMany({ where: { userId, kind: "action" }, select: { eventKey: true, dayKey: true, points: true } }),
    paid ? getActiveActionPlan(userId) : Promise.resolve(null),
  ]);
  const opportunities: RewardOpportunity[] = [];
  if (!profileClaim) opportunities.push({ kind: "profile", href: completeRewardProfile(profile) ? "/dashboard" : "/dashboard/profile", points: rules.profile, title: completeRewardProfile(profile) ? "claim" : undefined });
  const claimed = new Set(actionClaims.map(a => a.eventKey));
  const remainingActions = rules.dailyActions - actionClaims.filter(a => a.dayKey === day && a.points > 0).length;
  if (remainingActions > 0) {
    for (const action of (plan?.nextMoves ?? []).filter(a => !a.done && !a.dependency.blocked && !claimed.has(`action:${a.id}`)).slice(0, remainingActions)) {
      opportunities.push({ kind: "action", href: `/dashboard/agenda#action-${action.id}`, points: rules.action, title: action.title });
    }
  }
  // Quiz history and awards remain available, but are not part of the recommended next step.
  return { opportunities, nextQuizAt: periodEnd(createdAt, period).toISOString() };
}
export async function getRewardSummary(cursor?: string, redemptionRequestId?: string) {
  const account = await getCurrentAccount();
  if (!account) throw new RewardError("未授權，請重新登入 / Please log in", 401, "unauthorized");
  const userId = account.id, { day, month } = rewardKeys();
  const [wallet, entries, monthly, visit, allowance, reminder, delivery, activities, confirmedRedemption] = await Promise.all([
    prisma.rewardAccount.findUnique({ where: { userId } }),
    prisma.rewardEntry.findMany({ where: { userId, points: { not: 0 }, ...(cursor ? { id: { lt: cursor } } : {}) }, orderBy: { id: "desc" }, take: 51 }),
    prisma.rewardRedemption.aggregate({ where: { userId, monthKey: month }, _sum: { credits: true } }),
    prisma.rewardEntry.findUnique({ where: { userId_eventKey: { userId, eventKey: `visit:${day}` } } }),
    prisma.aiAllowance.findUnique({ where: { userId }, select: { rewardBalance: true } }),
    prisma.rewardReminder.findUnique({ where: { userId }, select: { enabled: true, time: true, timeZone: true, locale: true, nextSendAt: true } }),
    prisma.rewardDelivery.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { status: true, acceptedAt: true, lastError: true, scheduledAt: true } }),
    rewardOpportunities(userId, getEffectivePlan(account) !== "free", account.createdAt, account.profile),
    redemptionRequestId ? prisma.rewardRedemption.findUnique({ where: { userId_requestId: { userId, requestId: redemptionRequestId } }, select: { requestId: true } }) : Promise.resolve(null),
  ]);
  return {
    confirmedRedemptionRequestId: confirmedRedemption?.requestId ?? null,
    balance: wallet?.balance ?? 0, visitedToday: Boolean(visit), rewardRemaining: allowance?.rewardBalance ?? 0,
    monthlyRedeemed: monthly._sum.credits ?? 0, ...activities,
    entries: entries.slice(0, 50).map(e => ({ id: e.id, kind: e.kind, points: e.points, createdAt: e.createdAt.toISOString() })),
    nextCursor: entries.length > 50 ? entries[49].id : null,
    reminder: reminder ? { ...reminder, nextSendAt: reminder.nextSendAt?.toISOString() ?? null } : null,
    delivery: delivery ? { ...delivery, acceptedAt: delivery.acceptedAt?.toISOString() ?? null, scheduledAt: delivery.scheduledAt.toISOString() } : null,
    emailAvailable: process.env.REWARD_EMAIL_ENABLED === "true" && Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && process.env.CRON_SECRET && process.env.AUTH_SECRET && process.env.NEXT_PUBLIC_APP_URL),
  };
}
export type RewardSummary = Awaited<ReturnType<typeof getRewardSummary>>;
