import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const native = createRequire(import.meta.url);

function fixture() {
  let now = Date.now();
  const state = { founders: [] as { status: string; captureExpiresAt: Date | null; paymentCheckedAt: Date | null }[], referral: null as { checkedAt: Date | null } | null,
    report: null as Date | null, digest: null as Date | null, newsletter: null as Date | null, reads: 0, runs: 0, failure: false, workerFailure: false, configured: true };
  const entries = new Map<string, { value: unknown; expiry: number }>();
  const cache = {
    unstable_cache: (fn: () => Promise<unknown>, keys: string[], options: { tags: string[]; revalidate: number }) => async () => {
      const key = keys[0]; assert.equal(key, options.tags[0]); assert.equal(options.revalidate, 3600);
      if (!entries.has(key) || entries.get(key)!.expiry <= now) entries.set(key, { value: await fn(), expiry: now + 3600000 });
      return entries.get(key)!.value;
    },
    revalidateTag: (tag: string, profile: { expire: number }) => { assert.equal(profile.expire, 0); entries.delete(tag); },
  };
  const read = () => { state.reads++; if (state.failure) throw new Error("Database unavailable"); };
  const prisma = {
    founderOrder: { findMany: async (args: unknown) => { read(); assert.deepEqual(JSON.parse(JSON.stringify(args)), { where: { OR: [{ status: "capturing", paypalOrderId: { not: null } }, { status: "paid", paypalCaptureId: { not: null } }] }, select: { status: true, captureExpiresAt: true, paymentCheckedAt: true } }); return state.founders; } },
    referral: { findFirst: async (args: { orderBy: unknown; where: unknown }) => { read(); assert.deepEqual(JSON.parse(JSON.stringify(args.orderBy)), [{ checkedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }]); assert.deepEqual(JSON.parse(JSON.stringify(args.where)), { status: { in: ["pending", "pending_payment", "granted", "review"] } }); return state.referral; } },
    marketReportDelivery: { aggregate: async () => { read(); return { _min: { nextAttemptAt: state.report } }; } },
    newsletterSubscriber: { aggregate: async () => { read(); return { _min: { nextDigestAt: state.digest } }; } },
    newsletterDelivery: { aggregate: async () => { read(); return { _min: { nextAttemptAt: state.newsletter } }; } },
  };
  class Clock extends Date { static now() { return now; } }
  const worker = async () => { state.runs++; if (state.workerFailure) throw new Error("Worker unavailable"); return { checked: 1, failed: 0 }; };
  class ReferralError extends Error { constructor(message: string, public status = 503) { super(message); } }
  const failure = (error: Error) => Response.json({ error: error.message }, { status: 503 });
  const mocks: Record<string, unknown> = {
    "next/cache": cache, "@/lib/prisma": { prisma }, "@/lib/discovery/founder": { reconcileFounderPayments: worker }, "@/lib/referrals/service": { runReferralReconciliation: worker },
    "@/lib/api": { ok: (data: unknown) => Response.json({ data }), failFromError: failure },
    "@/lib/referrals/http": { referralOk: (data: unknown) => Response.json({ data }), referralFailure: failure },
    "@/lib/referrals/policy": { ReferralError }, "@/lib/referrals/registration": { requireReferralConfig: () => { if (!state.configured) throw new Error("Referral configuration missing"); } },
  };
  function load<T>(file: string): T {
    const mod = { exports: {} };
    runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: mod, exports: mod.exports, Date: Clock, console: { info() {} }, process: { env: { CRON_SECRET: "qa-only" } }, Buffer, Response,
      require: (id: string) => id in mocks ? mocks[id] : native(id),
    });
    return mod.exports as T;
  }
  const schedule = load<typeof import("../src/lib/cron/schedules")>("src/lib/cron/schedules.ts");
  mocks["@/lib/cron/schedules"] = schedule;
  const founder = load<typeof import("../src/app/api/cron/founder-payments/route")>("src/app/api/cron/founder-payments/route.ts");
  const referral = load<typeof import("../src/app/api/cron/referrals/route")>("src/app/api/cron/referrals/route.ts");
  const request = (authorized = true) => new Request("https://example.test/cron", { headers: authorized ? { authorization: "Bearer qa-only" } : {} });
  return { state, schedule, founder, referral, request, now, advance: (ms: number) => { now += ms; } };
}

