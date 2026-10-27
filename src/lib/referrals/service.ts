import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rewardTransaction } from "@/lib/rewards/service";
import { logSecurityError } from "@/lib/security/log";
import { REFERRAL_RULES as rules, ReferralError, referralMonth, grantAmounts, revokeAmounts } from "./policy";
import { collectPayments, refreshDeletedPayment, payerFingerprint, type PaymentProof } from "./payments";
import { requireReferralConfig } from "./registration";
const lock = (tx: Prisma.TransactionClient) => tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('nova-referrals-v1'))::text`;

async function revoke(tx: Prisma.TransactionClient, id: string, reason = "payment_refunded") {
  const grants = await tx.referralEntry.findMany({ where: { referralId: id, kind: "grant" }, orderBy: { accountId: "asc" } });
  for (const grant of grants) {
    if (await tx.referralEntry.findUnique({ where: { referralId_accountId_kind: { referralId: id, accountId: grant.accountId, kind: "revoke" } } })) continue;
    const account = await tx.referralAccount.findUniqueOrThrow({ where: { id: grant.accountId } });
    const allowance = account.userId ? await tx.aiAllowance.findUnique({ where: { userId: account.userId } }) : null;
    const amounts = revokeAmounts(allowance?.rewardBalance ?? 0, grant);
    if (account.userId && amounts.removed) await tx.aiAllowance.update({ where: { userId: account.userId }, data: { rewardBalance: { decrement: amounts.removed } } });
    await tx.referralAccount.update({ where: { id: account.id }, data: { debt: { increment: amounts.debt } } });
    await tx.referralEntry.create({ data: { referralId: id, accountId: account.id, kind: "revoke", credits: -amounts.removed, debtDelta: amounts.debt } });
  }
  await tx.referral.update({ where: { id }, data: { status: "revoked", reason, errorRequestId: null, revision: { increment: 1 } } });
}
async function recordProof(tx: Prisma.TransactionClient, proof: PaymentProof, userId: string | null, now: Date) {
  const existing = await tx.referralPayment.findUnique({ where: { key: proof.key } });
  if (existing?.userId && existing.userId !== userId) throw new Error("Referral payment belongs to another member");
  if (existing?.paidAt && (existing.paidAt.getTime() !== proof.paidAt.getTime() || existing.amountMinor !== proof.amountMinor || existing.currency !== proof.currency)) throw new Error("Referral payment authority changed; review required");
  if (existing?.payerHash && proof.payerHash && existing.payerHash !== proof.payerHash) throw new Error("PayPal payer identity changed; review required");
  const data = { ...proof, userId, checkedAt: now, payerHash: existing?.payerHash ?? proof.payerHash, status: existing?.status === "refunded" ? "refunded" : proof.status };
  await tx.referralPayment.upsert({ where: { key: proof.key }, create: data, update: data });
}
async function settle(tx: Prisma.TransactionClient, id: string, now: Date) {
  let row = await tx.referral.findUniqueOrThrow({ where: { id }, include: { inviter: true } });
  if (["rejected", "revoked"].includes(row.status)) return;
  const granted = row.grantedAt !== null;
  const mark = (data: Prisma.ReferralUpdateInput) => tx.referral.update({ where: { id }, data: { errorRequestId: null, ...data, revision: { increment: 1 } } });
  // Keep the original first transaction even after a refund; later purchases cannot requalify it.
  const first = row.inviteeId ? await tx.referralPayment.findFirst({ where: { userId: row.inviteeId, paidAt: { not: null } }, orderBy: [{ paidAt: "asc" }, { key: "asc" }] }) : row.paymentKey ? await tx.referralPayment.findUnique({ where: { key: row.paymentKey } }) : null;
  if (!granted && (!row.inviteeId || !row.inviter.userId)) { await mark({ status: "rejected", reason: "deleted_member" }); return; }
  if (!first || !first.paidAt) { if (!granted) await mark({ status: "pending_payment", reason: null }); return; }
  if (first.status === "refunded") { if (granted) await revoke(tx, id); else await mark({ status: "revoked", reason: "payment_refunded", paymentKey: first.key, paidAt: first.paidAt }); return; }
  if (first.status !== "completed") { await mark({ status: "review", reason: "payment_review", paymentKey: first.key, paidAt: first.paidAt }); return; }
  const payerHash = first.payerHash;
  if (!payerHash) { await mark({ status: "review", reason: "missing_payer", paymentKey: first.key, paidAt: first.paidAt }); return; }
  const knownSelf = row.inviter.userId && await tx.referralPayment.findFirst({ where: { userId: row.inviter.userId, payerHash }, select: { key: true } });
  if (knownSelf && granted) { await revoke(tx, id, "self_referral"); return; }
  if (knownSelf) { await mark({ status: "rejected", reason: "self_referral", paymentKey: first.key, paidAt: first.paidAt }); return; }
  const duplicate = await tx.referral.findFirst({ where: { payerHash, id: { not: id } }, select: { id: true } });
  if (duplicate && granted) { await revoke(tx, id, "duplicate_payer"); return; }
  if (duplicate) { await mark({ status: "rejected", reason: "duplicate_payer", paymentKey: first.key, paidAt: first.paidAt }); return; }
  const monthKey = referralMonth(first.paidAt);
  const occupied = new Set((await tx.referral.findMany({ where: { inviterId: row.inviterId, monthKey, slot: { not: null }, id: { not: id } }, select: { slot: true } })).map(value => value.slot));
  const slot = row.monthKey === monthKey && row.slot ? row.slot : Array.from({ length: rules.monthlyLimit }, (_, i) => i + 1).find(value => !occupied.has(value));
  if (!slot && granted) { await revoke(tx, id, "monthly_limit"); return; }
  if (!slot) { await mark({ status: "rejected", reason: "monthly_limit", paymentKey: first.key, paidAt: first.paidAt, monthKey }); return; }
  const eligibleAt = new Date(first.paidAt.getTime() + rules.waitDays * 86400000);
  row = { ...row, ...await mark({ status: granted ? "granted" : "pending", reason: null, payerHash, paymentKey: first.key, paidAt: first.paidAt, eligibleAt, monthKey, slot }) };
  if (granted || now < eligibleAt) return;
  const inviteeAccount = await tx.referralAccount.upsert({ where: { userId: row.inviteeId! }, create: { userId: row.inviteeId!, code: randomBytes(6).toString("hex").toUpperCase() }, update: {} });
  for (const accountId of [row.inviterId, inviteeAccount.id].sort()) {
    const account = await tx.referralAccount.findUniqueOrThrow({ where: { id: accountId } });
    const amounts = grantAmounts(account.debt);
    await tx.referralAccount.update({ where: { id: accountId }, data: { debt: amounts.debt } });
    await tx.aiAllowance.upsert({ where: { userId: account.userId! }, create: { userId: account.userId!, rewardBalance: amounts.credits }, update: { rewardBalance: { increment: amounts.credits } } });
    await tx.referralEntry.create({ data: { referralId: id, accountId, kind: "grant", credits: amounts.credits, offset: amounts.offset, debtDelta: -amounts.offset } });
  }
  await mark({ status: "granted", grantedAt: now, reason: null });
}

/** Proofs come only from server-side PayPal reads, never member input. */
export async function settleReferral(id: string, payments: PaymentProof[], inviterPayments: PaymentProof[], now = new Date()) {
  return rewardTransaction(async tx => {
    await lock(tx);
    const row = await tx.referral.findUniqueOrThrow({ where: { id }, include: { inviter: true } });
    for (const proof of payments) await recordProof(tx, proof, row.inviteeId, now);
    for (const proof of inviterPayments) await recordProof(tx, proof, row.inviter.userId, now);
    await settle(tx, id, now);
    await tx.referral.update({ where: { id }, data: { checkedAt: now } });
  });
}
export async function reconcileReferral(id: string, now = new Date()) {
  requireReferralConfig();
  const row = await prisma.referral.findUnique({ where: { id }, include: { inviter: true } });
  if (!row || ["rejected", "revoked"].includes(row.status)) return;
  if (!row.grantedAt && (!row.inviteeId || !row.inviter.userId)) return settleReferral(id, [], [], now);
  let payments: PaymentProof[], inviterPayments: PaymentProof[];
  try {
    payments = row.inviteeId ? await collectPayments(row.inviteeId, now) : row.paymentKey ? [await refreshDeletedPayment(await prisma.referralPayment.findUniqueOrThrow({ where: { key: row.paymentKey } }), now)] : [];
    inviterPayments = row.inviter.userId ? await collectPayments(row.inviter.userId, now) : [];
  } catch (error) {
    const requestId = logSecurityError("referral.verification_unavailable", error);
    await prisma.referral.updateMany({ where: { id, status: { in: ["pending_payment", "pending", "review", "granted"] } }, data: { status: "review", reason: "payment_unavailable", errorRequestId: requestId, checkedAt: now, revision: { increment: 1 } } });
    throw error;
  }
  await settleReferral(id, payments, inviterPayments, now);
}
export async function syncUserReferral(userId: string) {
  if (!process.env.REFERRAL_PAYER_HMAC_KEY) return;
  const row = await prisma.referral.findUnique({ where: { inviteeId: userId }, select: { id: true } });
  if (row) await reconcileReferral(row.id);
}
export async function trySyncUserReferral(userId: string) {
  try { await syncUserReferral(userId); } catch (error) { logSecurityError("referral.payment_sync_pending", error); }
}
/** Called only after webhook signature verification. Sticky tombstones beat stale completion reads. */
export async function recordReferralRefund(key: string) {
  if (!process.env.REFERRAL_PAYER_HMAC_KEY) return;
  if (!/^(capture|sale):[A-Za-z0-9_-]+$/.test(key)) throw new Error("Invalid refund transaction reference");
  await rewardTransaction(async tx => {
    await lock(tx);
    await tx.referralPayment.upsert({ where: { key }, create: { key, status: "refunded" }, update: { status: "refunded", checkedAt: new Date() } });
    const row = await tx.referral.findUnique({ where: { paymentKey: key } });
    if (row && !["revoked", "rejected"].includes(row.status)) {
      if (row.grantedAt) await revoke(tx, row.id);
      else await tx.referral.update({ where: { id: row.id }, data: { status: "revoked", reason: "payment_refunded", errorRequestId: null, revision: { increment: 1 } } });
    }
  });
}
export async function runReferralReconciliation(now = new Date()) {
  requireReferralConfig();
  const due = { OR: [{ checkedAt: null }, { checkedAt: { lte: new Date(now.getTime() - 15 * 60000) } }] };
  const order = [{ checkedAt: { sort: "asc" as const, nulls: "first" as const } }, { id: "asc" as const }];
  // Unpaid signups must not starve due grants or refund checks.
  const batches = await Promise.all([
    prisma.referral.findMany({ where: { ...due, status: "pending", eligibleAt: { lte: now } }, orderBy: order, take: 5, select: { id: true } }),
    prisma.referral.findMany({ where: { ...due, status: "granted" }, orderBy: order, take: 2, select: { id: true } }),
    prisma.referral.findMany({ where: { ...due, status: "review" }, orderBy: order, take: 1, select: { id: true } }),
    prisma.referral.findMany({ where: { ...due, status: "pending_payment" }, orderBy: order, take: 1, select: { id: true } }),
    prisma.referral.findMany({ where: { ...due, status: "pending", eligibleAt: { gt: now } }, orderBy: order, take: 1, select: { id: true } }),
  ]);
  const rows = batches.flat();
  const result = { checked: 0, failed: 0 };
  const started = Date.now();
  for (const row of rows) {
    if (Date.now() - started > 230_000) break;
    try { await reconcileReferral(row.id, now); result.checked++; }
    catch (error) { result.failed++; logSecurityError("referral.reconciliation_pending", error); await prisma.referral.update({ where: { id: row.id }, data: { checkedAt: now } }); }
  }
  return result;
}
export async function reviewReferral(input: { id: string; revision: number; decision: "approve" | "reject"; note: string; payerId?: string }, admin: string) {
  const original = await prisma.referral.findUnique({ where: { id: input.id }, include: { inviter: true } });
  if (!original) throw new ReferralError("找不到邀請紀錄 / Referral not found", 404, "not_found");
  if (original.status !== "review" || original.revision !== input.revision) throw new ReferralError("內容已更新，請重新載入比對 / Content changed; reload and compare", 409, "version_conflict");
  let payments: PaymentProof[] = [], inviterPayments: PaymentProof[] = [];
  if (input.decision === "approve") {
    if (!original.inviteeId || !original.inviter.userId) throw new ReferralError("會員已刪除 / Member account deleted", 409, "deleted_member");
    try { [payments, inviterPayments] = await Promise.all([collectPayments(original.inviteeId), collectPayments(original.inviter.userId)]); }
    catch { throw new ReferralError("付款來源暫時無法核對，尚未發放，請重試 / Payment verification unavailable; no reward released. Retry", 503, "payment_unavailable"); }
  }
  return rewardTransaction(async tx => {
    await lock(tx);
    const row = await tx.referral.findUniqueOrThrow({ where: { id: input.id } });
    if (row.status !== "review" || row.revision !== input.revision) throw new ReferralError("內容已更新，請重新載入比對 / Content changed; reload and compare", 409, "version_conflict");
    if (input.decision === "reject" && row.grantedAt) {
      await revoke(tx, row.id, "admin_rejected");
      return tx.referral.update({ where: { id: row.id }, data: { reviewNote: input.note, reviewedBy: admin, reviewedAt: new Date() } });
    }
    if (input.decision === "reject") return tx.referral.update({ where: { id: row.id }, data: { status: "rejected", reason: "admin_rejected", reviewNote: input.note, reviewedBy: admin, reviewedAt: new Date(), revision: { increment: 1 } } });
    const now = new Date();
    for (const proof of payments) await recordProof(tx, proof, original.inviteeId, now);
    for (const proof of inviterPayments) await recordProof(tx, proof, original.inviter.userId, now);
    const payment = await tx.referralPayment.findFirst({ where: { userId: original.inviteeId, paidAt: { not: null } }, orderBy: [{ paidAt: "asc" }, { key: "asc" }] });
    if (!payment || payment.status !== "completed" || !payments.some(proof => proof.key === payment.key && proof.status === "completed") || !input.payerId) throw new ReferralError("需已核對的有效付款及付款身分，不能略過金額核對 / Verified payment and payer ID required; amount checks cannot be bypassed", 409, "payment_review");
    const hash = payerFingerprint(input.payerId);
    if (payment.payerHash && payment.payerHash !== hash) throw new ReferralError("付款身分與來源不符 / Payer identity does not match", 409, "payment_review");
    await tx.referralPayment.update({ where: { key: payment.key }, data: { payerHash: hash } });
    await tx.referral.update({ where: { id: row.id }, data: { reviewNote: input.note, reviewedBy: admin, reviewedAt: now } });
    await settle(tx, row.id, now);
  });
}
export async function prepareReferralDeletion(tx: Prisma.TransactionClient, userId: string) {
  await lock(tx);
  await tx.referral.updateMany({ where: { OR: [{ inviteeId: userId }, { inviter: { userId } }], grantedAt: null, status: { in: ["pending_payment", "pending", "review"] } }, data: { status: "rejected", reason: "deleted_member", errorRequestId: null, revision: { increment: 1 }, reviewNote: null } });
}
export async function referralSummary(userId: string, page: number) {
  const account = await prisma.referralAccount.findUnique({ where: { userId }, select: { id: true, code: true, debt: true } });
  const month = referralMonth(new Date());
  const [rows, used] = await Promise.all([
    prisma.referral.findMany({ where: { OR: [{ inviteeId: userId }, ...(account ? [{ inviterId: account.id }] : [])] }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 20, take: 21, select: { id: true, inviterId: true, status: true, reason: true, errorRequestId: true, eligibleAt: true, createdAt: true, entries: { where: { account: { userId } }, select: { kind: true, credits: true, offset: true, debtDelta: true, createdAt: true } } } }),
    account ? prisma.referral.count({ where: { inviterId: account.id, monthKey: month, slot: { not: null } } }) : Promise.resolve(0),
  ]);
  return { code: account?.code ?? null, debt: account?.debt ?? 0, rules, month, used, hasMore: rows.length > 20, rows: rows.slice(0, 20).map(row => ({ id: row.id, direction: row.inviterId === account?.id ? "sent" : "received", status: row.status, reason: row.reason, errorRequestId: row.errorRequestId, eligibleAt: row.eligibleAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), entries: row.entries.map(entry => ({ ...entry, createdAt: entry.createdAt.toISOString() })) })) };
}
export type ReferralSummary = Awaited<ReturnType<typeof referralSummary>>;
