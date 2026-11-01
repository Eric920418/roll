import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type BillingCouponCheckout } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { CouponError, NOVEMBER_COUPON, assertCouponPlan, couponPaypalPlanId, couponQuote } from "./coupons";
import { paypalPlanIdFor, type PlanKey, type BillingInterval } from "./plans";
import { createSubscription, getBillingPlan, getSubscription, PaypalSubscriptionError } from "./paypal";
import { reconcileFromPaypal } from "./reconcile";

type DB = Prisma.TransactionClient;
type Input = { userId: string; email: string; requestId: string; code: string; plan: PlanKey; interval: BillingInterval; returnUrl: string; cancelUrl: string };
const requestSchema = z.object({ planId: z.string(), email: z.email(), requestId: z.string().uuid(), returnUrl: z.url(), cancelUrl: z.url() });
async function lockUser(tx: DB, userId: string) {
  const rows = await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE` as unknown[];
  if (!rows.length) throw new CouponError("請重新登入 / Please sign in", "unauthorized", 401);
}
export async function assertCouponEligibility(userId: string, tx: DB = prisma as unknown as DB) {
  const [used, active] = await Promise.all([
    tx.billingCouponCheckout.findFirst({ where: { userId, campaign: NOVEMBER_COUPON.campaign, consumedAt: { not: null } }, select: { id: true } }),
    tx.subscription.findFirst({ where: { userId, OR: [{ status: { in: ["ACTIVE", "APPROVED", "SUSPENDED"] } }, { status: "CANCELLED", currentPeriodEnd: { gt: new Date() } }] }, select: { id: true } }),
  ]);
  if (used) throw new CouponError("本帳號已使用過此優惠 / This account has already used this discount", "coupon_used", 409);
  if (active) throw new CouponError("此優惠僅限新購，既有訂閱或換方案不能套用 / Discount is for new subscriptions, not renewals or plan changes", "coupon_existing_subscription", 409);
}
function safeApprovalUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new CouponError("付款核准網址無效 / Invalid payment approval URL", "coupon_approval_url", 503); }
  if (url.protocol !== "https:" || !["www.paypal.com", "www.sandbox.paypal.com"].includes(url.hostname)) throw new CouponError("付款核准網址無效，請聯絡客服 / Invalid payment approval URL; contact support", "coupon_approval_url", 503);
  return url.href;
}
async function resume(row: BillingCouponCheckout) {
  if (!row.paypalSubscriptionId) throw new CouponError("原優惠付款仍在建立，請稍後重試 / Original discount checkout is being prepared; retry shortly", "coupon_pending", 409);
  const remote = await getSubscription(row.paypalSubscriptionId);
  await reconcileFromPaypal(remote);
  if (["CANCELLED", "EXPIRED"].includes(remote.status)) throw new CouponError("原付款已取消或到期，請重新確認折扣碼後再試 / Original checkout is closed; reapply the code", "coupon_checkout_closed", 409);
  if (remote.status !== "APPROVAL_PENDING") throw new CouponError("此付款已核准或處理中，請重新整理帳務頁 / Checkout was approved or is processing; refresh billing", "coupon_already_processed", 409);
  return { approveUrl: safeApprovalUrl(remote.links?.find(v => v.rel === "approve")?.href || row.approveUrl || ""), flow: "coupon" as const };
}
export async function checkoutWithCoupon(input: Input) {
  const limited = await checkRateLimit(`billing-coupon:${input.userId}`, 10, MINUTE_MS);
  if (!limited.ok) throw new CouponError("付款請求過於頻繁，請稍後重試 / Too many checkout attempts; retry shortly", "coupon_rate_limit", 429);
  const normalized = { code: input.code.trim().toUpperCase(), plan: input.plan, interval: input.interval, returnUrl: input.returnUrl, cancelUrl: input.cancelUrl };
  const payloadHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  // Refresh known approvals outside the transaction before deciding if an unpaid attempt is closed.
  const known = await prisma.billingCouponCheckout.findFirst({ where: { userId: input.userId, campaign: NOVEMBER_COUPON.campaign, status: "ready" }, orderBy: { createdAt: "desc" } });
  if (known?.paypalSubscriptionId) await reconcileFromPaypal(await getSubscription(known.paypalSubscriptionId));
  const token = randomUUID();
  const row = await prisma.$transaction(async raw => {
    const tx = raw as unknown as DB; await lockUser(tx, input.userId);
    const replay = await tx.billingCouponCheckout.findUnique({ where: { requestId: input.requestId } });
    if (replay && (replay.userId !== input.userId || replay.payloadHash !== payloadHash)) throw new CouponError("付款識別碼已用於其他內容，請重新確認 / Checkout request ID was used for different content; reconfirm", "coupon_request_conflict", 409);
    if (replay && ["closed", "failed"].includes(replay.status)) throw new CouponError("原付款已結束，請重新確認折扣碼 / Original checkout is closed; reapply the code", "coupon_checkout_closed", 409);
    if (replay?.status === "ready") return replay;
    if (!replay && await tx.subscription.findUnique({ where: { checkoutRequestId: input.requestId }, select: { id: true } })) throw new CouponError("付款識別碼已存在，請重新確認 / Checkout request ID already exists; reconfirm", "coupon_request_conflict", 409);
    await assertCouponEligibility(input.userId, tx);
    const pending = replay || await tx.billingCouponCheckout.findFirst({ where: { userId: input.userId, campaign: NOVEMBER_COUPON.campaign, status: { in: ["creating", "ready"] } }, orderBy: { createdAt: "desc" } });
    if (pending) {
      if (pending.plan !== input.plan || pending.billingInterval !== input.interval || pending.code !== normalized.code) throw new CouponError(`已有 ${pending.plan === "pro" ? "SPARK" : "NOVA"} ${pending.billingInterval === "month" ? "月繳 / monthly" : "年繳 / yearly"} 優惠付款待核准；請選回原方案繼續 / A discount checkout is pending; select the original plan and billing interval to continue`, "coupon_checkout_pending", 409);
      if (pending.status === "ready") return pending;
      // Stop uncertain creates before the provider can forget its idempotency receipt.
      if (Date.now() - pending.createdAt.getTime() >= 24 * 60 * 60 * 1000) throw new CouponError("原付款超過安全重試時間，請聯絡客服對帳；不會另建付款 / Original checkout needs support reconciliation; no new checkout will be created", "coupon_reconciliation_required", 409);
      if (pending.leaseUntil && pending.leaseUntil > new Date()) throw new CouponError("付款請求處理中，請稍後重試 / Checkout is processing; retry shortly", "coupon_pending", 409);
      return tx.billingCouponCheckout.update({ where: { id: pending.id }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + 180000) } });
    }
    const quote = couponQuote(normalized.code, input.plan, input.interval), paypalPlanId = couponPaypalPlanId(input.plan, input.interval);
    const request = { planId: paypalPlanId, email: input.email, requestId: randomUUID(), returnUrl: input.returnUrl, cancelUrl: input.cancelUrl };
    return tx.billingCouponCheckout.create({ data: { userId: input.userId, requestId: input.requestId, payloadHash, campaign: quote.campaign, code: quote.code, plan: input.plan, billingInterval: input.interval, regularAmountMinor: quote.regularAmountMinor, firstAmountMinor: quote.firstAmountMinor, paypalPlanId, request, createdAt: new Date(), leaseToken: token, leaseUntil: new Date(Date.now() + 180000) } });
  }, { timeout: 15000 });
  if (row.status === "ready") return resume(row);
  let submitted = false;
  try {
    const quote = { ...NOVEMBER_COUPON, plan: row.plan as PlanKey, interval: row.billingInterval as BillingInterval, currency: "USD" as const, regularAmountMinor: row.regularAmountMinor, firstAmountMinor: row.firstAmountMinor };
    const regularId = paypalPlanIdFor(quote.plan, quote.interval);
    if (!regularId) throw new CouponError("原價方案設定缺失，已停止付款 / Regular billing plan is missing; checkout stopped", "coupon_not_configured", 503);
    const [regular, discount] = await Promise.all([getBillingPlan(regularId), getBillingPlan(row.paypalPlanId)]);
    const productId = z.object({ product_id: z.string().min(1) }).parse(regular).product_id;
    assertCouponPlan(discount, quote, productId);
    submitted = true;
    const sub = await createSubscription(requestSchema.parse(row.request));
    const approveUrl = safeApprovalUrl(sub.approveUrl);
    await prisma.$transaction(async raw => {
      const tx = raw as unknown as DB; await lockUser(tx, input.userId);
      const fresh = await tx.billingCouponCheckout.findUniqueOrThrow({ where: { id: row.id } });
      if (fresh.leaseToken !== token) throw new CouponError("付款處理權已變更，請重新讀取原付款 / Checkout processing lease changed; reload original checkout", "coupon_lease_changed", 409);
      const existing = await tx.subscription.findUnique({ where: { paypalSubscriptionId: sub.id } });
      if (existing && (existing.userId !== input.userId || existing.paypalPlanId !== row.paypalPlanId)) throw new CouponError("付款資料衝突，請聯絡客服 / Billing data conflict; contact support", "coupon_subscription_conflict", 409);
      if (!existing) await tx.subscription.create({ data: { userId: input.userId, paypalSubscriptionId: sub.id, checkoutRequestId: row.requestId, paypalPlanId: row.paypalPlanId, plan: row.plan, status: sub.status, billingInterval: row.billingInterval, currency: "USD", amountMinor: row.regularAmountMinor } });
      await tx.billingCouponCheckout.update({ where: { id: row.id }, data: { paypalSubscriptionId: sub.id, approveUrl, status: "ready", leaseToken: null, leaseUntil: null } });
    }, { timeout: 15000 });
    return { approveUrl, flow: "coupon" as const };
  } catch (error) {
    const definite = !submitted || error instanceof PaypalSubscriptionError && [400, 401, 403, 404, 422].includes(error.status);
    await prisma.billingCouponCheckout.updateMany({ where: { id: row.id, leaseToken: token }, data: { ...(definite ? { status: "failed" } : {}), leaseToken: null, leaseUntil: null } });
    if (error instanceof CouponError) throw error;
    if (definite) throw new CouponError("優惠付款未能建立，未扣款；請重新確認折扣碼後重試 / Discount checkout could not be created; no payment taken. Reapply the code and retry", "coupon_provider_rejected", 503);
    throw new CouponError("付款狀態尚未確認；保留原請求，請重試，不會重複建單 / Checkout is unconfirmed; retry the original request without creating a duplicate", "coupon_unconfirmed", 503);
  }
}
