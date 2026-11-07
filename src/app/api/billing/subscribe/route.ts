import { activeBillingCatalog, resolveBillingPlan } from "@/lib/billing/commerce";
import { assertRegularPlan } from "@/lib/billing/commerce-policy";
import { memberError } from "@/lib/member-http";
import { browserMutationGuard } from "@/lib/security/http";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { getCurrentAccount } from "@/lib/auth/account";
import { ok, unauthorized } from "@/lib/api";
import {
  PLAN_KEYS,
  PLAN_CONFIG,
  billingVariantFor,
  paypalPlanIdFor,
  paypalPlanEnvFor,
  toBillingInterval,
  type PlanKey,
} from "@/lib/billing/plans";
import {
  createSubscription,
  getBillingPlan,
  getSubscription,
  isPaypalConfigured,
  reviseSubscription,
} from "@/lib/billing/paypal";
import { resolveBillingAppOrigin } from "@/lib/billing/config";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { CouponError } from "@/lib/billing/coupons";

// proxy 對 /api/* 放行，故自行守衛。
function bad(code: string, error: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const account = await getCurrentAccount();
    if (!account) return unauthorized();
    if (account.founderEndsAt && account.founderEndsAt > new Date()) return bad("founderActive", "創始年費仍有效，請勿重複訂閱；如需變更方案請聯絡客服 / Your prepaid founding year is active. Contact support before changing plans to avoid duplicate billing.", 409);
    if (account.betaAccess && !account.rollonMember && account.trialPolicy !== "interviews-3-v1") {
      return bad("betaAccess", "免費測試期間已開放最高方案權限，無需訂閱。The highest plan is free during testing; no subscription is needed.", 409);
    }

    const body = await req.json();
    const planRaw = typeof body?.plan === "string" ? body.plan : "";
    const interval = toBillingInterval(body?.interval);
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const locale: Locale = body?.locale === "zh-tw" ? "zh-tw" : "en";

    // 驗證方案
    if (!(PLAN_KEYS as readonly string[]).includes(planRaw)) {
      return bad("unknownPlan", "Unknown plan.", 400);
    }
    const plan = planRaw as PlanKey;
    if (account.rollonMember && plan === "pro") return bad("rollonMember", "rollon會員已享永久 Pro，無需重複訂閱 / Your rollon membership already includes permanent Pro access.", 409);
    const config = PLAN_CONFIG[plan];
    if (!interval) return bad("invalidInterval", "Billing interval must be month or year.", 400);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) {
      return bad("invalidRequestId", "Invalid checkout request id.", 400);
    }
    if (plan === "free" || !config.selfServe) {
      return bad(
        "notSelfServe",
        "This plan is not available for self-service checkout.",
        400,
      );
    }
    if (!isPaypalConfigured()) {
      return bad(
        "paypalNotConfigured",
        "PayPal 金流尚未設定（缺少 PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET）。",
        503,
      );
    }
    const existingRequest = await prisma.subscription.findUnique({
      where: { checkoutRequestId: requestId },
    });
    if (existingRequest) {
      if (existingRequest.userId !== session.uid) return bad("checkoutConflict", "Checkout request belongs to another account.", 409);
      if (existingRequest.plan !== plan || existingRequest.billingInterval && existingRequest.billingInterval !== interval) return bad("checkoutConflict", "結帳請求已用於不同方案 / Checkout request was used for a different plan", 409);
      const remote = await getSubscription(existingRequest.paypalSubscriptionId);
      const approveUrl = remote.links?.find((link) => link.rel === "approve")?.href;
      if (!approveUrl) return bad("checkoutAlreadyProcessed", "This checkout has already been processed. Refresh billing to see the latest status.", 409);
      return ok({ approveUrl, flow: "existing" });
    }

    const prices = await activeBillingCatalog();
    const pendingCoupon = body?.couponCode !== undefined ? await prisma.billingCouponCheckout.findUnique({ where: { requestId } }) : null;
    if (!pendingCoupon && (body?.pricingVersion ?? 1) !== prices.version) return bad("pricing_changed", "價格已更新，請重新整理並確認新價格；尚未建立付款 / Pricing changed; reload and confirm the new price. No checkout created", 409);
    if (body?.couponCode !== undefined) {
      if (account.rollonMember) return bad("coupon_existing_access", "目前帳號已有專屬權益，請聯絡客服確認升級 / This account already has special access; contact support before upgrading", 409);
      if (typeof body.couponCode !== "string" || !/^[A-Za-z0-9-]{3,32}$/.test(body.couponCode.trim())) return bad("coupon_invalid", "折扣碼格式無效 / Invalid discount code format", 400);
      const origin = resolveBillingAppOrigin(req.url);
      const result = await (await import("@/lib/billing/coupon-checkout")).checkoutWithCoupon({ userId: session.uid, email: session.email, requestId, code: body.couponCode, plan, interval, returnUrl: `${origin}${pathForLocale("/dashboard/billing/return", locale)}`, cancelUrl: `${origin}${pathForLocale("/dashboard/billing", locale)}?cancelled=1` });
      return ok(result);
    }
    const variant = billingVariantFor(plan, interval, prices.catalog);
    const paypalPlanId = paypalPlanIdFor(plan, interval, prices.catalog);
    if (!paypalPlanId) {
      return bad(
        "paypalNotConfigured",
        `方案 ${plan}/${interval} 的 PayPal Plan id 未設定（請設定 ${paypalPlanEnvFor(plan, interval)}）。`,
        503,
      );
    }

    if (prices.version > 1 && variant) {
      try { assertRegularPlan(await getBillingPlan(paypalPlanId), plan, interval, variant.amountMinor); }
      catch { return bad("paypal_price_mismatch", "PayPal 方案與顯示價格不符，已停止付款 / PayPal does not match the quoted price; checkout stopped", 503); }
    }

    const existingActive = await prisma.subscription.findFirst({
      where: {
        userId: session.uid,
        OR: [
          { status: { in: ["ACTIVE", "APPROVED", "SUSPENDED"] } },
          { status: "CANCELLED", currentPeriodEnd: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    const appUrl = resolveBillingAppOrigin(req.url);
    const returnUrl = `${appUrl}${pathForLocale("/dashboard/billing/return", locale)}`;
    const cancelUrl = `${appUrl}${pathForLocale("/dashboard/billing", locale)}?cancelled=1`;

    if (existingActive) {
      const current = await resolveBillingPlan(existingActive.paypalPlanId);
      if (
        current &&
        !current.legacy &&
        current.plan === plan &&
        current.interval === interval
      ) {
        return bad("alreadySubscribed", "You are already subscribed to this billing plan.", 409);
      }

      if (
        current &&
        !current.legacy &&
        (existingActive.status === "ACTIVE" || existingActive.status === "SUSPENDED")
      ) {
        const changed = await reviseSubscription({
          subscriptionId: existingActive.paypalSubscriptionId,
          planId: paypalPlanId,
          returnUrl,
          cancelUrl,
          requestId,
        });
        return ok({ approveUrl: changed.approveUrl, flow: "change" });
      }

      if (!existingActive.currentPeriodEnd) {
        return bad(
          "migrationNeedsReview",
          "The current subscription has no verified billing end date. It must be reconciled before switching to USD.",
          409,
        );
      }

      const sub = await createSubscription({
        planId: paypalPlanId,
        email: session.email,
        returnUrl,
        cancelUrl,
        requestId,
        startTime: existingActive.currentPeriodEnd.toISOString(),
      });
      await prisma.subscription.create({
        data: {
          userId: session.uid,
          paypalSubscriptionId: sub.id,
          checkoutRequestId: requestId,
          paypalPlanId,
          plan,
          status: sub.status,
          billingInterval: interval,
          currency: variant?.currency,
          amountMinor: variant?.amountMinor,
          replacesSubscriptionId: existingActive.id,
          startedAt: existingActive.currentPeriodEnd,
        },
      });
      return ok({ approveUrl: sub.approveUrl, flow: "legacyMigration" });
    }

    const sub = await createSubscription({
      planId: paypalPlanId,
      email: session.email,
      returnUrl,
      cancelUrl,
      requestId,
    });

    // 記錄一筆 APPROVAL_PENDING（webhook / confirm 之後會更新狀態）
    await prisma.subscription.create({
      data: {
        userId: session.uid,
        paypalSubscriptionId: sub.id,
        checkoutRequestId: requestId,
        paypalPlanId,
        plan,
        status: sub.status,
        billingInterval: interval,
        currency: variant?.currency,
        amountMinor: variant?.amountMinor,
      },
    });

    return ok({ approveUrl: sub.approveUrl, flow: "new" });
  } catch (error) {
    if (error instanceof CouponError) return bad(error.code, error.message, error.status);
    return memberError(error);
  }
}
