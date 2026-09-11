import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { ok, unauthorized, failFromError } from "@/lib/api";
import {
  PLAN_KEYS,
  PLAN_CONFIG,
  billingFromPaypalPlanId,
  billingVariantFor,
  paypalPlanIdFor,
  paypalPlanEnvFor,
  toBillingInterval,
  type PlanKey,
} from "@/lib/billing/plans";
import {
  createSubscription,
  getSubscription,
  isPaypalConfigured,
  reviseSubscription,
} from "@/lib/billing/paypal";
import { resolveBillingAppOrigin } from "@/lib/billing/config";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

// proxy 對 /api/* 放行，故自行守衛。
function bad(code: string, error: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

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
    const variant = billingVariantFor(plan, interval);
    const paypalPlanId = paypalPlanIdFor(plan, interval);
    if (!paypalPlanId) {
      return bad(
        "paypalNotConfigured",
        `方案 ${plan}/${interval} 的 PayPal Plan id 未設定（請設定 ${paypalPlanEnvFor(plan, interval)}）。`,
        503,
      );
    }

    const existingRequest = await prisma.subscription.findUnique({
      where: { checkoutRequestId: requestId },
    });
    if (existingRequest) {
      if (existingRequest.userId !== session.uid) return bad("checkoutConflict", "Checkout request belongs to another account.", 409);
      const remote = await getSubscription(existingRequest.paypalSubscriptionId);
      const approveUrl = remote.links?.find((link) => link.rel === "approve")?.href;
      if (!approveUrl) return bad("checkoutAlreadyProcessed", "This checkout has already been processed. Refresh billing to see the latest status.", 409);
      return ok({ approveUrl, flow: "existing" });
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
      const current = billingFromPaypalPlanId(existingActive.paypalPlanId);
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
    return failFromError(error);
  }
}
