import "server-only";
import type { Prisma } from "@prisma/client";
import { canonical, walletSchema, type CreditWallet } from "./policy";
export type DB = Prisma.TransactionClient;
export type CreditAccountRow = { id: string; status: string; version: number; activationSequence: number | null; sourceHash: string; source: { quote: { monthlyGrant: number; inviteFee: number; searchFee: number; monthlyCompanies: number; dailyInvites: number }; [key: string]: unknown }; importedCycle: Date | null; legacyMonthlyGrant: bigint; earned: bigint; referralDebt: bigint; createdAt: Date; activatedAt: Date | null };
export async function accountFor(tx: DB, uid: string) {
  return (await tx.$queryRaw<CreditAccountRow[]>`SELECT a.* FROM "CreditAccount" a JOIN "CreditAuthority" p ON p."accountId"=a.id WHERE p."userId"=${uid}`)[0] ?? null;
}
// shortcut: reconstruct full receipts per member; use incremental reads when measured ledger volume causes latency.
export async function readWallet(tx: DB, account: CreditAccountRow): Promise<CreditWallet> {
  const id = account.id;
  const [lots, holds, allocations, events] = await Promise.all([
    tx.$queryRaw<{ key: string; origin: string; remaining: bigint; expiresAt: Date | null }[]>`SELECT * FROM "CreditLot" WHERE "accountId"=${id} ORDER BY ordinal`,
    tx.$queryRaw<{ key: string; amount: bigint; kind: string; status: string; expiresAt: Date }[]>`SELECT * FROM "CreditHold" WHERE "accountId"=${id} ORDER BY key`,
    tx.$queryRaw<{ holdKey: string; lotKey: string; amount: bigint }[]>`SELECT * FROM "CreditAllocation" WHERE "accountId"=${id} ORDER BY "holdKey",position`,
    tx.$queryRaw<{ key: string; content: string; kind: string; reason: string; at: Date; availableDelta: bigint; reservedDelta: bigint; earnedDelta: bigint; debtDelta: bigint }[]>`SELECT * FROM "CreditEntry" WHERE "accountId"=${id} ORDER BY sequence`,
  ]);
  return walletSchema.parse({ version: 1, migratedAt: (account.activatedAt ?? account.createdAt).toISOString(), importedCycle: account.importedCycle?.toISOString() ?? null, legacyMonthlyGrant: Number(account.legacyMonthlyGrant), earned: Number(account.earned), referralDebt: Number(account.referralDebt), lots: lots.map(l => ({ id: l.key, origin: l.origin, remaining: Number(l.remaining), expiresAt: l.expiresAt?.toISOString() ?? null })), holds: Object.fromEntries(holds.map(h => [h.key, { amount: Number(h.amount), kind: h.kind, status: h.status, expiresAt: h.expiresAt.toISOString(), allocations: allocations.filter(a => a.holdKey === h.key).map(a => ({ lotId: a.lotKey, amount: Number(a.amount) })) }])), events: events.map(e => ({ key: e.key, content: e.content, kind: e.kind, reason: e.reason, at: e.at.toISOString(), availableDelta: Number(e.availableDelta), reservedDelta: Number(e.reservedDelta), earnedDelta: Number(e.earnedDelta), debtDelta: Number(e.debtDelta) })) });
}
export async function saveWallet(tx: DB, account: CreditAccountRow, before: CreditWallet, after: CreditWallet) {
  walletSchema.parse(after);
  if (canonical(before.events) !== canonical(after.events.slice(0, before.events.length))) throw new Error("不得修改點數收據 / Credits receipts are immutable");
  const id = account.id;
  for (let i = 0; i < after.lots.length; i++) {
    const l = after.lots[i], old = before.lots.find(b => b.id === l.id);
    if (old) {
      if (old.origin !== l.origin || old.expiresAt !== l.expiresAt) throw new Error("不得修改來源期限 / Credits source terms are immutable");
      if (old.remaining !== l.remaining) await tx.$executeRaw`UPDATE "CreditLot" SET remaining=${BigInt(l.remaining)} WHERE "accountId"=${id} AND key=${l.id}`;
    } else await tx.$executeRaw`INSERT INTO "CreditLot"("accountId",key,ordinal,origin,remaining,"expiresAt") VALUES(${id},${l.id},${i + 1},${l.origin},${BigInt(l.remaining)},${l.expiresAt ? new Date(l.expiresAt) : null})`;
  }
  if (after.lots.length < before.lots.length || Object.keys(after.holds).length < Object.keys(before.holds).length) throw new Error("不得移除帳務來源 / Credits sources cannot be removed");
  for (const [key, h] of Object.entries(after.holds)) {
    const old = before.holds[key];
    if (old) {
      if (canonical({ ...old, status: h.status }) !== canonical(h)) throw new Error("不得修改預扣內容 / Credits hold content is immutable");
      if (old.status !== h.status) await tx.$executeRaw`UPDATE "CreditHold" SET status=${h.status} WHERE "accountId"=${id} AND key=${key}`;
    } else {
      await tx.$executeRaw`INSERT INTO "CreditHold"("accountId",key,amount,kind,status,"expiresAt") VALUES(${id},${key},${BigInt(h.amount)},${h.kind},${h.status},${new Date(h.expiresAt)})`;
      for (let i = 0; i < h.allocations.length; i++) { const a = h.allocations[i]; await tx.$executeRaw`INSERT INTO "CreditAllocation"("accountId","holdKey","lotKey",position,amount) VALUES(${id},${key},${a.lotId},${i + 1},${BigInt(a.amount)})`; }
    }
  }
  for (let i = before.events.length; i < after.events.length; i++) {
    const e = after.events[i];
    await tx.$executeRaw`INSERT INTO "CreditEntry"("accountId",key,sequence,content,kind,reason,at,"availableDelta","reservedDelta","earnedDelta","debtDelta") VALUES(${id},${e.key},${i + 1},${e.content},${e.kind},${e.reason},${new Date(e.at)},${BigInt(e.availableDelta)},${BigInt(e.reservedDelta)},${BigInt(e.earnedDelta)},${BigInt(e.debtDelta)})`;
  }
  await tx.$executeRaw`UPDATE "CreditAccount" SET version=${after.events.length},earned=${BigInt(after.earned)},"referralDebt"=${BigInt(after.referralDebt)},"updatedAt"=now() WHERE id=${id} AND version=${account.version}`;
}
