import "server-only";
import { getCurrentAccount, type Account } from "@/lib/auth/account";
import { planAtLeast, type PlanKey } from "@/lib/billing/plans";

// 方案 gating。權限一律即時計算（不信 JWT 內的 plan），且套「寬限期」：
// 付費方案只在「本期未過期」且狀態仍授予存取時有效，否則 effective plan 退回 free。
// 這讓我們不必完全依賴 webhook 即時送達（PayPal 偶有漏送 CANCELLED），currentPeriodEnd 過期就自動降級。

// 在 currentPeriodEnd 之前仍授予存取的狀態：
//   ACTIVE     — 正常
//   CANCELLED  — 用戶已取消，但已付到本期末，到期才降級（寬限期）
// 註：PayPal 訂閱沒有 "PAST_DUE" 狀態；扣款失敗會轉為 SUSPENDED，我們刻意「不」給寬限
//     （付款失敗即降級為安全預設）。故此集合不含 SUSPENDED / EXPIRED。
const ACCESS_STATUSES = new Set(["ACTIVE", "CANCELLED"]);

/**
 * 計算帳號的「有效方案」（純函式，套寬限期）。
 * - free → free
 * - enterprise → enterprise（由站方手動設定，不經 PayPal，直接信任）
 * - pro/business → 僅當本期未過期且狀態授予存取時有效，否則 free
 */
export function getEffectivePlan(account: Account | null): PlanKey {
  if (!account) return "free";
  if (account.plan === "free") return "free";
  if (account.plan === "enterprise") return "enterprise";

  const periodOk =
    account.currentPeriodEnd != null &&
    account.currentPeriodEnd.getTime() > Date.now();
  const statusOk =
    account.subscriptionStatus != null &&
    ACCESS_STATUSES.has(account.subscriptionStatus);

  return periodOk && statusOk ? account.plan : "free";
}

/** 取目前登入會員的有效方案（未登入回 free） */
export async function getUserPlan(): Promise<PlanKey> {
  const account = await getCurrentAccount();
  return getEffectivePlan(account);
}

/**
 * 要求至少達到 min 階級。
 * 達標回 account；未登入或方案不足回 null（頁面應 redirect / API 回 403）。
 */
export async function requirePlan(min: PlanKey): Promise<Account | null> {
  const account = await getCurrentAccount();
  if (!account) return null;
  return planAtLeast(getEffectivePlan(account), min) ? account : null;
}
