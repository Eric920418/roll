import { networkEnabled } from "@/lib/network/policy";
import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PlanWriteError } from "@/lib/action-plan/service";
import { createFounderPayment, captureFounderPayment, getOrder, getFounderCapture, isPaypalConfigured, type PaypalOrder } from "@/lib/billing/paypal";
import { discoveryAccount, discoveryPaid, discoveryRows } from "./service";
import { DISCOVERY_POLICY, discoveryEvidence, FOUNDER_SEATS, founderAccessEndsAt, TRIAL_INTERVIEWS } from "./policy";
import { verifiedFounderCapture } from "./founder-policy";

const HOLD_MS = 20 * 60_000, CAPTURE_LEASE_MS = 60_000;
async function lockSeats(tx: Prisma.TransactionClient) { await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('nova-founder-v1'))::text`; }
export async function founderOfferSnapshot(userId?: string) {
  const now = new Date();
  const occupied = await prisma.founderOrder.count({ where: { seat: { not: null }, OR: [{ status: { in: ["paid", "capturing", "refunded", "review"] } }, { status: "reserved", reservedUntil: { gt: now } }] } });
  let configured = false; try { configured = isPaypalConfigured(); } catch { /* No payment CTA until environment is configured. */ }
  const own = userId ? await prisma.founderOrder.findFirst({ where: { userId, seat: { not: null }, OR: [{ status: "capturing" }, { status: "reserved", reservedUntil: { gt: now } }] }, orderBy: { createdAt: "desc" }, select: { paypalOrderId: true, status: true } }) : null;
  return { pending: own ? { orderId: own.paypalOrderId, confirming: own.status === "capturing" } : null, enabled: !networkEnabled() && process.env.FOUNDER_OFFER_ENABLED === "true" && configured, remaining: Math.max(0, FOUNDER_SEATS - occupied), capacity: FOUNDER_SEATS };
}
export async function reserveFounderOrder(userId: string, requestId: string) {
  if (networkEnabled()) throw new PlanWriteError("創始優惠已停止新購，請選擇 SPARK 或 NOVA / Founding offer closed; choose SPARK or NOVA", 409);
  if (!(await founderOfferSnapshot()).enabled) throw new PlanWriteError("創始年費結帳尚未開放 / Founding checkout is not available yet", 503);
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient; await lockSeats(tx);
    const account = await discoveryAccount(userId, tx);
    if (account?.trialPolicy !== DISCOVERY_POLICY) throw new PlanWriteError("此優惠適用新訪談試用會員 / This offer is for new discovery-trial members", 403);
    if (discoveryPaid(account)) throw new PlanWriteError("目前已有有效付費權益，請勿重複付款 / Paid access is already active; do not pay twice", 409);
    const journey = await tx.discoveryJourney.findUnique({ where: { userId } });
    if (!journey || discoveryEvidence(journey.id, await discoveryRows(userId, journey.id, tx)).length < TRIAL_INTERVIEWS) throw new PlanWriteError("先完成三次試用訪談，再決定是否升級 / Complete three trial interviews before deciding to upgrade", 409);
    const duplicate = await tx.founderOrder.findUnique({ where: { requestId } });
    if (duplicate && duplicate.userId !== userId) throw new PlanWriteError("結帳請求不屬於此會員 / Checkout request belongs to another member", 409);
    await tx.founderOrder.updateMany({ where: { status: "reserved", reservedUntil: { lte: new Date() } }, data: { status: "expired", seat: null } });
    const current = await tx.founderOrder.findFirst({ where: { userId, status: { in: ["reserved", "capturing"] }, seat: { not: null } }, orderBy: { createdAt: "desc" } });
    if (current) return current;
    if (duplicate) throw new PlanWriteError("這次結帳已過期，請重新建立 / Checkout expired; start a new request", 409);
    const seats = new Set((await tx.founderOrder.findMany({ where: { seat: { not: null } }, select: { seat: true } })).map(row => row.seat));
    const seat = Array.from({ length: FOUNDER_SEATS }, (_, i) => i + 1).find(value => !seats.has(value));
    if (!seat) throw new PlanWriteError("十位創始會員名額已額滿，尚未收費 / Founding seats are full; no payment taken", 409);
    return tx.founderOrder.create({ data: { userId, requestId, seat, reservedUntil: new Date(Date.now() + HOLD_MS) } });
  });
}
export async function createFounderCheckout(userId: string, requestId: string, returnUrl: string, cancelUrl: string) {
  const local = await reserveFounderOrder(userId, requestId);
  if (local.status === "capturing") throw new PlanWriteError("付款確認中，請回到付款結果頁重試 / Payment confirmation in progress; retry the result page", 409);
  const remote = local.paypalOrderId ? await getOrder(local.paypalOrderId) : await createFounderPayment({ localOrderId: local.id, returnUrl, cancelUrl });
  const approveUrl = remote.links?.find(link => link.rel === "approve" || link.rel === "payer-action")?.href;
  if (!approveUrl) throw new PlanWriteError("付款已處理或需重新確認，請回到付款結果頁 / Payment processed or needs confirmation; use the result page", 409);
  const url = new URL(approveUrl); if (url.protocol !== "https:" || !["www.paypal.com", "www.sandbox.paypal.com"].includes(url.hostname)) throw new Error("Unexpected payment approval destination");
  const changed = await prisma.founderOrder.updateMany({ where: { id: local.id, userId, status: "reserved", reservedUntil: { gt: new Date() }, seat: { not: null } }, data: { paypalOrderId: remote.id } });
  if (!changed.count) throw new PlanWriteError("暫留名額已過期，尚未收費，請重試 / Seat hold expired; no payment taken. Retry", 409);
  return { approveUrl, orderId: remote.id, reservedUntil: local.reservedUntil.toISOString() };
}
export async function fulfillFounderOrder(order: PaypalOrder) {
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient; await lockSeats(tx);
    const local = await tx.founderOrder.findUnique({ where: { paypalOrderId: order.id } });
    if (!local || !local.userId) throw new PlanWriteError("找不到付款會員，請聯絡客服核對 / Payment account missing; contact support", 409);
    let capture; try { capture = verifiedFounderCapture(order, local.id); } catch (error) { throw new PlanWriteError((error as Error).message, 409); }
    if (local.status === "paid") return { added: false, accessEndsAt: local.accessEndsAt!.toISOString() };
    if (local.status === "refunded") return { added: false, revoked: true, accessEndsAt: local.accessEndsAt!.toISOString() };
    if (!local.seat || !["reserved", "capturing"].includes(local.status)) throw new PlanWriteError("付款需要人工核對，請勿再次付款 / Payment requires review; do not pay again", 409);
    const timestamp = capture.create_time ? new Date(capture.create_time) : new Date();
    if (!Number.isFinite(timestamp.getTime())) throw new PlanWriteError("付款日期無效，請聯絡客服 / Invalid payment date; contact support", 409);
    const endsAt = founderAccessEndsAt(timestamp);
    await tx.founderOrder.update({ where: { id: local.id }, data: { status: "paid", paypalCaptureId: capture.id, paidAt: timestamp, accessEndsAt: endsAt, captureToken: null, captureExpiresAt: null } });
    await tx.user.update({ where: { id: local.userId }, data: { founderStartedAt: timestamp, founderEndsAt: endsAt } });
    return { added: true, accessEndsAt: endsAt.toISOString() };
  });
}
export async function confirmFounderPayment(userId: string, orderId: string) {
  const token = randomUUID();
  const local = await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient; await lockSeats(tx);
    const row = await tx.founderOrder.findUnique({ where: { paypalOrderId: orderId } });
    if (!row || row.userId !== userId) throw new PlanWriteError("找不到此會員的付款訂單 / Payment order not found", 404);
    if (row.status === "paid") return row;
    if (row.status === "capturing" && row.captureExpiresAt && row.captureExpiresAt > new Date()) throw new PlanWriteError("付款確認中，請稍後重試；請勿重新付款 / Payment confirmation in progress; retry shortly. Do not pay again", 409);
    if ((row.status === "reserved" && row.reservedUntil <= new Date()) || !row.seat || !["reserved", "capturing"].includes(row.status)) throw new PlanWriteError("結帳已結束，請查看帳號付款狀態；勿重複付款 / Checkout closed; check your billing status. Do not pay again", 409);
    return tx.founderOrder.update({ where: { id: row.id }, data: { status: "capturing", captureToken: token, captureExpiresAt: new Date(Date.now() + CAPTURE_LEASE_MS) } });
  });
  if (local.status === "paid") return { added: false, accessEndsAt: local.accessEndsAt!.toISOString() };
  // Keep uncertain captures reserved; stable provider keys make retry safe after a timeout.
  const remote = await getOrder(orderId);
  if (["CREATED", "PAYER_ACTION_REQUIRED"].includes(remote.status)) {
    await prisma.founderOrder.updateMany({ where: { id: local.id, status: "capturing", captureToken: token }, data: { status: "reserved", captureToken: null, captureExpiresAt: null } });
    throw new PlanWriteError("請先在 PayPal 確認付款 / Approve the payment on PayPal first", 409);
  }
  return fulfillFounderOrder(remote.status === "COMPLETED" ? remote : await captureFounderPayment(orderId, local.id));
}

export async function revokeFounderCapture(captureId: string, reversed = false) {
  const local = await prisma.founderOrder.findUnique({ where: { paypalCaptureId: captureId } });
  if (!local) return;
  const remote = await getFounderCapture(captureId);
  if (remote.id !== captureId || (!reversed && remote.status !== "REFUNDED")) return;
  await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient; await lockSeats(tx);
    const row = await tx.founderOrder.findUnique({ where: { id: local.id } });
    if (!row || row.status !== "paid") return;
    await tx.founderOrder.update({ where: { id: row.id }, data: { status: "refunded", revokedAt: new Date() } });
    if (row.userId) await tx.user.updateMany({ where: { id: row.userId, founderStartedAt: row.paidAt, founderEndsAt: row.accessEndsAt }, data: { founderEndsAt: new Date() } });
  });
}

/** Recover only previously initiated confirmations; never create an order or charge an unapproved payer. */
export async function reconcileFounderPayments() {
  const rows = await prisma.founderOrder.findMany({ where: { status: "capturing", paypalOrderId: { not: null }, OR: [{ captureExpiresAt: null }, { captureExpiresAt: { lte: new Date() } }] }, take: 5, orderBy: { updatedAt: "asc" } });
  const result = { checked: 0, recovered: 0, closed: 0, pending: 0, failed: 0, refundsChecked: 0 };
  for (const row of rows) {
    result.checked++;
    try {
      if (!row.userId) { result.pending++; continue; }
      const remote = await getOrder(row.paypalOrderId!);
      if (remote.status === "VOIDED") {
        await prisma.$transaction(async raw => { const tx = raw as unknown as Prisma.TransactionClient; await lockSeats(tx); const changed = await tx.founderOrder.updateMany({ where: { id: row.id, status: "capturing", captureToken: row.captureToken, captureExpiresAt: row.captureExpiresAt }, data: { status: "expired", seat: null, captureToken: null, captureExpiresAt: null } }); result.closed += changed.count; });
      } else if (remote.status === "COMPLETED") { await fulfillFounderOrder(remote); result.recovered++; }
      else if (remote.status === "APPROVED") { await confirmFounderPayment(row.userId, row.paypalOrderId!); result.recovered++; }
      else result.pending++;
    } catch { result.failed++; /* Keep the occupied seat when the provider's result is uncertain. */ }
  }
  const paid = await prisma.founderOrder.findMany({ where: { status: "paid", paypalCaptureId: { not: null }, OR: [{ paymentCheckedAt: null }, { paymentCheckedAt: { lte: new Date(Date.now() - 86_400_000) } }] }, take: 5, orderBy: { paymentCheckedAt: "asc" } });
  for (const row of paid) {
    try {
      const capture = await getFounderCapture(row.paypalCaptureId!); result.refundsChecked++;
      if (capture.id !== row.paypalCaptureId) throw new Error("Capture reference mismatch");
      if (capture.status === "REFUNDED") await revokeFounderCapture(row.paypalCaptureId!);
      await prisma.founderOrder.updateMany({ where: { id: row.id }, data: { paymentCheckedAt: new Date() } });
    } catch { result.failed++; }
  }
  if (result.failed || result.pending) console.warn({ event: "founder_payment.reconciliation_attention", ...result });
  return result;
}
