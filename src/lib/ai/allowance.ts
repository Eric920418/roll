import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Account } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { monthlyCycle } from "./allowance-cycle";

export const AI_INCLUDED_PER_MONTH = 150;
const RESERVATION_MS = 15 * 60 * 1000;

export type AiUsageSummary = {
  included: number;
  used: number;
  remaining: number;
  bonusRemaining: number;
  resetsAt: string | null;
  rewardRemaining: number;
};

async function allowanceCycleFor(account: Account, now: Date) {
  const effectivePlan = getEffectivePlan(account, now);
  if (effectivePlan === "free") return null;

  const paidPlan = getEffectivePlan(
    {
      ...account,
      betaAccess: false,
      trialPlan: null,
      trialStartsAt: null,
      trialEndsAt: null,
    },
    now,
  );

  const trialActive =
    account.trialPlan &&
    account.trialStartsAt &&
    account.trialEndsAt &&
    account.trialStartsAt <= now &&
    account.trialEndsAt > now &&
    getEffectivePlan({ ...account, betaAccess: false }, now) === account.trialPlan &&
    paidPlan !== account.trialPlan;
  if (trialActive) return monthlyCycle(account.trialStartsAt!, now);

  const sub = account.paypalSubscriptionId
    ? await prisma.subscription.findUnique({
        where: { paypalSubscriptionId: account.paypalSubscriptionId },
        select: { startedAt: true },
      })
    : null;
  return monthlyCycle(sub?.startedAt ?? account.planUpdatedAt ?? account.createdAt, now);
}

async function serializable<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return (await prisma.$transaction(
        async (tx) => work(tx as Prisma.TransactionClient),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )) as unknown as T;
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("AI allowance transaction retry exhausted");
}

async function currentState(
  tx: Prisma.TransactionClient,
  userId: string,
  cycle: { start: Date; end: Date } | null,
  now: Date,
) {
  let allowance = await tx.aiAllowance.upsert({
    where: { userId },
    create: { userId, ...(cycle ? { cycleStart: cycle.start, cycleEnd: cycle.end } : {}) },
    update: {},
  });

  const stale = await tx.aiUsage.findMany({
    where: { userId, status: "pending", expiresAt: { lte: now } },
    select: { id: true, source: true, cycleStart: true },
  });
  const staleReward = stale.filter((item) => item.source === "reward").length;
  const staleBonus = stale.filter((item) => item.source === "bonus").length;
  const staleIncludedCurrent = stale.filter(
    (item) =>
      item.source === "included" &&
      item.cycleStart?.getTime() === allowance.cycleStart?.getTime(),
  ).length;
  if (stale.length) {
    await tx.aiUsage.updateMany({
      where: { id: { in: stale.map((item) => item.id) } },
      data: { status: "failed", completedAt: now },
    });
  }

  const cycleChanged = Boolean(cycle && allowance.cycleStart?.getTime() !== cycle.start.getTime());
  allowance = await tx.aiAllowance.update({
    where: { userId },
    data: {
      ...(cycle ? { cycleStart: cycle.start, cycleEnd: cycle.end } : {}),
      includedUsed: cycleChanged ? 0 : allowance.includedUsed,
      includedReserved: cycleChanged
        ? 0
        : Math.max(0, allowance.includedReserved - staleIncludedCurrent),
      bonusBalance: allowance.bonusBalance + staleBonus,
      rewardBalance: allowance.rewardBalance + staleReward,
    },
  });
  return allowance;
}

export async function reserveAiUsage(account: Account, scope: "paid" | "copilot" = "paid"): Promise<string | null> {
  const now = new Date();
  const cycle = await allowanceCycleFor(account, now);
  if (!cycle && scope !== "copilot") return null;

  return serializable(async (tx) => {
    const allowance = await currentState(tx, account.id, cycle, now);
    let source: "included" | "bonus" | "reward";
    if (cycle && allowance.includedUsed + allowance.includedReserved < AI_INCLUDED_PER_MONTH) {
      source = "included";
      await tx.aiAllowance.update({
        where: { userId: account.id },
        data: { includedReserved: { increment: 1 } },
      });
    } else if (allowance.rewardBalance > 0) {
      source = "reward";
      await tx.aiAllowance.update({ where: { userId: account.id }, data: { rewardBalance: { decrement: 1 } } });
    } else if (cycle && allowance.bonusBalance > 0) {
      source = "bonus";
      await tx.aiAllowance.update({
        where: { userId: account.id },
        data: { bonusBalance: { decrement: 1 } },
      });
    } else {
      return null;
    }

    const usage = await tx.aiUsage.create({
      data: {
        userId: account.id,
        source,
        cycleStart: source === "included" ? cycle!.start : null,
        expiresAt: new Date(now.getTime() + RESERVATION_MS),
      },
    });
    return usage.id;
  });
}

export async function completeAiUsage(
  usageId: string,
  succeeded: boolean,
): Promise<void> {
  await serializable(async (tx) => {
    const usage = await tx.aiUsage.findUnique({ where: { id: usageId } });
    if (!usage || usage.status !== "pending") return;
    const allowance = await tx.aiAllowance.findUnique({ where: { userId: usage.userId } });
    if (!allowance) return;

    if (usage.source === "included") {
      const sameCycle = usage.cycleStart?.getTime() === allowance.cycleStart?.getTime();
      if (sameCycle) {
        await tx.aiAllowance.update({
          where: { userId: usage.userId },
          data: {
            includedReserved: Math.max(0, allowance.includedReserved - 1),
            ...(succeeded ? { includedUsed: { increment: 1 } } : {}),
          },
        });
      }
    } else if (!succeeded) {
      await tx.aiAllowance.update({
        where: { userId: usage.userId },
        data: usage.source === "reward" ? { rewardBalance: { increment: 1 } } : { bonusBalance: { increment: 1 } },
      });
    }

    await tx.aiUsage.update({
      where: { id: usageId },
      data: { status: succeeded ? "succeeded" : "failed", completedAt: new Date() },
    });
  });
}

export async function getAiUsageSummary(account: Account): Promise<AiUsageSummary | null> {
  const now = new Date();
  const cycle = await allowanceCycleFor(account, now);
  const allowance = await serializable((tx) => currentState(tx, account.id, cycle, now));
  return {
    included: cycle ? AI_INCLUDED_PER_MONTH : 0,
    used: cycle ? allowance.includedUsed : 0,
    remaining: Math.max(
      0,
      cycle ? AI_INCLUDED_PER_MONTH - allowance.includedUsed - allowance.includedReserved : 0,
    ),
    bonusRemaining: cycle ? allowance.bonusBalance : 0,
    rewardRemaining: allowance.rewardBalance,
    resetsAt: cycle?.end.toISOString() ?? null,
  };
}
