import { z } from 'zod';
import { PLAN_CONFIG, paypalPlanIdFor, type BillingInterval, type PlanKey } from './plans';
export const commercePrefix = 'novaCommerce.';
const amount = z.number().int().min(1).max(100000000);
const rate = z.object({ amountMinor: amount, paypalPlanId: z.string().regex(/^(P-[A-Za-z0-9]+)?$/) }).strict();
const periods = z.object({ month: rate, year: rate }).strict();
export const commercePolicySchema = z.object({
  tokens: z.object({ monthlyGrant: z.number().int().min(0).max(1000000), inviteFee: amount.max(1000000), searchFee: amount.max(1000000), monthlyCompanies: z.number().int().min(0).max(1000).multipleOf(5), dailyInvites: z.number().int().min(1).max(1000) }).strict(),
  subscriptions: z.object({ pro: periods, business: periods }).strict(),
  packs: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/), tokens: z.number().int().min(1).max(1000000), currency: z.enum(['USD', 'TWD']), amountMinor: amount }).strict()).max(10).refine(rows => new Set(rows.map(r => r.id)).size === rows.length, '加購包 ID 不可重複'),
  cashCheckoutEnabled: z.literal(false),
}).strict();
export type CommercePolicy = z.infer<typeof commercePolicySchema>;
export function defaultCommercePolicy(): CommercePolicy {
  const prices = (plan: 'pro' | 'business') => Object.fromEntries((['month', 'year'] as const).map(period => [period, { amountMinor: PLAN_CONFIG[plan].variants![period].amountMinor, paypalPlanId: paypalPlanIdFor(plan, period) || '' }])) as CommercePolicy['subscriptions']['pro'];
  return { tokens: { monthlyGrant: 150, inviteFee: 5, searchFee: 20, monthlyCompanies: 10, dailyInvites: 20 }, subscriptions: { pro: prices('pro'), business: prices('business') }, packs: [], cashCheckoutEnabled: false };
}
export function commerceCatalog(policy: CommercePolicy): typeof PLAN_CONFIG {
  const plan = (key: 'pro' | 'business') => ({ ...PLAN_CONFIG[key], variants: Object.fromEntries((['month', 'year'] as const).map(interval => [interval, { ...PLAN_CONFIG[key].variants![interval], ...policy.subscriptions[key][interval] }])) as NonNullable<typeof PLAN_CONFIG.pro.variants> });
  return { ...PLAN_CONFIG, pro: plan('pro'), business: plan('business') };
}
export function regularPlanBody(productId: string, plan: 'pro' | 'business', interval: BillingInterval, amountMinor: number) {
  return { product_id: productId, name: `NOVA ${plan === 'pro' ? 'SPARK' : 'NOVA'} ${interval} USD ${(amountMinor / 100).toFixed(2)}`, status: 'ACTIVE', billing_cycles: [{ frequency: { interval_unit: interval === 'month' ? 'MONTH' : 'YEAR', interval_count: 1 }, tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { currency_code: 'USD', value: (amountMinor / 100).toFixed(2) } } }], payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CONTINUE', payment_failure_threshold: 3 } };
}
export function assertRegularPlan(raw: unknown, plan: PlanKey, interval: BillingInterval, amountMinor: number) {
  const value = raw as ReturnType<typeof regularPlanBody> & { quantity_supported?: boolean; taxes?: { percentage?: string }; payment_preferences?: { setup_fee?: { value?: string } } };
  const cycle = value?.billing_cycles?.[0];
  if (value?.status !== 'ACTIVE' || value.quantity_supported === true || value.billing_cycles?.length !== 1 || cycle.tenure_type !== 'REGULAR' || cycle.sequence !== 1 || cycle.total_cycles !== 0 || cycle.frequency?.interval_count !== 1 || cycle.frequency.interval_unit !== (interval === 'month' ? 'MONTH' : 'YEAR') || cycle.pricing_scheme?.fixed_price?.currency_code !== 'USD' || !/^\d+(\.\d{1,2})?$/.test(cycle.pricing_scheme.fixed_price.value) || Math.round(Number(cycle.pricing_scheme.fixed_price.value) * 100) !== amountMinor || Number(value.taxes?.percentage || 0) !== 0 || Number(value.payment_preferences?.setup_fee?.value || 0) !== 0) throw new Error(`PayPal ${plan}/${interval} 金額、週期或附加費與草稿不符 / PayPal plan does not match the draft`);
  return value.product_id;
}
