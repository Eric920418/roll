import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const require = createRequire(import.meta.url);
function service(fetcher?: typeof fetch, env = {}) {
  const compiled = { exports: {} as typeof import("../src/lib/admin/analytics") };
  runInNewContext(ts.transpileModule(readFileSync("src/lib/admin/analytics.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: compiled, exports: compiled.exports, require: (id: string) => id === "server-only" ? {} : id === "@/lib/analytics" ? require("../src/lib/analytics") : require(id),
    process: { env: { UMAMI_REPORTS_ENABLED: "true", NEXT_PUBLIC_UMAMI_WEBSITE_ID: "00000000-0000-4000-8000-000000000001", UMAMI_API_KEY: "private-test-key", UMAMI_COLLECTION_STARTED_AT: "2026-11-04T00:00:00.000Z", ...env } },
    URLSearchParams, Date, AbortSignal, fetch: fetcher,
  });
  return compiled.exports;
}
const totals = { pageviews: 12, visitors: 3, visits: 5 };
function provider(url: string) {
  const query = new URL(url);
  if (query.pathname.endsWith("/stats") && !query.pathname.includes("funnels") && !query.pathname.includes("numeric")) return { ...totals, comparison: totals };
  if (query.pathname.endsWith("/pageviews")) return { pageviews: [{ x: "2026-11-04 00:00:00", y: 12 }] };
  if (query.pathname.endsWith("/funnels/stats")) return [{ visitors: 3 }, { visitors: 2 }];
  if (query.pathname.endsWith("/numeric-stats")) return { total: "120.0000", average: "30.0000" };
  if (query.searchParams.get("type") === "path") return [{ x: "/dashboard/profile?private=test", y: 9 }, { x: "/admin/users", y: 3 }];
  return [{ x: "icp_start", y: 4 }, { x: "icp_success", y: 2 }, { x: "icp_error", y: 1 }, { x: "secret-unknown", y: 3 }];
}

test("Umami 報表限制期間及固定功能，不接受任意查詢來源", () => {
  const api = service();
  assert.deepEqual({ ...api.reportQuery.parse({}) }, { days: "7", feature: "icp" });
  assert.throws(() => api.reportQuery.parse({ days: "999", feature: "private" }));
});

test("Umami API 僅伺服器授權、去除私人路徑、原生漏斗及停留統計，並快取並行請求", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = service(async (url, init) => { calls.push({ url: String(url), init }); return Response.json(provider(String(url))); });
  const [a, b] = await Promise.all([api.analyticsReport(7, "icp"), api.analyticsReport(7, "icp")]);
  assert.equal(calls.length, 6); assert.equal(a, b);
  assert.equal(a.funnel.started, 3); assert.equal(a.funnel.completed, 2);
  assert.equal(a.time.average, 30); assert.equal(a.comparable, false);
  assert.equal(a.pages.length, 1); assert.equal(a.pages[0].path, "/dashboard/profile");
  assert.equal(a.features.find(row => row.feature === "icp")?.errors, 1);
  assert.doesNotMatch(JSON.stringify(a), /private-test-key|secret-unknown|private=test/);
  for (const call of calls) {
    assert.equal(new URL(call.url).origin, "https://analytics.rollon.com.tw");
    assert.equal(new URL(call.url).searchParams.get("timezone"), "Asia/Taipei");
    assert.equal(call.init?.redirect, "error");
    assert.equal((call.init?.headers as Record<string, string>).Authorization, "Bearer private-test-key");
  }
  const timeCall = calls.find(call => call.url.includes("numeric-stats"))!;
  assert.equal(new URL(timeCall.url).searchParams.get("pf_feature"), "1.eq.icp");
});

test("Umami 缺設定不呼叫供應商；失敗不快取，安全顯示上游狀態而不洩漏回應與金鑰", async () => {
  let calls = 0;
  const disabled = service(async () => { calls++; throw Error("secret"); }, { UMAMI_REPORTS_ENABLED: "false" });
  await assert.rejects(disabled.analyticsReport(7, "icp"), /尚未完成設定/); assert.equal(calls, 0);
  const api = service(async () => { calls++; return new Response("credential-secret", { status: 403 }); });
  await assert.rejects(api.analyticsReport(7, "icp"), error => error instanceof api.AnalyticsError && error.code === "analytics_upstream_403" && !error.message.includes("credential-secret"));
  const first = calls;
  await assert.rejects(api.analyticsReport(7, "icp")); assert.ok(calls > first);
});

test("Umami 連線與錯誤格式清楚區分，不把錯誤當成零流量", async () => {
  const unavailable = service(async () => { throw Error("private-host/key"); });
  await assert.rejects(unavailable.analyticsReport(7, "icp"), /連線失敗或逾時/);
  const malformed = service(async () => Response.json({ unexpected: "private" }));
  await assert.rejects(malformed.analyticsReport(7, "icp"), /報表格式不符/);
});

test("Umami 報表 API 未登入前不讀取數據，且管理員頁雙重驗證", async () => {
  const compiled = { exports: {} as { GET: (request: Request) => Promise<Response> } };
  runInNewContext(ts.transpileModule(readFileSync("src/app/api/admin/analytics/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: compiled, exports: compiled.exports, require: (id: string) => {
      if (id === "@/lib/auth/guard") return { getAdminSession: async () => null };
      if (id === "@/lib/api") return { unauthorized: () => Response.json({ error: "未授權" }, { status: 401 }) };
      return {};
    }, Response,
  });
  assert.equal((await compiled.exports.GET(new Request("https://rollon.com.tw/api/admin/analytics"))).status, 401);
  assert.match(readFileSync("src/app/admin/(dashboard)/analytics/page.tsx", "utf8"), /await requireAdminPage\(\)/);
});

test("管理員數據介面提供空載入狀態且不包含伺服器金鑰或公開 iframe", () => {
  const compiled = { exports: {} as { default: () => import("react").ReactNode } };
  runInNewContext(ts.transpileModule(readFileSync("src/components/admin/AnalyticsDashboard.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: compiled, exports: compiled.exports, require: (id: string) => id === "@/lib/analytics" ? require("../src/lib/analytics") : id === "@/lib/member-fetch" ? {} : require(id),
  });
  const html = renderToStaticMarkup(createElement(compiled.exports.default));
  assert.match(html, /數據分析/); assert.match(html, /正在讀取 Umami 數據/);
  assert.doesNotMatch(html, /UMAMI_API_KEY|<iframe/);
});
