import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import { gettingStartedState, GUIDE_VERSION } from "./state";

export const getGettingStarted = cache(async (userId: string) => {
  const account = await getCurrentAccount();
  if (!account || account.id !== userId) throw new Error("Guide account mismatch");
  const [preferences, plan, previouslyDone] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { gettingStartedVersion: true, gettingStartedDismissedAt: true, gettingStartedCompletedAt: true } }),
    getActiveActionPlan(userId),
    prisma.actionItem.findFirst({ where: { actionPlan: { userId }, done: true }, select: { id: true } }),
  ]);
  const view = gettingStartedState({ profile: account.profile, plan,
    canGenerate: planAtLeast(getEffectivePlan(account), "pro"),
    dismissedAt: preferences.gettingStartedDismissedAt, completedAt: preferences.gettingStartedCompletedAt,
    previouslyDone: Boolean(previouslyDone),
  });
  // Version 1 with a null dismissal after completion means an explicit manual reopen.
  if (preferences.gettingStartedVersion === GUIDE_VERSION && !preferences.gettingStartedDismissedAt) view.visible = true;
  return view;
});

/** Called only after a real, successful completion inside the existing task transaction. */
export async function completeGettingStarted(tx: Prisma.TransactionClient, userId: string) {
  const now = new Date();
  await tx.user.updateMany({ where: { id: userId, gettingStartedCompletedAt: null },
    data: { gettingStartedVersion: GUIDE_VERSION, gettingStartedCompletedAt: now, gettingStartedDismissedAt: now } });
}
