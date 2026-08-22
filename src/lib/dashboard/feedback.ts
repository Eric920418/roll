// 問題回報的共用政策：分類、處理狀態、限流配額。
// 會員端（表單 + 自己的清單）、API 驗證、管理員後台三處共用同一份常數，
// 避免 zod enum 與 UI 下拉選單各寫一份字串而分岔出前端渲染不出來的狀態值。
//
// 注意：此檔會被 client component（回報表單的分類選單）import，
// 故刻意不依賴任何 `server-only` 模組——限流視窗長度直接寫常數，不從 rate-limit.ts 取。

// ── 回報分類 ──
// 順序即表單上的呈現順序。新增分類時，記得補 messages/*.json 的
// Dashboard.feedback.types.<key>（會員端）與下方 TYPE_LABELS_ZH（管理端）。
export const FEEDBACK_TYPES = ["bug", "suggestion", "other"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

// ── 處理狀態（只有管理員能改）──
//   open        剛送出，未處理
//   in_progress 已受理、處理中
//   resolved    已修復 / 已採納
//   wontfix     不予處理（非 bug、重複回報、超出範圍）
export const FEEDBACK_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "wontfix",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** 終局狀態：進入後才蓋 resolvedAt（用來算處理時長 / 清單分組） */
const TERMINAL: ReadonlySet<string> = new Set(["resolved", "wontfix"]);

export function isTerminalStatus(status: string): boolean {
  return TERMINAL.has(status);
}

/** 尚待處理（管理員儀表板紅點用） */
export const PENDING_STATUSES = ["open", "in_progress"] as const;

// ── 濫用護欄 ──
// 此功能刻意不套 requirePlan（免費會員也要能回報 bug），因此付費牆的角色
// 由限流取代：每會員每日上限。落在 src/lib/rate-limit.ts 的 DB 固定視窗上，
// key = `feedback:<userId>`。數字偏寬鬆——寧可多收雜訊，也不要漏掉真 bug。
export const FEEDBACK_LIMIT_PER_DAY = 10;
export const FEEDBACK_WINDOW_MS = 24 * 60 * 60 * 1000;

// ── 管理端顯示字串（後台為單一 admin、中文介面，不走 next-intl）──
export const TYPE_LABELS_ZH: Record<FeedbackType, string> = {
  bug: "Bug 回報",
  suggestion: "功能建議",
  other: "其他",
};

export const STATUS_LABELS_ZH: Record<FeedbackStatus, string> = {
  open: "待處理",
  in_progress: "處理中",
  resolved: "已解決",
  wontfix: "不處理",
};

/** 管理端狀態徽章樣式（Tailwind class） */
export const STATUS_STYLES_ZH: Record<FeedbackStatus, string> = {
  open: "bg-amber-100 text-amber-800 border-amber-300",
  in_progress: "bg-blue-100 text-blue-800 border-blue-300",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  wontfix: "bg-neutral-100 text-neutral-500 border-neutral-300",
};

/** 未知值（例如日後改了 enum 而舊資料殘留）一律當 "other"/"open" 顯示，不讓 UI 炸掉 */
export function toFeedbackType(v: string): FeedbackType {
  return (FEEDBACK_TYPES as readonly string[]).includes(v)
    ? (v as FeedbackType)
    : "other";
}

export function toFeedbackStatus(v: string): FeedbackStatus {
  return (FEEDBACK_STATUSES as readonly string[]).includes(v)
    ? (v as FeedbackStatus)
    : "open";
}
