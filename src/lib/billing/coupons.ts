import { billingVariantFor, novemberPaypalPlanEnvFor, type BillingInterval, type PlanKey } from "./plans";

export const NOVEMBER_COUPON = { code: "NOVA60", campaign: "november-2026", percentOff: 60, startsAt: "2026-10-31T16:00:00.000Z", endsAt: "2026-11-30T16:00:00.000Z" } as const;
export const DEFAULT_COUPON_CODES: Record<string, boolean> = { NOVA60: true, MEETTAIPEI60: true };
export class CouponError extends Error {
  constructor(message: string, public code: string, public status = 400) { super(message); }
}
export function couponTerms(plan: PlanKey, interval: BillingInterval) {
  const variant = billingVariantFor(plan, interval);
  if (!variant || !["pro", "business"].includes(plan)) throw new CouponError("折扣僅適用 SPARK／NOVA 新購訂閱 / Discount applies to new SPARK / NOVA subscriptions", "coupon_plan");
  return { ...NOVEMBER_COUPON, plan, interval, currency: variant.currency, regularAmountMinor: variant.amountMinor, firstAmountMinor: Math.round(variant.amountMinor * 40 / 100) };
}
export function couponQuote(code: string, plan: PlanKey, interval: BillingInterval, now = new Date(), codes: Record<string, boolean> = DEFAULT_COUPON_CODES) {
  const normalized = code.trim().toUpperCase();
  if (!Object.hasOwn(codes, normalized) || codes[normalized] !== true) throw new CouponError("折扣碼無效 / Invalid discount code", "coupon_invalid");
  if (process.env.BILLING_NOVA60_ENABLED !== "true") throw new CouponError("折扣活動尚未開放 / Discount promotion is not available", "coupon_disabled", 503);
  if (now < new Date(NOVEMBER_COUPON.startsAt) || now >= new Date(NOVEMBER_COUPON.endsAt)) throw new CouponError("折扣碼僅於 2026 年 11 月有效（台北時間）/ Discount code is valid only in November 2026 (Taipei time)", "coupon_expired");
  return { ...couponTerms(plan, interval), code: normalized };
}
export type CouponQuote = ReturnType<typeof couponQuote>;
export function couponPaypalPlanId(plan: PlanKey, interval: BillingInterval) {
  const env = novemberPaypalPlanEnvFor(plan, interval), id = env && process.env[env];
  if (!id) throw new CouponError("優惠扣款方案尚未設定，未建立付款 / Discount billing plan is not configured; no checkout created", "coupon_not_configured", 503);
  return id;
}
export function couponPlanBody(productId: string, quote: CouponQuote) {
  const frequency = { interval_unit: quote.interval === "month" ? "MONTH" : "YEAR", interval_count: 1 };
  const price = (amount: number) => ({ fixed_price: { value: (amount / 100).toFixed(2), currency_code: "USD" } });
  return { product_id: productId, name: `NOVA60 November 2026 ${quote.plan} ${quote.interval}`, status: "ACTIVE", description: "60% off the first billing period only, then the regular price. NOVA November 2026 promotion.", billing_cycles: [
    { frequency, tenure_type: "TRIAL", sequence: 1, total_cycles: 1, pricing_scheme: price(quote.firstAmountMinor) },
    { frequency, tenure_type: "REGULAR", sequence: 2, total_cycles: 0, pricing_scheme: price(quote.regularAmountMinor) },
  ], payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: "CONTINUE", payment_failure_threshold: 3 } };
}
export function assertCouponPlan(raw: unknown, quote: CouponQuote, productId: string) {
  const value = raw as ReturnType<typeof couponPlanBody> & { taxes?: { percentage?: string }; payment_preferences?: { setup_fee?: { value?: string } }; quantity_supported?: boolean };
  const expected = couponPlanBody(productId, quote);
  const valid = value?.status === "ACTIVE" && value.product_id === productId && value.quantity_supported !== true && Array.isArray(value.billing_cycles) && value.billing_cycles.length === 2 && expected.billing_cycles.every(c => {
    const actual = value.billing_cycles.find(v => v.sequence === c.sequence);
    return actual?.tenure_type === c.tenure_type && actual.total_cycles === c.total_cycles && actual.frequency?.interval_unit === c.frequency.interval_unit && actual.frequency.interval_count === 1 && actual.pricing_scheme?.fixed_price?.currency_code === "USD" && Number(actual.pricing_scheme.fixed_price.value) === Number(c.pricing_scheme.fixed_price.value);
  }) && (!value.taxes?.percentage || Number(value.taxes.percentage) === 0) && (!value.payment_preferences?.setup_fee?.value || Number(value.payment_preferences.setup_fee.value) === 0);
  if (!valid) throw new CouponError("PayPal 優惠方案與顯示價格不一致，已停止付款，請聯絡管理員 / PayPal discount plan does not match the quoted pricing; checkout stopped. Contact support", "coupon_plan_mismatch", 503);
}
