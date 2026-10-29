export const ANALYTICS_FEATURES = ["matchmaking", "chat_invite", "chat_accept", "icp", "interview", "prospects", "rewards", "feedback", "trial_incentive", "upgrade"] as const;
export type AnalyticsFeature = typeof ANALYTICS_FEATURES[number];
type AnalyticsData = { feature: AnalyticsFeature; outcome?: "empty" | "validation" | "permission" | "limit" | "service" | "network"; seconds?: number };
export function analyticsPath(path: string): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) {
    try { const url = new URL(path); if (!["www.rollgrp.com", "rollgrp.com"].includes(url.hostname)) return null; path = url.pathname; }
    catch { return null; }
  }
  const clean = path.split(/[?#]/)[0]!.replace(/^\/zh-tw(?=\/|$)/, "") || "/";
  if (/^\/dashboard\/matchmaking\/[^/]+$/.test(clean)) return "/dashboard/matchmaking/:member";
  if (/^\/investor\/[^/]+$/.test(clean)) return "/investor/:company";
  return ["/", "/product", "/about", "/contact", "/dashboard", "/dashboard/matchmaking", "/dashboard/messages", "/dashboard/profile", "/dashboard/account", "/dashboard/agenda", "/dashboard/customer-insights", "/dashboard/rewards", "/dashboard/feedback", "/dashboard/business-plan", "/dashboard/milestones", "/dashboard/insights"].includes(clean) ? clean : null;
}
export function safeAnalyticsPayload(type: string, payload: Record<string, unknown>) {
  if (type !== "event") return null;
  const path = analyticsPath(typeof payload.url === "string" ? payload.url : "");
  if (!path) return null;
  const raw = payload.data as Partial<AnalyticsData> | undefined;
  const data: Record<string, string | number> = {};
  if (raw?.feature && ANALYTICS_FEATURES.includes(raw.feature)) data.feature = raw.feature;
  if (raw?.outcome && ["empty", "validation", "permission", "limit", "service", "network"].includes(raw.outcome)) data.outcome = raw.outcome;
  if (typeof raw?.seconds === "number" && Number.isFinite(raw.seconds)) data.seconds = Math.round(Math.max(0, Math.min(raw.seconds, 3600)));
  const referrer = typeof payload.referrer === "string" && payload.referrer.startsWith("/") ? analyticsPath(payload.referrer) || "" : "";
  const allowed = ["flow_start", "flow_success", "flow_error", "search_empty", "card_open", "feature_time", ...ANALYTICS_FEATURES.flatMap(feature => ["start", "success", "error"].map(outcome => `${feature}_${outcome}`))];
  const name = payload.name === undefined ? undefined : allowed.includes(String(payload.name)) ? payload.name : null;
  if (name === null || name && !data.feature) return null;
  return { website: payload.website, hostname: payload.hostname, language: payload.language, screen: payload.screen, url: path, title: path, referrer, ...(name ? { name, data } : {}) };
}
type Tracker = { track: (name: string, data: AnalyticsData) => unknown };
export function track(event: "flow_start" | "flow_success" | "flow_error" | "search_empty" | "card_open" | "feature_time", data: AnalyticsData) {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_UMAMI_ENABLED !== "true") return;
  try { void Promise.resolve((window as unknown as { umami?: Tracker }).umami?.track(event.startsWith("flow_") ? `${data.feature}_${event.slice(5)}` : event, data)).catch(() => {}); } catch { /* Analytics must never block product actions. */ }
}
export const analyticsError = (status: number): NonNullable<AnalyticsData["outcome"]> => status === 400 || status === 409 ? "validation" : status === 401 || status === 402 || status === 403 ? "permission" : status === 429 ? "limit" : status >= 500 ? "service" : "network";

export function engagementInterval(from: number, to: number, lastActive: number, visible: boolean) {
  return visible ? Math.max(0, Math.min(to, lastActive + 60000) - from) : 0;
}

export function requestFeature(url: string, init?: RequestInit): AnalyticsFeature | null {
  const method = init?.method?.toUpperCase() || "GET", path = url.split("?")[0];
  if (method === "GET" || method === "DELETE") return null;
  let action = "", prospectCount = 0;
  try { if (typeof init?.body === "string") { const body = JSON.parse(init.body); action = typeof body?.action === "string" ? body.action : ""; prospectCount = typeof body?.prospectCount === "number" ? body.prospectCount : 0; } } catch { /* Only fixed action names are used. */ }
  if (path === "/api/customer-insights") return "interview";
  if (path === "/api/account/icp") return "icp";
  if (path === "/api/discovery/analyse" && [6, 10].includes(prospectCount)) return "prospects";
  if (path === "/api/rewards/redeem") return "rewards";
  if (path === "/api/billing/subscribe") return "upgrade";
  if (path === "/api/network/connections") return "chat_invite";
  if (/^\/api\/network\/connections\/[^/]+$/.test(path!) && action === "accept") return "chat_accept";
  return null;
}
export async function analyticsFetch(url: string, init?: RequestInit) {
  const feature = requestFeature(url, init);
  if (feature) track("flow_start", { feature });
  try {
    const response = await fetch(url, init);
    if (feature) track(response.ok ? "flow_success" : "flow_error", { feature, ...(!response.ok ? { outcome: analyticsError(response.status) } : {}) });
    return response;
  } catch (error) { if (feature && !(error instanceof Error && error.name === "AbortError")) track("flow_error", { feature, outcome: "network" }); throw error; }
}
