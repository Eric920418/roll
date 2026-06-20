// 方案定義 — 程式邏輯的單一事實來源（gating 規則、PayPal plan id 對應、階級排序）。
// 注意分工：價格「顯示文案」只信 i18n（messages/*.json 的 Product.pricing），
//           價格「邏輯/驗證」只信本檔，避免雙重事實來源。

export const PLAN_KEYS = ["free", "pro", "business", "enterprise"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

/** 階級高低，gating 用 >= 比較 */
export const PLAN_RANK: Record<PlanKey, number> = {
  free: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
};

export interface PlanConfig {
  /** 對應的 env 變數名（PayPal Billing Plan id 不寫死進 repo；free/enterprise 無） */
  paypalPlanIdEnv?: string;
  /** 月費（TWD），僅自助付費方案有；free/enterprise 無 */
  monthlyTwd?: number;
  /** 是否可線上自助訂閱（enterprise 走 contact sales） */
  selfServe: boolean;
}

export const PLAN_CONFIG: Record<PlanKey, PlanConfig> = {
  free: { selfServe: true },
  pro: { paypalPlanIdEnv: "PAYPAL_PLAN_ID_PRO", monthlyTwd: 590, selfServe: true },
  business: {
    paypalPlanIdEnv: "PAYPAL_PLAN_ID_BUSINESS",
    monthlyTwd: 890,
    selfServe: true,
  },
  enterprise: { selfServe: false },
};

/** 型別守衛：把任意字串收斂成合法 PlanKey，非法值一律視為 free */
export function toPlanKey(value: string | null | undefined): PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value ?? "")
    ? (value as PlanKey)
    : "free";
}

/** userPlan 是否至少達到 min 階級 */
export function planAtLeast(userPlan: PlanKey, min: PlanKey): boolean {
  return PLAN_RANK[userPlan] >= PLAN_RANK[min];
}

/**
 * 取某方案對應的 PayPal Billing Plan id（從 env 讀）。
 * 找不到（free/enterprise 或 env 未設）回 null。
 */
export function paypalPlanIdFor(plan: PlanKey): string | null {
  const envName = PLAN_CONFIG[plan].paypalPlanIdEnv;
  if (!envName) return null;
  return process.env[envName] ?? null;
}

/** 由 PayPal plan id 反查方案 key（webhook 對帳用）；找不到回 null */
export function planFromPaypalPlanId(paypalPlanId: string): PlanKey | null {
  for (const key of PLAN_KEYS) {
    const envName = PLAN_CONFIG[key].paypalPlanIdEnv;
    if (envName && process.env[envName] === paypalPlanId) return key;
  }
  return null;
}
