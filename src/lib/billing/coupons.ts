import { z } from "zod";
import { billingVariantFor, novemberPaypalPlanEnvFor, type BillingInterval, type PlanKey } from "./plans";

export const NOVEMBER_COUPON = { code: "NOVA60", campaign: "november-2026", percentOff: 60, startsAt: "2026-10-31T16:00:00.000Z", endsAt: "2026-11-30T16:00:00.000Z" } as const;
export const DEFAULT_COUPON_CODES: Record<string, boolean> = { NOVA60: true, MEETTAIPEI60: true };
export const couponRuleSchema = z.object({ enabled: z.boolean(), percentOff: z.number().int().min(1).max(99), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), revision: z.number().int().nonnegative().default(0), plans: z.record(z.string(), z.string()).default({}) }).strict().refine(v => v.startsAt < v.endsAt, "結束時間必須晚於開始時間");
export type CouponRule = z.infer<typeof couponRuleSchema>;
export type CouponCodes = Record<string, boolean | CouponRule>;
export class CouponError extends Error {
  constructor(message: string, public code: string, public status = 400) { super(message); }
}
export function couponTerms(plan: PlanKey, interval: BillingInterval) {
  const variant = billingVariantFor(plan, interval);
  if (!variant || !["pro", "business"].includes(plan)) throw new CouponError("折扣僅適用 SPARK／NOVA 新購訂閱 / Discount applies to new SPARK / NOVA subscriptions", "coupon_plan");
  return { ...NOVEMBER_COUPON, revision: 0, plan, interval, currency: variant.currency, regularAmountMinor: variant.amountMinor, firstAmountMinor: Math.round(variant.amountMinor * 40 / 100) };
}
export function couponQuote(code: string, plan: PlanKey, interval: BillingInterval, now = new Date(), codes: CouponCodes = DEFAULT_COUPON_CODES) {
  const normalized = code.trim().toUpperCase();
  if (!Object.hasOwn(codes, normalized) || !(codes[normalized] === true || typeof codes[normalized] === "object" && codes[normalized].enabled)) throw new CouponError("折扣碼無效 / Invalid discount code", "coupon_invalid");
  if (process.env.BILLING_NOVA60_ENABLED !== "true") throw new CouponError("折扣活動尚未開放 / Discount promotion is not available", "coupon_disabled", 503);
  const entry = codes[normalized], terms = typeof entry === "object" ? couponRuleSchema.parse(entry) : NOVEMBER_COUPON;
  if (now < new Date(terms.startsAt) || now >= new Date(terms.endsAt)) throw new CouponError(typeof entry === "object" ? "折扣碼不在有效期間 / Discount code is outside its validity period" : "折扣碼僅於 2026 年 11 月有效 / Discount code is valid only in November 2026", "coupon_expired");
  const base = couponTerms(plan, interval);
  return { ...base, revision: typeof entry === "object" ? entry.revision : 0, percentOff: terms.percentOff, startsAt: terms.startsAt, endsAt: terms.endsAt, firstAmountMinor: Math.round(base.regularAmountMinor * (100 - terms.percentOff) / 100), code: normalized };
}
export type CouponQuote = ReturnType<typeof couponQuote>;
export function couponPaypalPlanId(plan: PlanKey, interval: BillingInterval, codes?: CouponCodes, code?: string) {
  const entry = code && codes?.[code];
  if (entry && typeof entry === "object") {
    const id = entry.plans[`${process.env.PAYPAL_ENV}:${plan}:${interval}`];
    if (!id) throw new CouponError("優惠付款方案待核對，尚未開放付款 / Discount plan needs verification", "coupon_not_configured", 503);
    return id;
  }
  const env = novemberPaypalPlanEnvFor(plan, interval), id = env && process.env[env];
  if (!id) throw new CouponError("優惠扣款方案尚未設定，未建立付款 / Discount billing plan is not configured; no checkout created", "coupon_not_configured", 503);
  return id;
}
export function couponPlanBody(productId: string, quote: CouponQuote) {
  const frequency = { interval_unit: quote.interval === "month" ? "MONTH" : "YEAR", interval_count: 1 };
  const price = (amount: number) => ({ fixed_price: { value: (amount / 100).toFixed(2), currency_code: "USD" } });
  return { product_id: productId, name: `${quote.code} ${quote.percentOff}% OFF ${quote.plan} ${quote.interval}`, status: "ACTIVE", description: `${quote.percentOff}% off the first billing period only, then the regular price.`, billing_cycles: [
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
