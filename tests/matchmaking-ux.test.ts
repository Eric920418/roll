import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { countryCode, countryLabel, canonicalCountry, industryCode } from "../src/lib/member-options";
import { listingSchema, matchesPublicCard, publicCard } from "../src/lib/matchmaking/schema";
import { simpleTrialAnswersSchema, trialIncentiveEnd, trialFeedbackCsv } from "../src/lib/dashboard/next-steps";
import { analyticsPath, safeAnalyticsPayload, engagementInterval, requestFeature } from "../src/lib/analytics";
import { visitorPeriods } from "../src/lib/network/policy";

test("Credential forms always use POST before hydration so secrets cannot enter the URL", () => {
  for (const file of ["src/components/auth/LoginForm.tsx", "src/components/auth/SignupForm.tsx", "src/components/dashboard/AccountSecurityForm.tsx"]) {
    const source = readFileSync(file, "utf8"), forms = [...source.matchAll(/<form\b([^>]+)>/g)];
    assert(forms.length > 0); for (const form of forms) assert.match(form[1]!, /method="post"/);
  }
});

test("Country and industry aliases are deterministic and unknown legacy values are retained", () => {
  for (const value of [" TW ", "Taiwan", "台灣", "臺灣", "ＴＷ"]) assert.equal(countryCode(value), "TW");
  assert.equal(countryCode("United States of America"), "US"); assert.equal(countryCode("UK"), "GB");
  assert.equal(countryCode("Imaginary country"), null); assert.equal(canonicalCountry("Old entry"), "Old entry");
  assert.equal(countryLabel("TW", "zh-tw"), "台灣"); assert.equal(countryLabel("TW"), "Taiwan");
  assert.equal(industryCode("SaaS"), "saas"); assert.equal(industryCode("金融科技"), "fintech");
  assert.equal(listingSchema.safeParse({ country: "Invalid" }).success, false);
  assert.equal(listingSchema.safeParse({ q: "x".repeat(101) }).success, false);
});
test("Public search cannot discover hidden company data and combines normalized filters", () => {
  const card = publicCard({ id: "card", sourcePolicy: 2, role: "founder", categories: ["collaboration"], country: "", industry: "", slogan: "Visible pitch", offers: "", looksFor: "", visibleFields: ["slogan"], lastActiveAt: null, verified: false, recommended: false }, { companyName: "Example", country: "TW", industry: "saas", oneLinePitch: "Secret pitch", icp: "Secret customer", targetMarkets: [] }, { interviews: 0, payingCustomers: null, milestones: 0 }, null);
  for (const q of ["Secret", "Taiwan", "SaaS"]) assert.equal(matchesPublicCard(card, { q, country: "", industry: "" }), false);
  assert(matchesPublicCard(card, { q: "ＥＸＡＭＰＬＥ visible", country: "", industry: "" }));
  assert(!matchesPublicCard(card, { q: "", country: "TW", industry: "" }));
  assert(matchesPublicCard({ ...card, country: "Taiwan", industry: "SaaS" }, { q: "台灣 軟體", country: "TW", industry: "saas" }));
});
test("Simple survey has fixed reasons, safe CSV, and exactly 72-hour extension", () => {
  assert(simpleTrialAnswersSchema.safeParse({ liked: "yes" }).success);
  assert(!simpleTrialAnswersSchema.safeParse({ liked: "no" }).success);
  assert(!simpleTrialAnswersSchema.safeParse({ liked: "no", reason: "custom" }).success);
  assert.equal(simpleTrialAnswersSchema.parse({ liked: "yes", reason: "price" }).reason, null);
  const now = new Date("2026-10-29T01:00:00Z"), future = new Date("2026-11-05T01:00:00Z");
  assert.equal(trialIncentiveEnd(future, now).toISOString(), "2026-11-08T01:00:00.000Z");
  assert.equal(trialIncentiveEnd(new Date("2026-10-01T00:00:00Z"), now).toISOString(), "2026-11-01T01:00:00.000Z");
  const csv = trialFeedbackCsv([{ email: "qa@example.invalid", createdAt: now.toISOString(), answers: { liked: "no", reason: "price" }, version: 3, grantedEndsAt: future.toISOString() }]);
  assert(csv.includes('"3","no","price","2026-11-05T01:00:00.000Z"'));
});
test("Analytics strips private paths, text, query strings, referrers and arbitrary event data", () => {
  assert.equal(analyticsPath("https://rollon.com.tw/zh-tw/dashboard/profile?q=secret"), "/dashboard/profile");
  assert.equal(analyticsPath("https://www.rollgrp.com/zh-tw/dashboard/matchmaking/private-id?q=Secret"), "/dashboard/matchmaking/:member");
  assert.equal(analyticsPath("https://example.com/product"), null);
  assert.equal(analyticsPath("/zh-tw/dashboard/matchmaking/private-id?q=Secret"), "/dashboard/matchmaking/:member");
  for (const path of ["/api/secret", "/admin/users", "/network/unsubscribe", "/login?email=secret"]) assert.equal(analyticsPath(path), null);
  const payload = safeAnalyticsPayload("event", { website: "id", hostname: "www.rollgrp.com", url: "/dashboard/profile?email=secret", title: "Secret company", referrer: "https://example.com/private", name: "flow_success", data: { feature: "icp", text: "Secret answer", seconds: 10 }, email: "secret@example.com", distinctId: "member-id" });
  assert(payload); assert.doesNotMatch(JSON.stringify(payload), /Secret|secret|member-id|distinctId|example.com/);
  assert.equal(safeAnalyticsPayload("event", { url: "/admin", name: "flow_start", data: { feature: "icp" } }), null);
  assert.equal(safeAnalyticsPayload("event", { url: "/dashboard", name: "arbitrary secret" }), null);
  assert.equal(safeAnalyticsPayload("identify", { url: "/dashboard" }), null);
  assert.equal(requestFeature("/api/discovery/analyse", { method: "POST", body: JSON.stringify({ prospectCount: 6, company: "Private" }) }), "prospects");
  assert.equal(requestFeature("/api/network/connections/id", { method: "PATCH", body: '{"action":"accept"}' }), "chat_accept");
  assert.equal(requestFeature("/api/account/icp", { method: "PATCH", body: '{"action":"save"}' }), "icp");
  assert.equal(requestFeature("/api/account/icp", { method: "POST", body: '{"action":"answer"}' }), null);
  assert.equal(requestFeature("/api/network/connections/id/messages", { method: "POST", body: '{"body":"Private"}' }), null);
});
test("Early actions wait for the tracker and retain the sanitized source route across navigation", () => {
  const compiled = { exports: {} }, browser: { location: { href: string }; umami?: { track: (build: (defaults: object) => object) => void } } = { location: { href: "https://www.rollgrp.com/dashboard/matchmaking/private-id?q=secret" } };
  runInNewContext(ts.transpileModule(readFileSync("src/lib/analytics.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: compiled, exports: compiled.exports, window: browser, process: { env: { NEXT_PUBLIC_UMAMI_ENABLED: "true" } }, URL, Date, Promise });
  const analytics = compiled.exports as typeof import("../src/lib/analytics"), events: object[] = [];
  analytics.track("flow_start", { feature: "chat_invite" });
  browser.location.href = "https://www.rollgrp.com/login?password=secret";
  browser.umami = { track: build => { events.push(build({ url: browser.location.href, title: "Private" })); } };
  analytics.flushAnalytics(); analytics.flushAnalytics();
  assert.equal(events.length, 1); assert.equal((events[0] as { url: string }).url, "/dashboard/matchmaking/:member");
  assert.doesNotMatch(JSON.stringify(analytics.safeAnalyticsPayload("event", events[0] as Record<string, unknown>)), /private-id|secret|Private/);
  analytics.track("flow_start", { feature: "icp" }); assert.equal(events.length, 1, "Private routes do not enter the queue");
});

test("Engagement excludes hidden and idle time; Taipei comparison uses identical week elapsed time", () => {
  assert.equal(engagementInterval(0, 90000, 0, true), 60000);
  assert.equal(engagementInterval(60000, 90000, 0, true), 0);
  assert.equal(engagementInterval(0, 30000, 0, false), 0);
  const p = visitorPeriods(new Date("2026-11-01T16:30:00Z"));
  assert.equal(p.week, "2026-11-02"); assert.equal(p.previousWeek, "2026-10-26");
  assert.equal(p.previousCutoff.getTime() - p.previousStart.getTime(), 30 * 60000);
});

test("UX transactions on isolated PostgreSQL: search, weekly stats, one-time extension, quotas and rollback", async t => {
  const url = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
  if (!url) { t.skip("Isolated QA PostgreSQL required"); return; }
  const parsed = new URL(url); assert(["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }), ids: string[] = [], suffix = randomUUID();
  const req = createRequire(import.meta.url), modules = new Map<string, unknown>();
  class WriteError extends Error { constructor(text: string, public status = 409) { super(text); } }
  let failGrant = false;
  const database = new Proxy(db, { get(target, key) { if (key !== "$transaction") { const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value; } return async (work: (tx: unknown) => unknown, options?: object) => target.$transaction(async tx => work(new Proxy(tx, { get(value, name) { if (name === "trialFeedbackGrant" && failGrant) return { ...tx.trialFeedbackGrant, create: async () => { throw new Error("Injected grant failure"); } }; return Reflect.get(value, name); } })), options); } });
  const mocks: Record<string, unknown> = { "server-only": {}, "@/lib/prisma": { prisma: database }, "@/lib/auth/account": { getBetaAccess: async () => false }, "@/lib/member-http": { MemberError: WriteError, changed: () => new WriteError("changed") }, "@/lib/rate-limit": { DAY_MS: 86400000, checkRateLimit: async () => ({ ok: true }) }, "@anthropic-ai/sdk": class { constructor() { throw new Error("Unexpected paid AI"); } } };
  function load<T>(file: string): T {
    const path = resolve(file); if (modules.has(path)) return modules.get(path) as T;
    const value = { exports: {} }; modules.set(path, value.exports);
    runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: value, exports: value.exports, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(resolve(dirname(path), `${id}.ts`)) : req(id), Date, Intl, console, process: { cwd: () => process.cwd(), env: { ...process.env, MEMBER_NETWORK_ENABLED: "true", BILLING_REQUIRE_EXPLICIT_ENTITLEMENT: "true" } }, Buffer, URL, Response, Request, Error, Set, Map, setTimeout });
    return value.exports as T;
  }
  const feedback = load<typeof import("../src/lib/dashboard/trial-feedback")>("src/lib/dashboard/trial-feedback.ts"), cards = load<typeof import("../src/lib/matchmaking/service")>("src/lib/matchmaking/service.ts"), network = load<typeof import("../src/lib/network/service")>("src/lib/network/service.ts"), ai = load<typeof import("../src/lib/ai/allowance")>("src/lib/ai/allowance.ts");
  const now = new Date(), start = new Date(now.getTime() - 70 * 86400000), end = new Date(start.getTime() + 14 * 86400000);
  async function user(data: object = {}) { const row = await db.user.create({ data: { email: `ux-${suffix}-${ids.length}@example.invalid`, ...data } }); ids.push(row.id); return row; }
  const base = { trialPlan: "business", trialStartsAt: start, trialEndsAt: end };
  try {
    const owner = await user({ plan: "business", subscriptionStatus: "ACTIVE", paypalSubscriptionId: `qa-${suffix}`, currentPeriodEnd: new Date(now.getTime() + 86400000) });
    await t.test("Search runs before pagination and excludes hidden fields and mismatched filters", async () => {
      for (let i = 0; i < 27; i++) {
        const row = await user();
        await db.matchmakingProfile.create({ data: { userId: row.id, role: "founder", categories: ["collaboration"], visible: true, country: "Taiwan", industry: "SaaS", slogan: `${suffix} public ${i}`, offers: "", looksFor: "", visibleFields: ["country", "industry", "slogan"] } });
      }
      const first = await cards.listCards(owner.id, "collaboration", 1, { q: suffix, role: "founder", country: "TW", industry: "saas" });
      const second = await cards.listCards(owner.id, "collaboration", 2, { q: suffix, role: "founder", country: "TW", industry: "saas" });
      assert.equal(first.cards.length, 24); assert.equal(first.hasMore, true); assert.equal(second.cards.length, 3); assert.equal(second.hasMore, false);
      assert.equal(new Set([...first.cards, ...second.cards].map(v => v.id)).size, 27);
      assert.equal((await cards.listCards(owner.id, "investors", 1, { q: suffix })).cards.length, 0);
      await db.matchmakingProfile.updateMany({ where: { userId: { in: ids } }, data: { visibleFields: ["slogan"] } });
      assert.equal((await cards.listCards(owner.id, "all", 1, { q: suffix, country: "TW" })).cards.length, 0);
    });
    await t.test("Manual cards use selected needs without requiring optional free text", async () => {
      const member = await user();
      await db.matchmakingProfile.create({ data: { userId: member.id, role: "founder", categories: ["collaboration"], country: "TW", industry: "saas", slogan: "QA founder", offers: "QA help", looksFor: "Old detail", visibleFields: [], visible: false } });
      const card = await cards.getMyCard(member.id);
      const updated = await cards.writeMyCard(member.id, { action: "save", revision: card.revision, requestId: randomUUID(), draft: { ...card.draft, looksFor: "", categories: ["investors"] } });
      assert.equal(updated.draft.looksFor, ""); assert.deepEqual([...updated.draft.categories], ["investors"]);
    });
    await t.test("Anonymous weekly totals compare the same cutoff and exclude later last-week visits", async () => {
      const p = visitorPeriods(now), original = await db.setting.findUnique({ where: { key: "member_network_v2_snapshot" } });
      try {
        await db.setting.upsert({ where: { key: "member_network_v2_snapshot" }, create: { key: "member_network_v2_snapshot", value: new Date(p.previousStart.getTime() - 1).toISOString() }, update: { value: new Date(p.previousStart.getTime() - 1).toISOString() } });
        await db.memberVisit.createMany({ data: [{ viewerId: ids[1]!, ownerId: owner.id, week: p.week, role: "founder", createdAt: now }, { viewerId: ids[2]!, ownerId: owner.id, week: p.previousWeek, role: "founder", createdAt: new Date(p.previousCutoff.getTime() - 1) }, { viewerId: ids[3]!, ownerId: owner.id, week: p.previousWeek, role: "investor", createdAt: new Date(p.previousCutoff.getTime() + 1) }] });
        let stats = await network.visitorSummary(owner.id, p.week, now);
        assert.equal(stats.founders, 1); assert.equal(stats.previous.founders, 1); assert.equal(stats.previous.investors, 0); assert.equal(stats.comparable, true); assert.doesNotMatch(JSON.stringify(stats), /viewerId|email|userId/);
        await db.setting.update({ where: { key: "member_network_v2_snapshot" }, data: { value: now.toISOString() } });
        stats = await network.visitorSummary(owner.id, p.week, now); assert.equal(stats.comparable, false);
      } finally { if (original) await db.setting.update({ where: { key: original.key }, data: { value: original.value! } }); else await db.setting.delete({ where: { key: "member_network_v2_snapshot" } }); }
    });
    const trial = await user(base);
    await db.aiAllowance.create({ data: { userId: trial.id, cycleStart: start, cycleEnd: new Date(start.getTime() + 30 * 86400000), includedUsed: 149, rewardBalance: 2, bonusBalance: 3 } });
    await t.test("Expired trial receives one extension atomically under concurrent retries; No is equally rewarded", async () => {
      const input = { startsAt: start.toISOString(), locale: "en", answers: { liked: "no" as const, reason: "price" as const } };
      const results = await Promise.all([feedback.submitTrialFeedback(trial.id, input, now), feedback.submitTrialFeedback(trial.id, input, now)]);
      assert.equal(results[0]!.grantedEndsAt, results[1]!.grantedEndsAt);
      assert.equal(await db.trialFeedbackGrant.count({ where: { userId: trial.id } }), 1); assert.equal(await db.feedbackReport.count({ where: { userId: trial.id } }), 1);
      const saved = await db.user.findUniqueOrThrow({ where: { id: trial.id } }); assert.equal(saved.trialStartsAt!.getTime(), start.getTime()); assert.equal(saved.trialEndsAt!.getTime(), now.getTime() + 72 * 3600000);
      assert.equal(saved.plan, "free"); assert.equal(saved.trialPlan, "business");
    });
    await t.test("Late extension never resets AI cycles, reserves once and refunds to the same source", async () => {
      const account = { ...(await db.user.findUniqueOrThrow({ where: { id: trial.id } })), betaAccess: false } as never;
      let summary = await ai.getAiUsageSummary(account); assert.equal(summary!.used, 149); assert.equal(summary!.remaining, 1); assert.equal(summary!.resetsAt, null);
      const usage = await ai.reserveAiUsage(account); assert(usage); summary = await ai.getAiUsageSummary(account); assert.equal(summary!.remaining, 0); assert.equal(summary!.rewardRemaining, 2);
      await ai.completeAiUsage(usage!, false); summary = await ai.getAiUsageSummary(account); assert.equal(summary!.remaining, 1); assert.equal(summary!.bonusRemaining, 3);
      await db.feedbackReport.deleteMany({ where: { userId: trial.id } });
      await feedback.submitTrialFeedback(trial.id, { startsAt: start.toISOString(), locale: "en", answers: { liked: "yes", reason: null } }, new Date(now.getTime() + 3600000));
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: trial.id } })).trialEndsAt!.getTime(), now.getTime() + 72 * 3600000);
    });
    await t.test("A failed grant rolls back feedback and access together", async () => {
      const row = await user(base); failGrant = true;
      await assert.rejects(feedback.submitTrialFeedback(row.id, { startsAt: start.toISOString(), locale: "en", answers: { liked: "yes", reason: null } }, now)); failGrant = false;
      assert.equal(await db.feedbackReport.count({ where: { userId: row.id } }), 0); assert.equal(await db.trialFeedbackGrant.count({ where: { userId: row.id } }), 0); assert.equal((await db.user.findUniqueOrThrow({ where: { id: row.id } })).trialEndsAt!.getTime(), end.getTime());
    });
    await t.test("Legacy answers can claim once without replacement; revoked, paid and no-trial accounts cannot gain rights", async () => {
      const legacy = await user({ ...base, trialPolicy: "interviews-3-v1", trialPlan: "pro" });
      await db.feedbackReport.create({ data: { userId: legacy.id, type: "other", title: "Old feedback", body: "Original preserved", trialKey: `${legacy.id}:${start.toISOString()}`, surveyAnswers: { version: 1, answers: { old: "Keep me" } } } });
      await feedback.submitTrialFeedback(legacy.id, { startsAt: start.toISOString(), locale: "en", claim: true }, now);
      assert.equal((await db.feedbackReport.findFirstOrThrow({ where: { userId: legacy.id } })).body, "Original preserved");
      const access = load<typeof import("../src/lib/discovery/service")>("src/lib/discovery/service.ts");
      assert.equal(access.discoveryPaid((await db.user.findUniqueOrThrow({ where: { id: legacy.id } })) as never), false);
      await db.user.update({ where: { id: legacy.id }, data: { trialPlan: null, trialStartsAt: null, trialEndsAt: null } });
      await assert.rejects(feedback.submitTrialFeedback(legacy.id, { startsAt: start.toISOString(), locale: "en", claim: true }, now));
      assert.equal((await feedback.trialFeedbackStatus(owner.id)).eligible, false);
      const paid = await user({ ...base, plan: "business", subscriptionStatus: "ACTIVE", paypalSubscriptionId: `paid-${suffix}`, currentPeriodEnd: new Date(now.getTime() + 86400000) });
      await feedback.submitTrialFeedback(paid.id, { startsAt: start.toISOString(), locale: "en", answers: { liked: "yes", reason: null } }, now);
      assert.equal(await db.trialFeedbackGrant.count({ where: { userId: paid.id } }), 0); assert.equal((await db.user.findUniqueOrThrow({ where: { id: paid.id } })).trialEndsAt!.getTime(), end.getTime());
      await assert.rejects(feedback.submitTrialFeedback(owner.id, { startsAt: start.toISOString(), locale: "en", answers: { liked: "yes", reason: null } }, now));
    });
  } finally { await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); }
});


test("Queued prospect orders record starts without pretending a completed delivery", async () => {
  const compiled = { exports: {} }, events: { name: string }[] = [];
  const browser = { location: { href: "https://rollon.com.tw/dashboard/matchmaking" }, umami: { track: (build: (defaults: object) => { name: string }) => events.push(build({})) } };
  runInNewContext(ts.transpileModule(readFileSync("src/lib/analytics.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: compiled, exports: compiled.exports, window: browser, process: { env: { NEXT_PUBLIC_UMAMI_ENABLED: "true" } }, URL, Date, Promise, Response, fetch: async () => Response.json({ data: { status: "pending" } }, { status: 202 }) });
  const analytics = compiled.exports as typeof import("../src/lib/analytics");
  await analytics.analyticsFetch("/api/prospects/orders", { method: "POST", body: "{}" });
  await analytics.analyticsFetch("/api/discovery/analyse", { method: "POST", body: JSON.stringify({ prospectCount: 5 }) });
  assert.deepEqual(events.map(e => e.name), ["prospects_start", "prospects_start"]);
});