test("empty founder and referral cron ticks reuse metadata, authenticate first and preserve configuration errors", async () => {
  const h = fixture();
  assert.equal((await h.founder.GET(h.request(false))).status, 401); assert.equal(h.state.reads, 0);
  for (let i = 0; i < 4; i++) { assert.equal((await (await h.founder.GET(h.request())).json()).data.idle, true); assert.equal((await (await h.referral.GET(h.request())).json()).data.idle, true); }
  assert.equal(h.state.reads, 2); assert.equal(h.state.runs, 0);
  h.state.configured = false; assert.equal((await h.referral.GET(h.request())).status, 503);
  h.advance(3600000); await h.founder.GET(h.request()); assert.equal(h.state.reads, 3);
});

test("founder capture leases and 24-hour refund checks stay due at their original times", async () => {
  const h = fixture();
  h.state.founders = [{ status: "paid", captureExpiresAt: null, paymentCheckedAt: new Date(h.now) }, { status: "capturing", captureExpiresAt: new Date(h.now + 60000), paymentCheckedAt: null }];
  assert.equal(await h.schedule.nextFounderWorkAt(), new Date(h.now + 60000).toISOString());
  await h.founder.GET(h.request()); assert.equal(h.state.runs, 0); h.advance(60000); await h.founder.GET(h.request()); assert.equal(h.state.runs, 1);
  h.state.founders = [{ status: "paid", captureExpiresAt: null, paymentCheckedAt: new Date(h.now) }];
  assert.equal(await h.schedule.nextFounderWorkAt(), new Date(h.now + 86400000).toISOString());
  h.state.founders[0].paymentCheckedAt = null; h.schedule.invalidateFounderSchedule(); await h.founder.GET(h.request()); assert.equal(h.state.runs, 2);
});

test("new referrals invalidate empty cache and retain the 15-minute checkedAt cadence", async () => {
  const h = fixture(); await h.referral.GET(h.request()); h.state.referral = { checkedAt: null }; h.schedule.invalidateReferralSchedule();
  await h.referral.GET(h.request()); assert.equal(h.state.runs, 1);
  h.state.referral.checkedAt = new Date(h.now); await h.referral.GET(h.request()); assert.equal(h.state.runs, 1);
  h.advance(15 * 60000); await h.referral.GET(h.request()); assert.equal(h.state.runs, 2);
});

test("report retries and newsletter digests use the earliest work time with independent invalidations", async () => {
  const h = fixture();
  for (let i = 0; i < 4; i++) { assert.equal(await h.schedule.nextReportWorkAt(), null); assert.equal(await h.schedule.nextNewsletterWorkAt(), null); }
  assert.equal(h.state.reads, 3);
  h.state.report = new Date(h.now); h.schedule.invalidateReportSchedule(); assert.equal(await h.schedule.nextReportWorkAt(), new Date(h.now).toISOString());
  await h.schedule.nextNewsletterWorkAt(); assert.equal(h.state.reads, 4);
  h.state.digest = new Date(h.now + 86400000); h.state.newsletter = new Date(h.now + 900000); h.schedule.invalidateNewsletterSchedule();
  assert.equal(await h.schedule.nextNewsletterWorkAt(), h.state.newsletter.toISOString());
});

test("schedule exceptions are never cached as empty, and worker failures force the next cron to reread", async () => {
  const h = fixture(); h.state.failure = true; assert.equal((await h.founder.GET(h.request())).status, 503);
  h.state.failure = false; h.state.founders = [{ status: "capturing", captureExpiresAt: null, paymentCheckedAt: null }];
  h.state.workerFailure = true; assert.equal((await h.founder.GET(h.request())).status, 503);
  const reads = h.state.reads; h.state.workerFailure = false; assert.equal((await h.founder.GET(h.request())).status, 200); assert.equal(h.state.reads, reads + 1);
});

