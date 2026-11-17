import "server-only";
import type { Prisma } from "@prisma/client";
import { allowanceCycleFor } from "@/lib/ai/allowance";
import { networkAccount } from "@/lib/network/access";
import { toPlanKey } from "@/lib/billing/plans";
import { tokenQuote } from "@/lib/billing/commerce";
import { MemberError } from "@/lib/member-http";
import { convertLegacy, type LegacySnapshot } from "./conversion";
export async function legacySnapshot(tx: Prisma.TransactionClient, userId: string, now = new Date()): Promise<LegacySnapshot> {
  const account = await networkAccount(userId, tx);
  const [tokens, rewards, ai, entries, holds, usages, referral, tokenTotals, rewardTotals] = await Promise.all([
    tx.tokenWallet.findUnique({ where: { userId } }), tx.rewardAccount.findUnique({ where: { userId } }), tx.aiAllowance.findUnique({ where: { userId } }),
    tx.rewardEntry.aggregate({ where: { userId, points: { gt: 0 }, kind: { not: "redeem" } }, _sum: { points: true } }),
    tx.tokenReservation.findMany({ where: { userId, status: { in: ["reserved", "captured"] } } }),
    tx.aiUsage.findMany({ where: { userId, status: "pending", source: { not: "credits" } } }),
    tx.referralAccount.findUnique({ where: { userId }, include: { entries: true } }),
    tx.tokenLedger.aggregate({ where: { userId }, _sum: { availableDelta: true, reservedDelta: true } }),
    tx.rewardEntry.aggregate({ where: { userId }, _sum: { points: true } }),
  ]);
  if ((tokens?.available ?? 0) !== (tokenTotals._sum.availableDelta ?? 0) || (tokens?.reserved ?? 0) !== (tokenTotals._sum.reservedDelta ?? 0) || (rewards?.balance ?? 0) !== (rewardTotals._sum.points ?? 0)) throw new MemberError("舊餘額與收支紀錄不一致，尚未轉換 / Legacy balance and ledger mismatch; not converted", 409);
  const cycle = await allowanceCycleFor({ ...account, plan: toPlanKey(account.plan), trialPlan: account.trialPlan ? toPlanKey(account.trialPlan) : null }, now, tx);
  const sameCycle = Boolean(cycle && ai?.cycleStart?.getTime() === cycle.start.getTime());
  const pending = usages.filter(u => u.source === "included" && u.cycleStart?.getTime() === cycle?.start.getTime());
  if (sameCycle && (ai!.includedReserved !== pending.length || ai!.includedUsed + pending.length > 150)) throw new MemberError("舊 AI 預扣無法核對，尚未轉換 / Legacy AI holds require reconciliation; not converted", 409);
  const expiry = cycle?.end.toISOString() ?? null;
  const quote = await tokenQuote(tx);
  return { userId, tokenAvailable: tokens?.available ?? 0, tokenReserved: tokens?.reserved ?? 0, rewardPoints: rewards?.balance ?? 0, earnedRewardPoints: entries._sum.points ?? 0, bonus: ai?.bonusBalance ?? 0, reward: ai?.rewardBalance ?? 0, referralDebt: referral?.debt ?? 0,
    earnedReferrals: (referral?.entries ?? []).filter(e => e.kind === "grant" && !referral!.entries.some(r => r.kind === "revoke" && r.referralId === e.referralId)).reduce((sum, e) => sum + e.credits, 0),
    monthlyGrant: quote.monthlyGrant,
    included: cycle ? { remaining: sameCycle ? 150 - ai!.includedUsed - pending.length : 150 - pending.length, expiresAt: expiry!, cycleStart: cycle.start.toISOString() } : null,
    holds: [
      ...holds.map(h => { if (h.kind !== "invite" && h.kind !== "search") throw new Error(`未知舊預扣種類 / Unknown legacy hold: ${h.id}`); return { id: h.id, amount: h.amount, kind: h.kind as "invite" | "search", status: h.status as "reserved" | "captured", expiresAt: h.expiresAt.toISOString(), origin: "legacy_token" as const, lotExpiresAt: null }; }),
      ...usages.map(u => { if (!["included", "reward", "bonus"].includes(u.source)) throw new Error(`未知舊 AI 來源 / Unknown legacy AI source: ${u.id}`); return { id: `ai:${u.id}`, amount: 1, kind: "ai" as const, status: "reserved" as const, expiresAt: u.expiresAt.toISOString(), origin: (u.source === "bonus" ? "purchased" : u.source) as "purchased" | "included" | "reward", lotExpiresAt: u.source === "included" ? (u.cycleStart?.getTime() === cycle?.start.getTime() ? expiry : ai?.cycleEnd?.toISOString() ?? now.toISOString()) : null }; }),
    ] };
}
export async function trialConversion(tx: Prisma.TransactionClient, userId: string, now = new Date()) {
  const snapshot = await legacySnapshot(tx, userId, now);
  try { return convertLegacy(snapshot, now); }
  catch (error) { throw new MemberError(error instanceof Error ? error.message : String(error), 409); }
}
