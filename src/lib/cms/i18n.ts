import type { Locale } from "@/i18n/routing";

/** DB Json 欄位的雙語值形狀 */
export type Localized = { en?: string; "zh-tw"?: string };

/**
 * 從雙語 Json 取出指定語系字串，含 fallback：
 * 指定語系 → en → 空字串。
 */
export function pick(value: unknown, locale: Locale): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const v = value as Record<string, unknown>;
  const primary = v[locale];
  if (typeof primary === "string" && primary.trim() !== "") return primary;
  const en = v.en;
  if (typeof en === "string") return en;
  return "";
}
