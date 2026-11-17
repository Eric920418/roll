import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MemberError } from "@/lib/member-http";
import { networkAccount } from "@/lib/network/access";
import { allowanceCycleFor } from "@/lib/ai/allowance";
import { toPlanKey } from "@/lib/billing/plans";
import { creditsEnabledFor } from "./authority";
import { accountFor, readWallet, saveWallet } from "./storage";
import { importPendingAi } from "./conversion";
import { expire, grant, settle, summary, units, type CreditWallet } from "./policy";
export async function withCreditWallet<T>(tx: Prisma.TransactionClient, userId: string, work: (wallet: CreditWallet) => T, now = new Date()) {
  if (!await creditsEnabledFor(tx, userId)) throw new MemberError("會員點數帳本尚未切換 / Member Credits ledger is not active", 409);
  const account = (await accountFor(tx, userId))!;
  const wallet = await readWallet(tx, account), before = JSON.parse(JSON.stringify(wallet)) as CreditWallet;
  expire(wallet, now);
  for (const id of importPendingAi(wallet, now)) {
    settle(wallet, id, "refund", "AI 處理逾期，退回點數 / AI processing expired; Credits returned", now, true);
    await tx.aiUsage.updateMany({ where: { id: id.slice(3), userId, status: "pending" }, data: { status: "failed", completedAt: now } });
  }
  let result: T;
  try { result = work(wallet); } catch (error) { throw new MemberError(error instanceof Error ? error.message : String(error), 409); }
  await saveWallet(tx, account, before, wallet);
  return result;
}
export async function grantCredit(tx: Prisma.TransactionClient, userId: string, input: Parameters<typeof grant>[1]) {
  return withCreditWallet(tx, userId, wallet => grant(wallet, input));
}
export async function refreshCreditGrants(tx: Prisma.TransactionClient, userId: string) {
  const now = new Date(), account = await networkAccount(userId, tx);
  const cycle = await allowanceCycleFor({ ...account, plan: toPlanKey(account.plan), trialPlan: account.trialPlan ? toPlanKey(account.trialPlan) : null }, now, tx);
  const { memberTokenQuote } = await import("./pricing");
  const quote = await memberTokenQuote(tx, userId);
  const period = now.toISOString().slice(0, 7);
  const priorMonthly = await tx.tokenLedger.findUnique({ where: { eventKey: `monthly:${userId}:${period}` } });
  return withCreditWallet(tx, userId, wallet => {
    if (account.effectivePlan !== "free" && !priorMonthly) grant(wallet, { key: `monthly:${period}`, amount: Math.max(wallet.legacyMonthlyGrant, units(quote.monthlyGrant)), origin: "monthly", reason: "原方案月贈點數（可累積） / Legacy monthly Credits (roll over)" }, now);
    if (cycle) {
      const cycleKey = `included:${cycle.start.toISOString()}`;
      if (wallet.importedCycle !== cycle.start.toISOString()) grant(wallet, { key: cycleKey, amount: units(150), origin: "included", expiresAt: cycle.end.toISOString(), reason: "原方案 AI 週期額度 / Original plan AI cycle allowance" }, now);
    }
  }, now);
}
export async function creditSnapshot(userId: string) {
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    await refreshCreditGrants(tx, userId);
    return withCreditWallet(tx, userId, wallet => ({ ...summary(wallet), ledger: wallet.events.slice().reverse().map(e => ({ id: e.key, kind: e.kind, reason: e.reason, availableDelta: e.availableDelta / 100, reservedDelta: e.reservedDelta / 100, createdAt: e.at })) }));
  }, { timeout: 15000 });
}
