import "server-only";
import { getCurrentAccount, type Account } from "@/lib/auth/account";
import { planAtLeast, type PlanKey } from "@/lib/billing/plans";

// 方案 gating。權限一律即時計算（不信 JWT 內的 plan），且套「寬限期」：
// 付費方案只在「本期未過期」且狀態仍授予存取時有效，否則 effective plan 退回 free。
// 這讓我們不必完全依賴 webhook 即時送達（PayPal 偶有漏送 CANCELLED），currentPeriodEnd 過期就自動降級。

// 在 currentPeriodEnd 之前仍授予存取的狀態：
//   ACTIVE     — 正常
//   CANCELLED  — 用戶已取消，但已付到本期末，到期才降級（寬限期）
// 註：PayPal 訂閱沒有 "PAST_DUE" 狀態；扣款失敗會轉為 SUSPENDED，走下方獨立的寬限期邏輯
//     （不吃 currentPeriodEnd，原因見 suspendedGraceEndsAt）。EXPIRED 為終局，不授予存取。
const ACCESS_STATUSES = new Set(["ACTIVE", "CANCELLED"]);

/**
 * 扣款失敗（SUSPENDED）的寬限期長度。
 * 真實情境中最常見的失敗原因是信用卡到期 —— 給 1 天讓客戶更新付款方式，
 * 避免長期付費的客戶在收到通知前就先失去 Dashboard 存取。
 */
export const SUSPENDED_GRACE_MS = 24 * 60 * 60 * 1000; // 1 天

/**
 * SUSPENDED 寬限期的到期時刻；非 SUSPENDED 或無起算點回 null（UI 也用此值顯示倒數）。
 *
 * 起算點刻意用 `planUpdatedAt`（狀態最後異動時間 = 轉入 SUSPENDED 的時刻），
 * **不是** `currentPeriodEnd` —— 扣款失敗的時間點正是本期到期日，故 SUSPENDED 時
 * `currentPeriodEnd` 必然已過期；且 PayPal 轉 SUSPENDED 前會先重試扣款數天，
 * 若用 `currentPeriodEnd` 當起點，寬限期會在 SUSPENDED 事件送達前就已過完＝完全沒有寬限。
 *
 * 依賴前提：`reconcile` 只在 plan/status 真的變化時才更新 `planUpdatedAt`，
 * 否則重複送達的 webhook 會不斷刷新起算點、把寬限期無限延長。
 */
export function suspendedGraceEndsAt(account: Account | null): Date | null {
  if (!account || account.subscriptionStatus !== "SUSPENDED") return null;
  if (account.planUpdatedAt == null) return null;
  return new Date(account.planUpdatedAt.getTime() + SUSPENDED_GRACE_MS);
}

/**
 * 是否仍在 SUSPENDED 寬限期內（含 now 比較）。
 * 時間比較刻意收在此處：server component 的 render body 直接呼叫 Date.now()
 * 會違反 react-hooks/purity，且判斷邏輯只該有一份。
 */
export function suspendedGraceActive(account: Account | null): boolean {
  const endsAt = suspendedGraceEndsAt(account);
  return endsAt != null && endsAt.getTime() > Date.now();
}

/**
 * 計算帳號的「有效方案」（純函式，套寬限期）。
 * - free → free
 * - enterprise → enterprise（由站方手動設定，不經 PayPal，直接信任）
 * - pro/business → ACTIVE/CANCELLED 需本期未過期；SUSPENDED 走 1 天寬限期；其餘退回 free
 */
export function getEffectivePlan(account: Account | null): PlanKey {
  if (!account) return "free";
  if (account.plan === "free") return "free";
  if (account.plan === "enterprise") return "enterprise";

  const status = account.subscriptionStatus;
  if (status == null) return "free";

  // 扣款失敗：不看 currentPeriodEnd（必已過期），改看寬限期是否仍在有效期內
  if (status === "SUSPENDED") {
    return suspendedGraceActive(account) ? account.plan : "free";
  }

  const periodOk =
    account.currentPeriodEnd != null &&
    account.currentPeriodEnd.getTime() > Date.now();

  return periodOk && ACCESS_STATUSES.has(status) ? account.plan : "free";
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
