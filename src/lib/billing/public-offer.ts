import "server-only";
import { readCouponCodes } from "./coupon-codes";
import { FIRST_MONTH_COUPON, couponQuote, couponPaypalPlanId } from "./coupons";
import { billingVariantFor, type PLAN_CONFIG } from "./plans";

/** Advertise only an enabled offer with verified payment mappings and matching live prices. */
export async function publicFirstMonthOffer(prices: typeof PLAN_CONFIG) {
  const codes = await readCouponCodes();
  const entry = codes[FIRST_MONTH_COUPON];
  if (!entry || typeof entry !== "object" || !entry.enabled || process.env.BILLING_NOVA60_ENABLED !== "true") return null;
  const now = new Date();
  if (now < new Date(entry.startsAt) || now >= new Date(entry.endsAt)) return null;
  const quotes = (["pro", "business"] as const).map(plan => {
    const quote = couponQuote(FIRST_MONTH_COUPON, plan, "month", now, codes);
    couponPaypalPlanId(plan, "month", codes, FIRST_MONTH_COUPON);
    if (billingVariantFor(plan, "month", prices)?.amountMinor !== quote.regularAmountMinor) throw new Error("首月優惠與目前方案價格不符 / First-month offer does not match current pricing");
    return quote;
  });
  return { code: FIRST_MONTH_COUPON, quotes };
}