test("idle email workers skip database and article reads, while immediate report requests bypass the gate", async () => {
  let calls = 0, invalidations = 0, articles = 0, next: string | null = null;
  const env = { REPORT_EMAIL_ENABLED: "true", MEMBER_NETWORK_EMAIL_ENABLED: "true", RESEND_API_KEY: "qa", RESEND_FROM_EMAIL: "qa@example.invalid", AUTH_SECRET: "qa-only", NEXT_PUBLIC_APP_URL: "https://rollon.com.tw" };
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/prisma": { prisma: new Proxy({}, { get() { throw new Error("Unexpected database read"); } }) },
    "@/lib/cron/schedules": { nextReportWorkAt: async () => { calls++; return next; }, nextNewsletterWorkAt: async () => { calls++; return next; }, invalidateReportSchedule: () => invalidations++, invalidateNewsletterSchedule: () => invalidations++ },
    "@/lib/member-http": { MemberError: Error }, "@/lib/member-options": { COUNTRY_CODES: ["TW"], INDUSTRY_LABELS: {} },
    "@/lib/rewards/reminders": {}, "@/lib/newsletter/service": {}, "@/lib/security/log": {}, "./catalog": { REPORT_ID: "qa" },
    "@/lib/cms/content": { getInsightTeasers: async () => { articles++; return []; } }, "@/lib/cms/i18n": {}, "@/lib/rewards/policy": {}, "@/lib/routes": {},
  };
  function load<T>(path: string): T {
    const mod = { exports: {} };
    runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: mod, exports: mod.exports, Date, URL, Intl, console: { info() {} }, process: { env }, require: (id: string) => id in mocks ? mocks[id] : native(id),
    }); return mod.exports as T;
  }
  const report = load<typeof import("../src/lib/reports/service")>("src/lib/reports/service.ts");
  const newsletter = load<typeof import("../src/lib/newsletter/service")>("src/lib/newsletter/service.ts");
  for (next of [null, new Date(Date.now() + 3600000).toISOString()]) {
    assert.equal((await report.runReportDeliveries()).accepted, 0); assert.equal((await newsletter.runNewsletter()).accepted, 0);
  }
  assert.equal(articles, 0); assert.equal(invalidations, 0);
  const before = calls; await report.runReportDeliveries(new Date(), 0); await newsletter.runNewsletter(new Date(), 0); assert.equal(calls, before);
  await assert.rejects(report.runReportDeliveries(new Date(), 1000, "just-created-request"), /Unexpected database read/);
  assert.equal(calls, before); assert.equal(invalidations, 1);
  next = new Date(0).toISOString(); await assert.rejects(newsletter.runNewsletter(), /Unexpected database read/);
  assert.equal(articles, 1); assert.equal(invalidations, 2);
  env.MEMBER_NETWORK_EMAIL_ENABLED = "false"; env.REPORT_EMAIL_ENABLED = "false";
  assert.equal((await newsletter.runNewsletter()).disabled, true); assert.equal((await report.runReportDeliveries()).disabled, true);
});

test("referral registration clears idle cache after commit, never after rollback", async () => {
  const events: string[] = []; let rollback = false;
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/network/policy": { networkEnabled: () => false }, "@/lib/matchmaking/roles": {},
    "@/lib/prisma": {}, "./policy": { referralCode: () => "QA-CODE", ReferralError: Error },
    "@/lib/cron/schedules": { invalidateReferralSchedule: () => events.push("invalidate") },
    "@/lib/rewards/service": { rewardTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      events.push("start"); if (rollback) throw new Error("Rollback");
      const value = await fn({ $queryRaw: async () => [], referralAccount: { findFirst: async () => ({ id: "inviter", user: { email: "other@example.invalid" } }) }, user: { create: async () => ({ id: "new-member" }) } });
      events.push("commit"); return value;
    } },
  };
  const mod = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync("src/lib/referrals/registration.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: mod, exports: mod.exports, Buffer, process: { env: { REFERRAL_PAYER_HMAC_KEY: "x".repeat(32) } }, require: (id: string) => id in mocks ? mocks[id] : native(id),
  });
  const registration = mod.exports as typeof import("../src/lib/referrals/registration");
  await registration.registerWithReferral({ email: "new@example.invalid" }, "QA-CODE"); assert.deepEqual(events, ["start", "commit", "invalidate"]);
  events.length = 0; rollback = true;
  await assert.rejects(registration.registerWithReferral({ email: "new@example.invalid" }, "QA-CODE"), /Rollback/); assert.deepEqual(events, ["start"]);
});
