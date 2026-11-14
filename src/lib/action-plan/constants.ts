export const STEP_NAMES = {
  "01-1": { title: ["客戶訪談", "Customer conversations"], previousTitle: ["與 10 位目標客戶對話，確認痛點與付費意願", "Talk with 10 target customers about pain and willingness to pay"] },
  "01-2": { title: ["定位確認", "Confirm positioning"], previousTitle: ["寫出一句話定位，並請 5 位受訪者確認", "Write a positioning statement and confirm it with five interviewees"] },
  "01-3": { title: ["評分標準", "Scoring criteria"], previousTitle: ["建立潛在客戶評分標準", "Define lead qualification criteria"] },
  "01-4": { title: ["客戶分級", "Customer tiers"], previousTitle: ["將已對話的客戶分級", "Score and tier your interviewees"] },
  "02-1": { title: ["試點提案", "Pilot proposals"], previousTitle: ["向 3 位 A 級客戶提出付費試點", "Send paid pilot proposals to three A leads"] },
  "02-2": { title: ["付款證據", "Payment evidence"], previousTitle: ["取得付款或簽約證據", "Obtain payment or signed contract evidence"] },
  "02-3": { title: ["定價條件", "Pricing and terms"], previousTitle: ["確認定價與成交條件", "Confirm pricing and terms"] },
  "03-1": { title: ["每週開發", "Weekly outreach"], previousTitle: ["連續 4 週，每週聯絡 20 家符合標準的公司", "Contact 20 qualified companies weekly for four consecutive weeks"] },
  "03-2": { title: ["管道比較", "Compare channels"], previousTitle: ["比較各管道成效，保留最有效的 2 個", "Compare channels and retain the best two"] },
  "03-3": { title: ["開發手冊", "Acquisition playbook"], previousTitle: ["完成開發流程手冊", "Complete your acquisition playbook"] },
  "04-1": { title: ["取得付費客戶", "Acquire paying customers"], previousTitle: ["取得 5 位付費客戶", "Acquire five paying customers"] },
  "04-2": { title: ["客戶回顧", "Customer reviews"], previousTitle: ["與付費客戶進行使用回顧，確認續約原因", "Review usage and renewal reasons with paying customers"] },
  "04-3": { title: ["續約與營收", "Renewals and revenue"], previousTitle: ["計算續約率與每位客戶帶來的收入", "Calculate renewal rate, revenue per customer and acquisition cost"] },
  "05-1": { title: ["營收目標", "Revenue targets"], previousTitle: ["設定季度營收目標與每週開發量", "Set a quarterly revenue target and weekly activity"] },
  "05-2": { title: ["新市場開發", "New market outreach"], previousTitle: ["進入第二個市場", "Enter a second market"] },
  "05-3": { title: ["市場驗證報告", "Market validation report"], previousTitle: ["產出市場驗證報告，用於募資", "Produce your market validation report"] },
} as const;

export function shortStepTitle(value: string, locale?: string): string | undefined {
  const step = Object.values(STEP_NAMES).find(s => [...s.title, ...s.previousTitle, conversationCopy(s.previousTitle[1])].includes(value));
  if (!step) return undefined;
  const language = locale ?? (value === step.title[0] || value === step.previousTitle[0] ? "zh-tw" : "en");
  return language === "zh-tw" ? step.title[0] : conversationCopy(step.title[1]);
}

export const COMPANY_STAGES = [
  "Idea",
  "Validation",
  "MVP",
  "Early Revenue",
  "Product-Market Fit",
  "Growth",
  "Expansion",
] as const;

export function conversationCopy(value: string) {
  return value.replace(/^Interview (\d+)/, 'Talk with $1')
    .replace(/\binterviewees\b/gi, 'conversation participants').replace(/\binterviewee\b/gi, 'conversation participant')
    .replace(/\binterviews\b/g, 'conversations').replace(/\bInterviews\b/g, 'Conversations')
    .replace(/\binterview\b/g, 'conversation').replace(/\bInterview\b/g, 'Conversation');
}

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
