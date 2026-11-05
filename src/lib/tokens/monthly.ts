import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBetaAccess } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { toPlanKey } from "@/lib/billing/plans";
import { monthlyTokens } from "./service";
export async function grantMonthlyTokens() {
  const period = new Date().toISOString().slice(0, 7), betaAccess = await getBetaAccess(), deadline = Date.now() + 200000;
  let cursor: string | undefined, scanned = 0, processed = 0;
  while (Date.now() < deadline) {
    const users = await prisma.user.findMany({ where: { tokenLedger: { none: { eventKey: { startsWith: "monthly:", endsWith: `:${period}` } } } }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!users.length) return { period, scanned, processed, complete: true };
    scanned += users.length;
    const eligible = users.filter(row => getEffectivePlan({ ...row, plan: toPlanKey(row.plan), trialPlan: row.trialPlan ? toPlanKey(row.trialPlan) : null, betaAccess }) !== "free");
    for (let i = 0; i < eligible.length; i += 5) {
      await Promise.all(eligible.slice(i, i + 5).map(user => prisma.$transaction(raw => monthlyTokens(raw as unknown as Prisma.TransactionClient, user.id))));
      processed += eligible.slice(i, i + 5).length;
    }
    cursor = users.at(-1)!.id;
  }
  // Already-issued event keys are excluded; the next daily run resumes without double grants.
  return { period, scanned, processed, complete: false };
}
