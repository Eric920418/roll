import "server-only";
import { z } from "zod";
import { ANALYTICS_FEATURES, analyticsPath, type AnalyticsFeature } from "@/lib/analytics";

const origin = "https://analytics.rollon.com.tw";
export const reportQuery = z.object({ days: z.enum(["7", "30", "90"]).default("7"), feature: z.enum(ANALYTICS_FEATURES).default("icp") });
const count = z.number().finite().nonnegative();
const totals = z.object({ pageviews: count, visitors: count, visits: count });
const rows = z.array(z.object({ x: z.string().nullable(), y: count })).max(500);
const series = z.object({ pageviews: z.array(z.object({ x: z.string(), y: count })).max(100) });
const funnelRows = z.array(z.object({ visitors: count })).length(2);
const decimal = z.union([count, z.string().regex(/^\d+(\.\d+)?$/).transform(Number)]).pipe(count);
const duration = z.object({ total: decimal, average: decimal });
export class AnalyticsError extends Error {
  constructor(message: string, public code: string, public status = 503) { super(message); }
}

async function read<T>(website: string, key: string, route: string, params: URLSearchParams, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${origin}/api/websites/${website}/${route}?${params}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new AnalyticsError("Umami 連線失敗或逾時，請稍後重試。", "analytics_unavailable");
  }
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403 ? "Umami 拒絕存取，請檢查伺服器唯讀金鑰及網站權限。" : response.status === 429 ? "Umami 請求過於頻繁，請稍後重試。" : "Umami 暫時無法提供報表，請稍後重試。";
    throw new AnalyticsError(`${message}（上游 HTTP ${response.status}）`, `analytics_upstream_${response.status}`);
  }
  try { return schema.parse(await response.json()); }
  catch { throw new AnalyticsError("Umami 回傳的報表格式不符，請聯絡管理員檢查整合版本。", "analytics_invalid_response"); }
}

// shortcut: each server instance caches for five minutes; use shared caching if reporting traffic grows.
const cache = new Map<string, { expires: number; result: Promise<AnalyticsReport> }>();
export async function analyticsReport(days: number, feature: AnalyticsFeature) {
  const website = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || "", key = process.env.UMAMI_API_KEY || "";
  const started = process.env.UMAMI_COLLECTION_STARTED_AT;
  if (process.env.UMAMI_REPORTS_ENABLED !== "true" || !z.uuid().safeParse(website).success || !key || !started || !Number.isFinite(Date.parse(started))) {
    throw new AnalyticsError("Umami 報表尚未完成設定，追蹤與歷史資料不受影響。", "analytics_not_configured");
  }
  const cacheKey = `${website}:${days}:${feature}`;
  const previous = cache.get(cacheKey);
  if (previous && previous.expires > Date.now()) return previous.result;
  const result = load(website, key, days, feature, started);
  cache.set(cacheKey, { expires: Date.now() + 300000, result });
  if (cache.size > 30) cache.delete(cache.keys().next().value!);
  try { return await result; } catch (error) { cache.delete(cacheKey); throw error; }
}

async function load(website: string, key: string, days: number, feature: AnalyticsFeature, started: string) {
  const endAt = Date.now(), startAt = endAt - days * 86400000;
  const query = new URLSearchParams({ startAt: String(startAt), endAt: String(endAt), timezone: "Asia/Taipei", unit: "day" });
  const get = <T>(route: string, extra: Record<string, string>, schema: z.ZodType<T>) => read(website, key, route, new URLSearchParams({ ...Object.fromEntries(query), ...extra }), schema);
  const [stats, daily, pages, events, funnel, time] = await Promise.all([
    get("stats", {}, totals.extend({ comparison: totals })),
    get("pageviews", {}, series),
    get("metrics", { type: "path", limit: "20" }, rows),
    get("metrics", { type: "event", limit: "100" }, rows),
    get("funnels/stats", { window: "60", steps: JSON.stringify([{ type: "event", value: `${feature}_start` }, { type: "event", value: `${feature}_success` }]) }, funnelRows),
    get("event-data-pivot/numeric-stats", { eventName: "feature_time", propertyName: "seconds", pf_feature: `1.eq.${feature}` }, duration),
  ]);
  const eventCounts = new Map(events.map(row => [row.x, row.y]));
  return {
    days, feature, generatedAt: new Date(endAt).toISOString(), startedAt: started,
    comparable: Date.parse(started) <= startAt - (endAt - startAt),
    stats, daily: daily.pageviews,
    pages: pages.flatMap(row => { const path = row.x && analyticsPath(row.x); return path ? [{ path, views: row.y }] : []; }),
    features: ANALYTICS_FEATURES.map(name => ({ feature: name, starts: eventCounts.get(`${name}_start`) || 0, successes: eventCounts.get(`${name}_success`) || 0, errors: eventCounts.get(`${name}_error`) || 0 })),
    funnel: { started: funnel[0].visitors, completed: funnel[1].visitors }, time,
  };
}
export type AnalyticsReport = Awaited<ReturnType<typeof load>>;
