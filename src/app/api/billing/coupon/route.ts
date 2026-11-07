import { activeBillingCatalog } from "@/lib/billing/commerce";
import { billingVariantFor } from "@/lib/billing/plans";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { browserMutationGuard } from "@/lib/security/http";
import { getCurrentAccount } from "@/lib/auth/account";
import { ok, unauthorized, failFromError } from "@/lib/api";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { CouponError, couponPaypalPlanId, couponQuote } from "@/lib/billing/coupons";
import { assertCouponEligibility } from "@/lib/billing/coupon-checkout";
const input = z.object({ code: z.string().trim().min(3).max(32), interval: z.enum(["month", "year"]) }).strict();
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const account = await getCurrentAccount(); if (!account) return unauthorized();
    const rate = await checkRateLimit(`coupon-quote:${account.id}`, 10, MINUTE_MS); if (!rate.ok) throw new CouponError("驗證過於頻繁，請稍後重試 / Too many validation attempts; retry shortly", "coupon_rate_limit", 429);
    const parsed = input.safeParse(await req.json()); if (!parsed.success) throw new CouponError("請確認折扣碼與付款週期 / Check the code and billing interval", "coupon_invalid");
    if (account.rollonMember || account.founderEndsAt && account.founderEndsAt > new Date() || account.betaAccess && account.trialPolicy !== "interviews-3-v1") throw new CouponError("目前帳號已有專屬權益，請勿重複購買 / This account already has special access; avoid duplicate purchases", "coupon_existing_access", 409);
    const prices = await activeBillingCatalog();
    const quotes = (["pro", "business"] as const).map(plan => couponQuote(parsed.data.code, plan, parsed.data.interval)).filter(quote => billingVariantFor(quote.plan, quote.interval, prices.catalog)?.amountMinor === quote.regularAmountMinor);
    if (!quotes.length) throw new CouponError("目前價格已更新，此優惠不適用 / Pricing changed; this promotion is not available for the new price", "coupon_price_changed", 409);
    await assertCouponEligibility(account.id);
    for (const quote of quotes) couponPaypalPlanId(quote.plan, quote.interval);
    return ok({ code: quotes[0].code, quotes });
  } catch (error) {
    if (error instanceof CouponError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return failFromError(error);
  }
}
