// Investor Portal 逐欄位隱藏的政策單一事實來源。
//
// 此檔會被 client component（InvestorPortalManager）import，
// 故刻意不依賴任何 server-only 模組 —— 比照 src/lib/dashboard/feedback.ts。
//
// 兩層隱藏的分工：
//   1. InvestorPortal.share*    — section 級，Business 以上可編輯（既有功能，不動）
//   2. InvestorPortal.hiddenFields + 各 item 的 hidden — 欄位／單筆級，Enterprise 才可編輯
//
// 關鍵規則：這裡定義的是「誰能改」，不是「何時生效」。
// 隱藏設定一律在 getInvestorView() 無條件套用，與擁有者當下的方案無關。
// 否則 Enterprise 降級成 Business 的瞬間，刻意藏起來的種子資金／營收
// 會突然對所有已接受邀請的投資人曝光 —— 那是資料外洩，不是降級。

import { planAtLeast, type PlanKey } from "@/lib/billing/plans";

/**
 * 可逐欄位隱藏的 key 白名單。
 *
 * 命名用「對外語意」而非 DB 欄位名：
 *   profile.companyAge   ← OnboardingProfile.timeline（欄位已改義為公司年資）
 *   profile.seedFunding  ← OnboardingProfile.budgetRange（欄位已改義為種子資金）
 * 見 src/components/auth/onboarding-options.ts:32。
 */
export const INVESTOR_HIDEABLE_FIELDS = [
  // 公司檔案
  "profile.industry",
  "profile.companySize",
  "profile.country",
  "profile.website",
  "profile.targetMarkets",
  "profile.companyAge",
  "profile.seedFunding",
  "profile.needs",
  "profile.notes",
  // 階段與瓶頸
  "strategy.stage",
  "strategy.bottleneck",
  // Action Plan
  "actionPlan.nextMoves",
  "actionPlan.progress",
  "actionPlan.allActions",
] as const;

export type InvestorHideableField = (typeof INVESTOR_HIDEABLE_FIELDS)[number];

/** 對應 portal.share* 的分組，供 owner 端 UI 依 section 摺疊顯示。 */
export const HIDEABLE_FIELD_GROUPS = [
  {
    /** 對應 InvestorPortal 的 share 開關名；該開關關閉時整組欄位無意義 */
    shareKey: "shareProfile",
    fields: [
      "profile.industry",
      "profile.companySize",
      "profile.country",
      "profile.website",
      "profile.targetMarkets",
      "profile.companyAge",
      "profile.seedFunding",
      "profile.needs",
      "profile.notes",
    ],
  },
  {
    shareKey: "shareStrategy",
    fields: ["strategy.stage", "strategy.bottleneck"],
  },
  {
    shareKey: "shareActionPlan",
    fields: ["actionPlan.nextMoves", "actionPlan.progress", "actionPlan.allActions"],
  },
] as const satisfies ReadonlyArray<{
  shareKey: string;
  fields: ReadonlyArray<InvestorHideableField>;
}>;

/** 編輯逐欄位／單筆隱藏所需的最低方案。注意：只約束「編輯」，不約束「生效」。 */
export const FIELD_VISIBILITY_MIN_PLAN: PlanKey = "enterprise";

/**
 * 方案不足時回給前端的訊息。放在政策層而非 route，
 * 是因為兩條 route 都要用，而使用者看到的文案不該有兩份。
 */
export const FIELD_VISIBILITY_FORBIDDEN =
  "逐欄位隱藏為 Enterprise 方案功能。現有的隱藏設定仍然生效，但需要 Enterprise 才能修改。";

export const ITEM_VISIBILITY_FORBIDDEN =
  "逐筆隱藏為 Enterprise 方案功能。現有的隱藏設定仍然生效，但需要 Enterprise 才能修改。";

/** 這個方案能不能「修改」隱藏設定。 */
export function canEditFieldVisibility(plan: PlanKey): boolean {
  return planAtLeast(plan, FIELD_VISIBILITY_MIN_PLAN);
}

/** 欄位是否被隱藏。無條件呼叫，不看方案。 */
export function isFieldHidden(
  hiddenFields: readonly string[],
  key: InvestorHideableField,
): boolean {
  return hiddenFields.includes(key);
}

const FIELD_SET: ReadonlySet<string> = new Set(INVESTOR_HIDEABLE_FIELDS);

/**
 * 把任意輸入濾成合法 key（去重、去未知值）。
 *
 * 未知 key 靜默丟棄而非報錯：DB 裡可能留著上一版程式寫入、本版已移除的 key，
 * 讀取路徑若為此丟例外，會讓整個投資人頁 500 —— 讀取要寬容，寫入才嚴格
 * （寫入端由 validation.ts 的 z.enum 白名單擋下，未知 key 會回 400）。
 */
export function toHideableFields(values: unknown): InvestorHideableField[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values)].filter(
    (value): value is InvestorHideableField =>
      typeof value === "string" && FIELD_SET.has(value),
  );
}
