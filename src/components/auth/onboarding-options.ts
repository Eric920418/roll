// Onboarding Step 2/3 的選項 slug（穩定值，存進 DB）；顯示 label 走 i18n Auth.options.*。
export const INDUSTRIES = [
  "saas",
  "hardware",
  "biotech",
  "consumer",
  "fintech",
  "other",
] as const;

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;

export const MARKETS = [
  "taiwan",
  "japan",
  "korea",
  "china",
  "singapore",
  "vietnam",
  "thailand",
] as const;

export const NEEDS = [
  "fundraising",
  "market-entry",
  "legal",
  "marketing",
  "sales-channel",
  "investor-access",
] as const;

// timeline 欄位語意已改為「公司成立多久」（公司年資）；DB 欄位名沿用 timeline，僅 slug 更新。
export const TIMELINES = ["lt1y", "1-3y", "3-5y", "gt5y"] as const;

export const BUDGETS = ["lt10k", "10-50k", "50-200k", "gt200k"] as const;
