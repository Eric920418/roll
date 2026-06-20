import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { ok, unauthorized, failFromError } from "@/lib/api";
import {
  PLAN_KEYS,
  PLAN_CONFIG,
  paypalPlanIdFor,
  type PlanKey,
} from "@/lib/billing/plans";
import { createSubscription, isPaypalConfigured } from "@/lib/billing/paypal";
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
    const locale: Locale = body?.locale === "zh-tw" ? "zh-tw" : "en";

    // 驗證方案
    if (!(PLAN_KEYS as readonly string[]).includes(planRaw)) {
      return bad("unknownPlan", "Unknown plan.", 400);
    }
    const plan = planRaw as PlanKey;
    const config = PLAN_CONFIG[plan];
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
    const paypalPlanId = paypalPlanIdFor(plan);
    if (!paypalPlanId) {
      return bad(
        "paypalNotConfigured",
        `方案 ${plan} 的 PayPal Plan id 未設定（請設定 ${config.paypalPlanIdEnv}）。`,
        503,
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const returnUrl = `${appUrl}${pathForLocale("/dashboard/billing/return", locale)}`;
    const cancelUrl = `${appUrl}${pathForLocale("/dashboard/billing", locale)}?cancelled=1`;

    const sub = await createSubscription({
      planId: paypalPlanId,
      email: session.email,
      returnUrl,
      cancelUrl,
    });

    // 記錄一筆 APPROVAL_PENDING（webhook / confirm 之後會更新狀態）
    await prisma.subscription.create({
      data: {
        userId: session.uid,
        paypalSubscriptionId: sub.id,
        paypalPlanId,
        plan,
        status: sub.status,
      },
    });

    return ok({ approveUrl: sub.approveUrl });
  } catch (error) {
    return failFromError(error);
  }
}
