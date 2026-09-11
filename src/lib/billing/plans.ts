// 方案與實際收款金額的單一事實來源。公開定價、Billing UI、PayPal 建立與 webhook
// 全部從這裡取值，避免畫面與真正扣款金額分離。

export const PLAN_KEYS = ["free", "pro", "business", "enterprise"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const PLAN_RANK: Record<PlanKey, number> = {
  free: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
};

export type BillingVariant = {
  interval: BillingInterval;
  amountMinor: number;
  currency: "USD";
  paypalPlanIdEnv: string;
};

export interface PlanConfig {
  selfServe: boolean;
  variants?: Record<BillingInterval, BillingVariant>;
  /** 舊 TWD plan 僅供歷史 webhook／遷移辨識，絕不再用於新 checkout。 */
  legacyPaypalPlanIdEnv?: string;
}

export const PLAN_CONFIG: Record<PlanKey, PlanConfig> = {
  free: { selfServe: false },
  pro: {
    selfServe: true,
    legacyPaypalPlanIdEnv: "PAYPAL_PLAN_ID_PRO",
    variants: {
      month: {
        interval: "month",
        amountMinor: 4_900,
        currency: "USD",
        paypalPlanIdEnv: "PAYPAL_PLAN_ID_PRO_MONTHLY_USD",
      },
      year: {
        interval: "year",
        amountMinor: 46_800,
        currency: "USD",
        paypalPlanIdEnv: "PAYPAL_PLAN_ID_PRO_YEARLY_USD",
      },
    },
  },
  business: {
    selfServe: true,
    legacyPaypalPlanIdEnv: "PAYPAL_PLAN_ID_BUSINESS",
    variants: {
      month: {
        interval: "month",
        amountMinor: 14_900,
        currency: "USD",
        paypalPlanIdEnv: "PAYPAL_PLAN_ID_BUSINESS_MONTHLY_USD",
      },
      year: {
        interval: "year",
        amountMinor: 166_800,
        currency: "USD",
        paypalPlanIdEnv: "PAYPAL_PLAN_ID_BUSINESS_YEARLY_USD",
      },
    },
  },
  enterprise: { selfServe: false },
};

export function toPlanKey(value: string | null | undefined): PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value ?? "")
    ? (value as PlanKey)
    : "free";
}

export function toBillingInterval(
  value: string | null | undefined,
): BillingInterval | null {
  return (BILLING_INTERVALS as readonly string[]).includes(value ?? "")
    ? (value as BillingInterval)
    : null;
}

export function planAtLeast(userPlan: PlanKey, min: PlanKey): boolean {
  return PLAN_RANK[userPlan] >= PLAN_RANK[min];
}

export function billingVariantFor(
  plan: PlanKey,
  interval: BillingInterval,
): BillingVariant | null {
  return PLAN_CONFIG[plan].variants?.[interval] ?? null;
}

export function priceLabel(plan: PlanKey, interval: BillingInterval): string | null {
  const variant = billingVariantFor(plan, interval);
  if (!variant) return null;
  return `USD ${(variant.amountMinor / 100).toLocaleString("en-US")}`;
}

export function monthlyEquivalentLabel(plan: PlanKey): string | null {
  const annual = billingVariantFor(plan, "year");
  if (!annual) return null;
  return `USD ${(annual.amountMinor / 100 / 12).toLocaleString("en-US")}`;
}

/** 保留舊呼叫端名稱；目前正式月費一律為 USD。 */
export function monthlyPriceLabel(plan: PlanKey): string | null {
  return priceLabel(plan, "month");
}

export function paypalPlanIdFor(
  plan: PlanKey,
  interval: BillingInterval = "month",
): string | null {
  const envName = billingVariantFor(plan, interval)?.paypalPlanIdEnv;
  return envName ? process.env[envName] ?? null : null;
}

export function paypalPlanEnvFor(
  plan: PlanKey,
  interval: BillingInterval,
): string | null {
  return billingVariantFor(plan, interval)?.paypalPlanIdEnv ?? null;
}

export type PaypalPlanMatch = {
  plan: PlanKey;
  interval: BillingInterval | null;
  currency: "USD" | "TWD";
  amountMinor: number | null;
  legacy: boolean;
};

export function billingFromPaypalPlanId(paypalPlanId: string): PaypalPlanMatch | null {
  for (const plan of ["pro", "business"] as const) {
    const config = PLAN_CONFIG[plan];
    for (const interval of BILLING_INTERVALS) {
      const variant = config.variants?.[interval];
      if (variant && process.env[variant.paypalPlanIdEnv] === paypalPlanId) {
        return {
          plan,
          interval,
          currency: variant.currency,
          amountMinor: variant.amountMinor,
          legacy: false,
        };
      }
    }
    if (
      config.legacyPaypalPlanIdEnv &&
      process.env[config.legacyPaypalPlanIdEnv] === paypalPlanId
    ) {
      return {
        plan,
        interval: "month",
        currency: "TWD",
        amountMinor: null,
        legacy: true,
      };
    }
  }
  return null;
}

export function planFromPaypalPlanId(paypalPlanId: string): PlanKey | null {
  return billingFromPaypalPlanId(paypalPlanId)?.plan ?? null;
}
