export const COMPANY_STAGES = [
  "Idea",
  "Validation",
  "MVP",
  "Early Revenue",
  "Product-Market Fit",
  "Growth",
  "Expansion",
] as const;

export const BOTTLENECKS = {
  Product: [
    ["product_not_ready", "Product not ready"],
    ["mvp_incomplete", "MVP incomplete"],
    ["product_validation", "Product validation"],
    ["technical_issues", "Technical issues"],
    ["user_experience", "User experience"],
    ["product_market_fit", "Product-market fit"],
  ],
  Sales: [
    ["no_icp", "No ICP"],
    ["no_leads", "Lead generation"],
    ["low_response_rate", "Low response rate"],
    ["not_enough_meetings", "Not enough meetings"],
    ["low_conversion", "Low conversion"],
    ["pricing_problem", "Pricing problem"],
    ["no_repeatable_sales_process", "No repeatable sales process"],
  ],
  Fundraising: [
    ["no_investor_list", "No investor list"],
    ["pitch_deck_not_ready", "Pitch deck not ready"],
    ["weak_investment_thesis", "Weak investment thesis"],
    ["no_traction", "No traction"],
    ["low_investor_meetings", "Low investor meetings"],
    ["due_diligence_incomplete", "Due diligence incomplete"],
    ["valuation_issue", "Valuation issue"],
  ],
  Expansion: [
    ["no_target_market", "No target market"],
    ["market_research_incomplete", "Market research incomplete"],
    ["no_local_partner", "No local partner"],
    ["regulatory_issue", "Regulatory issue"],
    ["distribution", "Distribution"],
    ["localization", "Localization"],
    ["market_validation", "Market validation"],
  ],
} as const;

export type CompanyStage = (typeof COMPANY_STAGES)[number];
export type BottleneckGroup = keyof typeof BOTTLENECKS;
export type BottleneckCode = (typeof BOTTLENECKS)[BottleneckGroup][number][0];

export const IMPACT_WEIGHTS = {
  Critical: 5,
  High: 4,
  Medium: 3,
  Low: 2,
} as const;

export const URGENCY_TYPES = ["immediate", "urgent", "scheduled"] as const;
export const OUTCOME_CATEGORIES = [
  "revenue",
  "customers",
  "product",
  "fundraising",
  "expansion",
  "custom",
] as const;

export function isValidBottleneck(group: string, code: string): boolean {
  const values = BOTTLENECKS[group as BottleneckGroup];
  return Boolean(values?.some(([candidate]) => candidate === code));
}

export function bottleneckLabel(group: string, code: string): string {
  const values = BOTTLENECKS[group as BottleneckGroup];
  return values?.find(([candidate]) => candidate === code)?.[1] ?? code;
}

export function urgencyWeight(type: string, days?: number | null): number {
  if (type === "immediate") return 5;
  if (type === "urgent") return 4;
  if (days == null) return 1;
  if (days <= 3) return 3;
  if (days <= 7) return 2;
  return 1;
}
