import { readCouponCodes } from "./coupon-codes";
import "server-only";
import { prisma } from "@/lib/prisma";
import { getPaypalEnvironment } from "./config";
import { novemberPaypalPlanEnvFor, paypalPlanIdFor } from "./plans";
import type { BillingInterval } from "./plans";
import { couponTerms, couponPlanBody, assertCouponPlan, CouponError } from "./coupons";
import { createBillingPlan, getBillingPlan } from "./paypal";
import { z } from "zod";
const savedPlans = z.record(z.string(), z.string());
const settingKey = () => `billing.nova60.paypalPlans.${getPaypalEnvironment()}`;
export async function couponSetupStatus() {
  const value = await prisma.setting.findUnique({ where: { key: settingKey() } });
  const saved = value ? savedPlans.parse(value.value) : {};
  return { codes: await readCouponCodes(), environment: getPaypalEnvironment(), enabled: process.env.BILLING_NOVA60_ENABLED === "true", plans: (["pro", "business"] as const).flatMap(plan => (["month", "year"] as const).map(interval => {
    const env = novemberPaypalPlanEnvFor(plan, interval)!;
    return { ...couponTerms(plan, interval), env, preparedId: saved[env] || null, configuredId: process.env[env] || null };
  })) };
}
export async function prepareCouponPlan(plan: "pro" | "business", interval: BillingInterval) {
  const quote = couponTerms(plan, interval), env = novemberPaypalPlanEnvFor(plan, interval)!, base = paypalPlanIdFor(plan, interval);
  if (!base) throw new CouponError("原價方案尚未設定 / Regular plan is not configured", "coupon_not_configured", 503);
  const product = z.object({ product_id: z.string().min(1) }).parse(await getBillingPlan(base)).product_id;
  const state = await couponSetupStatus(), item = state.plans.find(p => p.env === env)!;
  if (item.preparedId && item.configuredId && item.preparedId !== item.configuredId) throw new CouponError("已保存與環境設定的優惠方案不一致，請先核對 / Stored and configured discount plans differ; reconcile first", "coupon_setup_conflict", 409);
  const id = item.preparedId || item.configuredId || (await createBillingPlan(couponPlanBody(product, quote), `nova60-2026-${plan}-${interval}-${state.environment}`)).id;
  if (!/^P-[A-Za-z0-9]+$/.test(id)) throw new CouponError("PayPal 方案識別碼無效 / Invalid PayPal plan ID", "coupon_plan_mismatch", 503);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('billing.nova60.paypalPlans'))::text`;
    const setting = await tx.setting.findUnique({ where: { key: settingKey() } }), values = setting ? savedPlans.parse(setting.value) : {};
    if (values[env] && values[env] !== id) throw new CouponError("優惠方案已由其他操作更新，請重新載入 / Discount plan changed; reload", "coupon_setup_conflict", 409);
    await tx.setting.upsert({ where: { key: settingKey() }, create: { key: settingKey(), value: { ...values, [env]: id } }, update: { value: { ...values, [env]: id } } });
  });
  assertCouponPlan(await getBillingPlan(id), quote, product);
  return { env, id, firstAmountMinor: quote.firstAmountMinor, regularAmountMinor: quote.regularAmountMinor };
}
