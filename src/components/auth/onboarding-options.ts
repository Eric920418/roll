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

export const TIMELINES = ["lt3m", "3-6m", "6-12m", "exploring"] as const;

export const BUDGETS = ["lt10k", "10-50k", "50-200k", "gt200k"] as const;
