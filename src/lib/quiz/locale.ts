import type { Locale } from "@/i18n/routing";

// DB 雙語 Json 取值：{ en, "zh-tw" } 依 locale 取字串；缺值回退 en → 任一 → 空字串。
// 參數放寬為 unknown 以直接吃 Prisma JsonValue。
export function pick(value: unknown, locale: Locale): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return "";
  const v = value as Record<string, unknown>;
  const hit = v[locale] ?? v.en ?? Object.values(v)[0];
  return typeof hit === "string" ? hit : "";
}

// 雙語字串陣列：{ en:[...], "zh-tw":[...] } 或直接陣列。
export function pickArr(value: unknown, locale: Locale): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  const v = value as Record<string, unknown>;
  const arr = v[locale] ?? v.en ?? [];
  return Array.isArray(arr) ? arr.map(String) : [];
}
