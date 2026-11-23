import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rewardTransaction } from "@/lib/rewards/service";
import { cancelSubscription, getSubscription } from "@/lib/billing/paypal";
import { logSecurityError } from "@/lib/security/log";
import { ReferralError } from "./policy";

const lock = (tx: Prisma.TransactionClient) => tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('nova-referrals-v1'))::text`;
const conflict = (zh: string, en: string, code = "free_month_conflict") => new ReferralError(`${zh} / ${en}`, 409, code);

/** One calendar month, keeping Taiwan local time and clamping month-end. */
export function freeMonthEnd(start: Date) {
  const local = new Date(start.getTime() + 8 * 3600000);
  const day = local.getUTCDate();
  local.setUTCDate(1); local.setUTCMonth(local.getUTCMonth() + 1);
  const endOfMonth = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day, endOfMonth));
  return new Date(local.getTime() - 8 * 3600000);
}

export async function syncFreeMonthAccess(tx: Prisma.TransactionClient, accountId: string, now = new Date()) {
  const account = await tx.referralAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (!account.userId) return;
  const benefit = await tx.referralFreeMonth.findFirst({ where: { accountId, status: "scheduled", endsAt: { gt: now } }, orderBy: { startsAt: "asc" } });
  await tx.user.update({ where: { id: account.userId }, data: { referralMonthPlan: benefit?.plan ?? null, referralMonthStartsAt: benefit?.startsAt ?? null, referralMonthEndsAt: benefit?.endsAt ?? null } });
}

/** Cancellation is retried by reading the SAME subscription; no replacement or charge is created. */
export async function redeemFreeMonth(userId: string, benefitId: string, requestId: string, now = new Date()) {
  const prepared = await rewardTransaction(async tx => {
    await lock(tx);
    const benefit = await tx.referralFreeMonth.findFirst({ where: { id: benefitId, account: { userId } }, include: { referral: true } });
    if (!benefit) throw new ReferralError("找不到免費月 / Free month not found", 404, "not_found");
    if (benefit.status === "scheduled") return { complete: true as const, benefit };
    if (benefit.referral.status !== "granted" || !["available", "claiming"].includes(benefit.status)) throw conflict("此獎勵尚不可兌換或已撤回", "This reward is not available or has been revoked");
    if (benefit.status === "claiming" && benefit.leaseUntil && benefit.leaseUntil > now) throw conflict("兌換正在處理，請稍後重新確認", "Redemption is processing; check again shortly", "free_month_processing");
    const member = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (member.referralMonthEndsAt && member.referralMonthEndsAt > now) throw conflict("已有免費月，結束後可再兌換下一個", "Redeem the next reward after your current free month ends");
    const other = await tx.referralFreeMonth.findFirst({ where: { account: { userId }, status: "claiming", id: { not: benefit.id } } });
    if (other) throw conflict("另一筆免費月需要先完成核對", "Complete the other pending free month first");
    if (member.rollonMember || member.plan === "enterprise" || member.founderEndsAt && member.founderEndsAt > now) throw conflict("目前永久或預付年費權益仍有效，免費月會保留", "Lifetime or prepaid access is active; your reward is retained");
    const subscriptions = await tx.subscription.findMany({ where: { userId, OR: [{ status: { in: ["APPROVAL_PENDING", "APPROVED", "ACTIVE", "SUSPENDED"] } }, { status: "CANCELLED", currentPeriodEnd: { gt: now } }] } });
    if (subscriptions.some(s => ["APPROVAL_PENDING", "APPROVED", "SUSPENDED"].includes(s.status)) || subscriptions.length > 1) throw conflict("請先完成或取消其他結帳，並核對訂閱狀態", "Resolve other checkouts and verify your subscription first");
    const sub = subscriptions[0];
    if (!sub && member.paypalSubscriptionId && ["ACTIVE", "SUSPENDED", "APPROVED"].includes(member.subscriptionStatus ?? "")) throw conflict("目前訂閱紀錄不完整，尚未取消或兌換", "Current subscription records are incomplete; nothing was cancelled or redeemed");
    if (sub && (sub.billingInterval !== "month" || !sub.currentPeriodEnd || !["pro", "business"].includes(sub.plan))) throw conflict("目前不是可核對的月繳訂閱；免費月會保留，不取消年繳", "A verified monthly subscription is required; annual access is retained");
    if (benefit.status === "claiming" && benefit.subscriptionId && sub && sub.paypalSubscriptionId !== benefit.subscriptionId) throw conflict("訂閱已變動，請聯絡管理員核對原兌換", "Your subscription changed; ask an administrator to review the original redemption");
    const subscriptionId = benefit.status === "claiming" ? benefit.subscriptionId : sub?.paypalSubscriptionId ?? null;
    const startsAt = new Date(Math.max(now.getTime(), sub?.currentPeriodEnd?.getTime() ?? 0, benefit.status === "claiming" ? benefit.startsAt?.getTime() ?? 0 : 0));
    const plan = sub?.plan ?? benefit.plan;
    const reserved = await tx.referralFreeMonth.update({ where: { id: benefit.id }, data: { status: "claiming", plan, subscriptionId, requestId: benefit.requestId ?? requestId, startsAt, endsAt: freeMonthEnd(startsAt), leaseUntil: new Date(now.getTime() + 90000), lastError: null } });
    return { complete: false as const, benefit: reserved };
  });
  if (prepared.complete) return prepared.benefit;
  const reserved = prepared.benefit;
  try {
    let paidThrough = reserved.startsAt!;
    if (reserved.subscriptionId) {
      let remote = await getSubscription(reserved.subscriptionId);
      const local = await prisma.subscription.findUniqueOrThrow({ where: { paypalSubscriptionId: reserved.subscriptionId } });
      if (remote.id !== reserved.subscriptionId || local.userId !== userId || remote.plan_id !== local.paypalPlanId) throw conflict("付款訂閱與本站紀錄不符，尚未啟用免費月", "Subscription references do not match; free month is not active");
      if (remote.status === "ACTIVE") {
        const next = new Date(remote.billing_info?.next_billing_time ?? "");
        if (!Number.isFinite(next.getTime()) || next.getTime() - now.getTime() < 5 * 60000) throw conflict("扣款日期需要核對，尚未取消訂閱", "Billing date requires review; subscription has not been cancelled");
        paidThrough = new Date(Math.max(paidThrough.getTime(), next.getTime()));
        // Save paid-through before cancellation, since PayPal may omit it afterward.
        await prisma.referralFreeMonth.updateMany({ where: { id: reserved.id, status: "claiming", requestId: reserved.requestId }, data: { startsAt: paidThrough, endsAt: freeMonthEnd(paidThrough) } });
        await cancelSubscription(reserved.subscriptionId);
        remote = await getSubscription(reserved.subscriptionId);
      }
      if (remote.status !== "CANCELLED") throw conflict("PayPal 尚未確認停止扣款，請重試；免費月尚未啟用", "PayPal has not confirmed cancellation; retry. Free month is not active", "cancellation_unconfirmed");
    }
    return await rewardTransaction(async tx => {
      await lock(tx);
      const benefit = await tx.referralFreeMonth.findUniqueOrThrow({ where: { id: reserved.id }, include: { referral: true, account: true } });
      if (benefit.status === "scheduled") return benefit;
      if (benefit.account.userId !== userId || benefit.status !== "claiming" || benefit.referral.status !== "granted" || benefit.requestId !== reserved.requestId) throw conflict("獎勵狀態已變動，請重新核對", "Reward status changed; verify it again");
      const conflicting = await tx.subscription.findFirst({ where: { userId, status: { in: ["APPROVAL_PENDING", "APPROVED", "ACTIVE", "SUSPENDED"] }, ...(reserved.subscriptionId ? { paypalSubscriptionId: { not: reserved.subscriptionId } } : {}) } });
      if (conflicting) throw conflict("出現另一筆訂閱，尚未啟用免費月，請聯絡管理員", "Another subscription exists; free month is not active. Contact an administrator");
      const start = new Date(Math.max(paidThrough.getTime(), benefit.startsAt?.getTime() ?? 0, Date.now()));
      if (reserved.subscriptionId) {
        await tx.subscription.update({ where: { paypalSubscriptionId: reserved.subscriptionId }, data: { status: "CANCELLED", cancelledAt: new Date(), currentPeriodEnd: paidThrough } });
        await tx.user.updateMany({ where: { id: userId, paypalSubscriptionId: reserved.subscriptionId }, data: { subscriptionStatus: "CANCELLED", currentPeriodEnd: paidThrough, planUpdatedAt: new Date() } });
      }
      const result = await tx.referralFreeMonth.update({ where: { id: benefit.id }, data: { status: "scheduled", startsAt: start, endsAt: freeMonthEnd(start), leaseUntil: null, lastError: null } });
      await syncFreeMonthAccess(tx, benefit.accountId);
      return result;
    });
  } catch (error) {
    const trace = error instanceof ReferralError ? "" : logSecurityError("referral.free_month_verification", error);
    const message = error instanceof ReferralError ? error.message : `免費月尚未啟用，付款服務核對失敗，請重試同一筆兌換 / Free month is not active. Payment verification failed; retry this redemption.\n${trace}`;
    await prisma.referralFreeMonth.updateMany({ where: { id: reserved.id, status: "claiming", requestId: reserved.requestId }, data: { leaseUntil: null, lastError: message } });
    if (error instanceof ReferralError) throw error;
    throw new ReferralError(message, 503, "free_month_verification_failed");
  }
}
