type Json = Record<string, unknown>;

/**
 * 深度合併 next-intl messages：override 覆蓋 base。
 * - 巢狀物件遞迴合併
 * - override 的「空字串」視為「未覆蓋」，保留 base（避免業主清空欄位導致前台空白）
 * - 其餘非空值（字串 / 數字 / 陣列）直接覆蓋
 */
export function deepMerge(base: Json, override: Json | null | undefined): Json {
  const out: Json = { ...base };
  if (!override) return out;

  for (const key of Object.keys(override)) {
    const o = override[key];
    const b = out[key];
    const oIsObj = o && typeof o === "object" && !Array.isArray(o);
    const bIsObj = b && typeof b === "object" && !Array.isArray(b);

    if (oIsObj && bIsObj) {
      out[key] = deepMerge(b as Json, o as Json);
    } else if (oIsObj) {
      out[key] = deepMerge({}, o as Json);
    } else if (typeof o === "string") {
      if (o.trim() !== "") out[key] = o;
    } else if (o !== undefined && o !== null) {
      out[key] = o;
    }
  }
  return out;
}
