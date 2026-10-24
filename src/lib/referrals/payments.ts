import "server-only";
import { createHmac } from "node:crypto";
import type { ReferralPayment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrder, getPaymentCapture, getSubscription, getSubscriptionTransactions } from "@/lib/billing/paypal";
import { requireReferralConfig } from "./registration";
import { amountMinor, ReferralError } from "./policy";
export type PaymentProof = { key: string; kind: string; orderId: string | null; subscriptionId: string | null; payerHash: string | null; amountMinor: number; currency: string; paidAt: Date; status: "completed" | "refunded" | "review" };
export function payerFingerprint(id: string) {
  if (!/^[A-Za-z0-9_-]{5,128}$/.test(id)) throw new ReferralError("付款身分需要核對 / Payer identity needs review", 409, "payment_review");
  return createHmac("sha256", requireReferralConfig()).update(`paypal:${id.toUpperCase()}`).digest("hex");
}
function paidDate(value: string | undefined) {
  const date = new Date(value ?? ""); if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 60_000) throw new Error("Invalid PayPal payment time"); return date;
}
function money(value: { currency_code?: string; value?: string } | undefined) {
  if (!value?.currency_code || !value.value) throw new Error("Missing PayPal payment amount");
  return { amountMinor: amountMinor(value.value), currency: value.currency_code };
}
export async function collectPayments(userId: string, now = new Date()): Promise<PaymentProof[]> {
  const [credits, founders, subscriptions] = await Promise.all([
    prisma.aiCreditPurchase.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.founderOrder.findMany({ where: { userId, paypalOrderId: { not: null } }, orderBy: { createdAt: "asc" } }),
    prisma.subscription.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);
  const proofs: PaymentProof[] = [];
  for (const local of [...credits.map(row => ({ orderId: row.paypalOrderId, customId: userId, amount: row.amountMinor, currency: row.currency, kind: "credits" })), ...founders.map(row => ({ orderId: row.paypalOrderId!, customId: row.id, amount: 34800, currency: "USD", kind: "founder" }))]) {
    const order = await getOrder(local.orderId);
    if (order.id !== local.orderId) throw new Error("PayPal order reference mismatch");
    if (order.status !== "COMPLETED") continue;
    if (order.purchase_units?.length !== 1 || order.purchase_units[0].custom_id !== local.customId) throw new Error("PayPal order ownership mismatch");
    const captures = order.purchase_units[0].payments?.captures ?? [];
    if (captures.length !== 1) throw new Error("PayPal capture count needs review");
    const capture = await getPaymentCapture(captures[0].id);
    if (capture.id !== captures[0].id) throw new Error("PayPal capture reference mismatch");
    const amount = money(capture.amount);
    const status = ["REFUNDED", "PARTIALLY_REFUNDED", "REVERSED"].includes(capture.status) ? "refunded" : capture.status === "COMPLETED" ? "completed" : "review";
    proofs.push({ key: `capture:${capture.id}`, kind: local.kind, orderId: local.orderId, subscriptionId: null, payerHash: order.payer?.payer_id ? payerFingerprint(order.payer.payer_id) : null, ...amount, paidAt: paidDate(capture.create_time ?? captures[0].create_time), status: amount.amountMinor === local.amount && amount.currency === local.currency ? status : "review" });
  }
  for (const local of subscriptions) {
    const remote = await getSubscription(local.paypalSubscriptionId);
    if (remote.id !== local.paypalSubscriptionId || remote.plan_id !== local.paypalPlanId) throw new Error("PayPal subscription ownership/plan mismatch");
    const transactions = await getSubscriptionTransactions(remote.id, new Date(local.createdAt.getTime() - 60_000), now);
    for (const transaction of transactions) {
      if (!['COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REVERSED'].includes(transaction.status)) continue;
      const amount = money(transaction.amount_with_breakdown?.gross_amount);
      const verified = local.amountMinor !== null && amount.amountMinor === local.amountMinor && amount.currency === local.currency;
      proofs.push({ key: `sale:${transaction.id}`, kind: "subscription", orderId: null, subscriptionId: remote.id, payerHash: remote.subscriber?.payer_id ? payerFingerprint(remote.subscriber.payer_id) : null, ...amount, paidAt: paidDate(transaction.time), status: !verified ? "review" : transaction.status === "COMPLETED" ? "completed" : "refunded" });
    }
  }
  return proofs.filter(proof => proof.amountMinor > 0).sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime() || a.key.localeCompare(b.key));
}
export async function refreshDeletedPayment(row: ReferralPayment, now = new Date()): Promise<PaymentProof> {
  if (!row.kind || !row.paidAt || row.amountMinor === null || !row.currency) throw new Error("Payment tombstone is incomplete");
  let status: string;
  if (row.key.startsWith("capture:")) {
    const remote = await getPaymentCapture(row.key.slice(8));
    if (remote.id !== row.key.slice(8)) throw new Error("Capture reference mismatch");
    const amount = money(remote.amount); if (amount.amountMinor !== row.amountMinor || amount.currency !== row.currency) throw new Error("Capture amount mismatch");
    status = remote.status;
  } else {
    if (!row.subscriptionId) throw new Error("Missing subscription reference");
    const transactions = await getSubscriptionTransactions(row.subscriptionId, new Date(row.paidAt.getTime() - 86400000), new Date(Math.min(now.getTime(), row.paidAt.getTime() + 86400000)));
    const transaction = transactions.find(value => `sale:${value.id}` === row.key);
    if (!transaction) throw new Error("Subscription transaction not found");
    const amount = money(transaction.amount_with_breakdown?.gross_amount); if (amount.amountMinor !== row.amountMinor || amount.currency !== row.currency) throw new Error("Sale amount mismatch");
    status = transaction.status;
  }
  return { key: row.key, kind: row.kind, orderId: row.orderId, subscriptionId: row.subscriptionId, payerHash: row.payerHash, amountMinor: row.amountMinor, currency: row.currency, paidAt: row.paidAt, status: ['REFUNDED', 'PARTIALLY_REFUNDED', 'REVERSED'].includes(status) ? "refunded" : status === "COMPLETED" ? "completed" : "review" };
}
