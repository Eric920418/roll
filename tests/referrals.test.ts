import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as policy from "../src/lib/referrals/policy";
import * as api from "../src/lib/api";
import type { PaymentProof } from "../src/lib/referrals/payments";
import type { PaypalOrder } from "../src/lib/billing/paypal";

test("Referral policy: code validation, Taipei month, exact currency minor units and reversible debt offsets", () => {
  assert.equal(policy.referralCode("  abcdef123456 "), "ABCDEF123456");
  for (const value of [undefined, "", " "]) assert.equal(policy.referralCode(value), undefined);
  for (const value of [null, 1, {}, "x", "a".repeat(1000)]) assert.throws(() => policy.referralCode(value));
  assert.equal(policy.referralMonth(new Date("2026-10-31T15:59:59Z")), "2026-10");
  assert.equal(policy.referralMonth(new Date("2026-10-31T16:00:00Z")), "2026-11");
  assert.equal(policy.amountMinor("5.00"), 500);
  for (const value of ["5", "-5.00", "5.001", "NaN", "999999999999.00"]) assert.throws(() => policy.amountMinor(value));
  assert.deepEqual(policy.grantAmounts(3), { credits: 2, debt: 0, offset: 3 });
  assert.deepEqual(policy.revokeAmounts(1, { credits: 2, offset: 3 }), { removed: 1, debt: 4 });
});

test("Referral language keys match; SQL is additive and changes no existing table", () => {
  const en = JSON.parse(readFileSync("messages/en.json", "utf8")), zh = JSON.parse(readFileSync("messages/zh-tw.json", "utf8"));
  const keys = (o: Record<string, unknown>): string[] => Object.entries(o).flatMap(([key, value]) => value && typeof value === "object" ? keys(value as Record<string, unknown>).map(v => `${key}.${v}`) : key);
  assert.deepEqual(keys(en.Referrals), keys(zh.Referrals));
  const sql = readFileSync("prisma/referrals.sql", "utf8");
  assert.equal([...sql.matchAll(/CREATE TABLE/g)].length, 4);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|INSERT INTO|DELETE FROM|UPDATE "|ALTER TABLE "User")\b/);
  assert(sql.startsWith("-- Additive")); assert.match(sql, /BEGIN;/); assert.match(sql, /COMMIT;/);
});

const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
test("Referral integration uses only its own fixtures in loopback PostgreSQL", { skip: !connectionString }, async t => {
  const url = new URL(connectionString!); assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 4 }) });
  const prefix = randomUUID(), users: string[] = [], refs: string[] = [], accountIds: string[] = [];
  const oldKey = process.env.REFERRAL_PAYER_HMAC_KEY, oldRollon = process.env.ROLLON_SIGNUP_CODE_SHA256;
  process.env.REFERRAL_PAYER_HMAC_KEY = "isolated-referral-test-hmac-key-never-production";
  process.env.ROLLON_SIGNUP_CODE_SHA256 = createHash("sha256").update("ROLLON-REFERRAL-QA").digest("hex");
  const state = { uid: null as string | null, admin: false, limited: false, providerFails: false, googleId: `g-${prefix}`, googleEmail: `google-${prefix}@referral.invalid`, validWebhook: true };
  const remote = new Map<string, PaypalOrder>(), captures = new Map<string, { id: string; status: string; amount: { currency_code: string; value: string }; create_time: string }>();
  const subs = new Map<string, { id: string; status: string; plan_id: string; subscriber?: { payer_id: string } }>();
  const transactions = new Map<string, { id: string; status: string; time: string; amount_with_breakdown: { gross_amount: { currency_code: string; value: string } } }[]>();
  const provider = {
    getOrder: async (id: string) => { if (state.providerFails) throw Error("Injected provider outage"); const row = remote.get(id); assert(row); return row; },
    getPaymentCapture: async (id: string) => { if (state.providerFails) throw Error("Injected provider outage"); const row = captures.get(id); assert(row); return row; },
    getSubscription: async (id: string) => { const row = subs.get(id); assert(row); return row; },
    getSubscriptionTransactions: async (id: string) => transactions.get(id) ?? [],
    verifyWebhookSignature: async () => state.validWebhook,
  };
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/api": api,
    "@/lib/security/log": { logSecurityError: () => "qa-trace", publicErrorMessage: () => "Retry (qa-trace)" },
    "@/lib/billing/paypal": provider, "@/lib/auth/account": {}, "@/lib/billing/gate": { getEffectivePlan: () => "free" }, "@/lib/action-plan/service": {}, "@/lib/playbook/quiz": {},
    "@/lib/auth/guard": { getUserSession: async () => state.uid ? { uid: state.uid } : null, getAdminSession: async () => state.admin ? { email: "qa-admin@invalid", role: "admin" } : null },
    "@/lib/auth/session": { createUserSession: async () => "fixture-session", USER_SESSION_COOKIE: "user_session", SESSION_MAX_AGE: 604800 },
    "@/lib/auth/password": { hashPassword: async () => "test-hash" },
    "@/lib/auth/onboarding": { destinationFor: () => "/dashboard" },
    "@/lib/auth/google": { buildAuthUrl: (state: string) => `https://accounts.google.com/auth?state=${state}`, localePrefixFromNext: (next: string) => next.startsWith("/zh-tw") ? "/zh-tw" : "", exchangeCodeForProfile: async () => ({ sub: state.googleId, email: state.googleEmail, emailVerified: true }) },
    "@/lib/rate-limit": { checkRateLimit: async () => ({ ok: !state.limited }), MINUTE_MS: 60000, clientIp: () => "127.0.0.1" },
    "@/lib/billing/reconcile": {}, "@/lib/billing/credits": {},
  };
  const require = createRequire(import.meta.url), cache = new Map<string, unknown>();
  function load<T>(file: string): T {
    const path = resolve(file); if (cache.has(path)) return cache.get(path) as T;
    const loaded = { exports: {} }; cache.set(path, loaded.exports);
    const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    runInNewContext(source, { module: loaded, exports: loaded.exports, process, console, Date, Error, SyntaxError, Buffer, URL, Request, Response, crypto: { randomUUID }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(resolve(dirname(path), `${id}.ts`)) : require(id) }); return loaded.exports as T;
  }
  const registration = load<typeof import("../src/lib/referrals/registration")>("src/lib/referrals/registration.ts");
  const service = load<typeof import("../src/lib/referrals/service")>("src/lib/referrals/service.ts");
  const paymentService = load<typeof import("../src/lib/referrals/payments")>("src/lib/referrals/payments.ts");
  const route = load<typeof import("../src/app/api/referrals/route")>("src/app/api/referrals/route.ts");
  const admin = load<typeof import("../src/app/api/admin/referrals/route")>("src/app/api/admin/referrals/route.ts");
  const signup = load<typeof import("../src/app/api/auth/signup/route")>("src/app/api/auth/signup/route.ts");
  const googleStart = load<typeof import("../src/app/api/auth/google/authorize/route")>("src/app/api/auth/google/authorize/route.ts");
  const google = load<typeof import("../src/app/api/auth/google/callback/route")>("src/app/api/auth/google/callback/route.ts");
  const request = (body: unknown = {}, path = "/api/referrals", method = "POST", origin = "https://example.test") => new NextRequest(`https://example.test${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json" }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
  const user = async () => { const row = await db.user.create({ data: { email: `${randomUUID()}-${prefix}@referral.invalid` } }); users.push(row.id); return row; };
  async function invite(inviterId?: string) {
    const owner = inviterId ? await db.user.findUniqueOrThrow({ where: { id: inviterId } }) : await user();
    const code = (await registration.ensureReferralAccount(owner.id)).code;
    const guest = await registration.registerWithReferral({ email: `${randomUUID()}-${prefix}@referral.invalid` }, code); users.push(guest.id);
    const row = await db.referral.findUniqueOrThrow({ where: { inviteeId: guest.id } }); refs.push(row.id);
    return { owner, guest, row, code };
  }
  assert.equal(paymentService.payerFingerprint("PAYERABCDE1234"), paymentService.payerFingerprint("payerabcde1234"));
  const proof = (payer = randomUUID(), paidAt = new Date("2026-10-01T00:00:00Z")): PaymentProof => ({ key: `capture:QA-${prefix}-${randomUUID()}`, kind: "credits", orderId: `QA-${prefix}-${randomUUID()}`, subscriptionId: null, payerHash: paymentService.payerFingerprint(payer), amountMinor: 500, currency: "USD", paidAt, status: "completed" });
  const at14 = new Date("2026-10-15T00:00:00Z");
  const wallet = (id: string) => db.aiAllowance.findUniqueOrThrow({ where: { userId: id } });
  const row = (id: string) => db.referral.findUniqueOrThrow({ where: { id } });
  try {
    await t.test("GET is read-only; code creation is idempotent, private and rejects forged ownership/origins", async () => {
      const owner = await user(); state.uid = owner.id;
      const before = await db.referralAccount.count();
      const response = await route.GET(request({}, "/api/referrals?userId=forged", "GET")); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal((await response.json()).data.code, null); assert.equal(await db.referralAccount.count(), before);
      assert.equal((await route.POST(request({ userId: "forged" }))).status, 400);
      const wrong = await route.POST(request({}, undefined, undefined, "https://evil.test")); assert.equal(wrong.status, 403); const error = await wrong.json(); assert(error.code); assert(error.requestId);
      const [a, b] = await Promise.all([registration.ensureReferralAccount(owner.id), registration.ensureReferralAccount(owner.id)]); assert.equal(a.code, b.code);
      state.uid = null; assert.equal((await route.GET(request({}, undefined, "GET"))).status, 401);
      state.uid = owner.id; state.limited = true; assert.equal((await route.POST(request())).status, 429); state.limited = false;
      delete process.env.REFERRAL_PAYER_HMAC_KEY; assert.equal((await route.POST(request())).status, 503); process.env.REFERRAL_PAYER_HMAC_KEY = "isolated-referral-test-hmac-key-never-production";
    });
    await t.test("Email signup atomically binds invitation, coexists with rollon and invalid codes create nothing", async () => {
      const owner = await user(), code = (await registration.ensureReferralAccount(owner.id)).code;
      const body = { email: `${randomUUID()}-${prefix}@referral.invalid`, password: "test-password", referralCode: code, rollonCode: "ROLLON-REFERRAL-QA", inviterId: "forged" };
      const response = await signup.POST(request(body, "/api/auth/signup")); assert.equal(response.status, 201);
      const guest = await db.user.findUniqueOrThrow({ where: { email: body.email }, include: { receivedReferral: true } }); users.push(guest.id); refs.push(guest.receivedReferral!.id); assert.equal(guest.rollonMember, true); assert.equal(guest.receivedReferral!.status, "pending_payment");
      const before = await db.user.count(); assert.equal((await signup.POST(request({ ...body, email: `invalid-${prefix}@referral.invalid`, referralCode: "BADCODE00000" }, "/api/auth/signup"))).status, 400); assert.equal(await db.user.count(), before);
      assert.equal((await signup.POST(request(body, "/api/auth/signup"))).status, 409); assert.equal(await db.referral.count({ where: { inviteeId: guest.id } }), 1);
      await assert.rejects(registration.registerWithReferral({ email: owner.email }, code), /Self/);
    });
    await t.test("Google carries confirmed code through HttpOnly state, binds only new users and preserves errors", async () => {
      const owner = await user(), code = (await registration.ensureReferralAccount(owner.id)).code;
      const start = await googleStart.POST(request({ next: "/zh-tw/onboarding/company", referralCode: code, rollonCode: "ROLLON-REFERRAL-QA" }, "/api/auth/google/authorize")); assert.equal(start.status, 200);
      const saved = start.cookies.get("g_oauth")!; assert.equal(saved.httpOnly, true); assert.equal(JSON.parse(saved.value).referralCode, code);
      const callback = () => { const req = new NextRequest(`https://example.test/api/auth/google/callback?state=${JSON.parse(saved.value).state}&code=test`); req.cookies.set("g_oauth", saved.value); return req; };
      assert.equal((await google.GET(callback())).status, 307);
      const guest = await db.user.findUniqueOrThrow({ where: { googleId: state.googleId }, include: { receivedReferral: true } }); users.push(guest.id); refs.push(guest.receivedReferral!.id); assert(guest.receivedReferral); assert.equal(guest.rollonMember, true);
      const existing = await user(); await db.user.update({ where: { id: existing.id }, data: { googleId: "existing-"+prefix } }); state.googleId = "existing-"+prefix;
      await google.GET(callback()); assert.equal(await db.referral.findUnique({ where: { inviteeId: existing.id } }), null);
      state.googleId = "new-"+prefix; state.googleEmail = "second-"+prefix+"@referral.invalid";
      const bad = new NextRequest(`https://example.test/api/auth/google/callback?state=s&code=test`); bad.cookies.set("g_oauth", JSON.stringify({ state: "s", next: "/zh-tw/onboarding/company", referralCode: "BADCODE00000" }));
      const failed = await google.GET(bad); assert.match(failed.headers.get("location")!, /ref=BADCODE00000/); assert.match(decodeURIComponent(failed.headers.get("location")!), /HTTP 400/); assert.equal(await db.user.findUnique({ where: { email: state.googleEmail } }), null);
    });
    await t.test("13 days does not grant; 14-day concurrent replays grant once and preserve purchased/monthly balances", async () => {
      const f = await invite(), p = proof();
      await db.aiAllowance.create({ data: { userId: f.owner.id, rewardBalance: 7, bonusBalance: 9, includedUsed: 11 } });
      await service.settleReferral(f.row.id, [p], [], new Date(at14.getTime() - 1)); assert.equal((await row(f.row.id)).status, "pending"); assert.equal((await wallet(f.owner.id)).rewardBalance, 7);
      await Promise.all([service.settleReferral(f.row.id, [p], [], at14), service.settleReferral(f.row.id, [p], [], at14)]);
      assert.equal((await row(f.row.id)).status, "granted"); const balance = await wallet(f.owner.id); assert.equal(balance.rewardBalance, 12); assert.equal(balance.bonusBalance, 9); assert.equal(balance.includedUsed, 11); assert.equal((await wallet(f.guest.id)).rewardBalance, 5); assert.equal(await db.referralEntry.count({ where: { referralId: f.row.id, kind: "grant" } }), 2);
      await service.recordReferralRefund(p.key); await service.recordReferralRefund(p.key); assert.equal((await wallet(f.owner.id)).rewardBalance, 7); assert.equal((await wallet(f.owner.id)).bonusBalance, 9); assert.equal(await db.referralEntry.count({ where: { referralId: f.row.id, kind: "revoke" } }), 2);
      await service.settleReferral(f.row.id, [p, proof()], [], at14); assert.equal((await row(f.row.id)).status, "revoked"); assert.equal((await wallet(f.owner.id)).rewardBalance, 7);
    });
    await t.test("Spent rewards create debt; later referral offsets it; refund of an offset restores debt", async () => {
      const f = await invite(), p = proof(); await service.settleReferral(f.row.id, [p], [], at14);
      await db.aiAllowance.update({ where: { userId: f.owner.id }, data: { rewardBalance: 2, bonusBalance: 17 } });
      await service.recordReferralRefund(p.key); assert.equal((await wallet(f.owner.id)).rewardBalance, 0); assert.equal((await db.referralAccount.findUniqueOrThrow({ where: { userId: f.owner.id } })).debt, 3);
      const next = await invite(f.owner.id), q = proof(); await service.settleReferral(next.row.id, [q], [], at14); assert.equal((await wallet(f.owner.id)).rewardBalance, 2);
      await db.aiAllowance.update({ where: { userId: f.owner.id }, data: { rewardBalance: 1 } }); await service.recordReferralRefund(q.key);
      assert.equal((await db.referralAccount.findUniqueOrThrow({ where: { userId: f.owner.id } })).debt, 4); assert.equal((await wallet(f.owner.id)).rewardBalance, 0); assert.equal((await wallet(f.owner.id)).bonusBalance, 17);
    });
    await t.test("Same payer qualifies once after refund; known self-payer rejected; later self-evidence revokes a grant", async () => {
      const f = await invite(), payer = randomUUID(), p = proof(payer); await service.settleReferral(f.row.id, [p], [], at14); await service.recordReferralRefund(p.key);
      const second = await invite(); await service.settleReferral(second.row.id, [proof(payer)], [], at14); assert.equal((await row(second.row.id)).reason, "duplicate_payer");
      const self = await invite(), payer2 = randomUUID(); await service.settleReferral(self.row.id, [proof(payer2)], [proof(payer2)], at14); assert.equal((await row(self.row.id)).reason, "self_referral");
      const later = await invite(), payer3 = randomUUID(), paid = proof(payer3); await service.settleReferral(later.row.id, [paid], [], at14); await service.settleReferral(later.row.id, [paid], [proof(payer3)], at14); assert.equal((await row(later.row.id)).status, "revoked"); assert.equal((await row(later.row.id)).reason, "self_referral");
    });
    await t.test("Taipei month cap reserves pending places, serializes the tenth place and does not free refunds", async () => {
      const owner = await user(), fixtures: Awaited<ReturnType<typeof invite>>[] = [];
      for (let i = 0; i < 11; i++) fixtures.push(await invite(owner.id));
      const payments = fixtures.map(() => proof());
      for (let i = 0; i < 9; i++) await service.settleReferral(fixtures[i].row.id, [payments[i]], [], new Date("2026-10-02"));
      await Promise.all([9, 10].map(i => service.settleReferral(fixtures[i].row.id, [payments[i]], [], new Date("2026-10-02"))));
      const summary = await service.referralSummary(owner.id, 1); assert.equal(summary.used, 10); assert.equal(summary.rows.filter(value => value.reason === "monthly_limit").length, 1);
      await service.recordReferralRefund(payments[0].key); const extra = await invite(owner.id); await service.settleReferral(extra.row.id, [proof()], [], at14); assert.equal((await row(extra.row.id)).reason, "monthly_limit");
      const november = await invite(owner.id); await service.settleReferral(november.row.id, [proof(randomUUID(), new Date("2026-10-31T16:00:00Z"))], [], new Date("2026-11-01T00:00:00Z")); assert.equal((await row(november.row.id)).monthKey, "2026-11"); assert.equal((await row(november.row.id)).status, "pending");
    });
    await t.test("Provider verification supports credits/founder/subscriptions, rejects ACTIVE without collection and fails closed", async () => {
      const guest = await user(), payer = randomUUID(), paidAt = "2026-10-01T00:00:00.000Z";
      const addOrder = async (kind: "credits" | "founder") => {
        const id = `QA-${prefix}-${randomUUID()}`, captureId = `QA-${prefix}-${randomUUID()}`;
        const local = kind === "credits" ? await db.aiCreditPurchase.create({ data: { userId: guest.id, paypalOrderId: id, requestId: randomUUID() } }) : await db.founderOrder.create({ data: { userId: guest.id, requestId: randomUUID(), paypalOrderId: id, reservedUntil: new Date() } });
        const value = kind === "credits" ? "5.00" : "348.00";
        remote.set(id, { id, status: "COMPLETED", payer: { payer_id: payer }, purchase_units: [{ custom_id: kind === "credits" ? guest.id : local.id, payments: { captures: [{ id: captureId, status: "COMPLETED", create_time: paidAt }] } }] }); captures.set(captureId, { id: captureId, status: "COMPLETED", amount: { currency_code: "USD", value }, create_time: paidAt }); return { id, captureId };
      };
      const credit = await addOrder("credits"); await addOrder("founder");
      const subId = `I-${prefix}`; await db.subscription.create({ data: { userId: guest.id, paypalSubscriptionId: subId, checkoutRequestId: randomUUID(), status: "ACTIVE", plan: "pro", paypalPlanId: "PLAN-QA", currency: "USD", amountMinor: 4900 } }); subs.set(subId, { id: subId, status: "ACTIVE", plan_id: "PLAN-QA", subscriber: { payer_id: payer } });
      assert.equal((await paymentService.collectPayments(guest.id)).length, 2);
      transactions.set(subId, [{ id: `QA-${prefix}-sale`, status: "COMPLETED", time: paidAt, amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "49.00" } } }]);
      assert.deepEqual(new Set((await paymentService.collectPayments(guest.id)).map(p => p.kind)), new Set(["credits", "founder", "subscription"]));
      captures.get(credit.captureId)!.status = "PARTIALLY_REFUNDED"; assert.equal((await paymentService.collectPayments(guest.id)).find(p => p.orderId === credit.id)!.status, "refunded");
      captures.get(credit.captureId)!.amount.value = "0.01"; assert.equal((await paymentService.collectPayments(guest.id)).find(p => p.orderId === credit.id)!.status, "review");
      remote.get(credit.id)!.purchase_units![0].custom_id = "wrong"; await assert.rejects(paymentService.collectPayments(guest.id), /ownership/);
    });
    await t.test("Manual review rechecks proof, requires identity/note and cannot bypass payer deduplication", async () => {
      const f = await invite(), orderId = `QA-${prefix}-${randomUUID()}`, captureId = `QA-${prefix}-${randomUUID()}`;
      await db.aiCreditPurchase.create({ data: { userId: f.guest.id, paypalOrderId: orderId, requestId: randomUUID() } });
      remote.set(orderId, { id: orderId, status: "COMPLETED", purchase_units: [{ custom_id: f.guest.id, payments: { captures: [{ id: captureId, status: "COMPLETED", create_time: "2026-10-01T00:00:00.000Z" }] } }] }); captures.set(captureId, { id: captureId, status: "COMPLETED", amount: { currency_code: "USD", value: "5.00" }, create_time: "2026-10-01T00:00:00.000Z" });
      await service.reconcileReferral(f.row.id); assert.equal((await row(f.row.id)).reason, "missing_payer");
      state.uid = f.owner.id; state.admin = false; assert.equal((await admin.PATCH(request({ id: f.row.id }, "/api/admin/referrals", "PATCH"))).status, 401);
      state.admin = true; assert.equal((await admin.PATCH(request({ id: f.row.id, revision: (await row(f.row.id)).revision, decision: "approve", note: "" }, "/api/admin/referrals", "PATCH"))).status, 400);
      const response = await admin.PATCH(request({ id: f.row.id, revision: (await row(f.row.id)).revision, decision: "approve", note: "Verified in Sandbox payment records", payerId: randomUUID() }, "/api/admin/referrals", "PATCH")); assert.equal(response.status, 200); assert.equal((await row(f.row.id)).status, "granted");
      state.admin = false; const summary = await service.referralSummary(f.owner.id, 1); assert.doesNotMatch(JSON.stringify(summary), /@referral|payerHash|orderId|paymentKey|reviewNote|Verified in Sandbox/);
      const other = await user(); state.uid = other.id; assert.equal((await (await route.GET(request({}, "/api/referrals?userId="+f.owner.id, "GET"))).json()).data.rows.length, 0);
      const cron = load<typeof import("../src/app/api/cron/referrals/route")>("src/app/api/cron/referrals/route.ts"); assert.equal((await cron.GET(request({}, "/api/cron/referrals", "GET"))).status, 401);
    });
    await t.test("Successful purchase response queues referral work instead of waiting for provider verification", async () => {
      const guest = await user(), orderId = `QA-${prefix}-${randomUUID()}`;
      await db.aiCreditPurchase.create({ data: { userId: guest.id, paypalOrderId: orderId, requestId: randomUUID(), status: "COMPLETED" } });
      state.uid = guest.id; const callbacks: (() => Promise<void>)[] = []; let syncs = 0;
      mocks["next/server"] = { after: (callback: () => Promise<void>) => callbacks.push(callback) };
      mocks["@/lib/referrals/service"] = { ...service, trySyncUserReferral: async () => { syncs++; } };
      try {
        const capture = load<typeof import("../src/app/api/billing/credits/capture/route")>("src/app/api/billing/credits/capture/route.ts");
        const response = await capture.POST(request({ orderId }, "/api/billing/credits/capture")); assert.equal(response.status, 200); assert.equal(syncs, 0); assert.equal(callbacks.length, 1); await callbacks[0](); assert.equal(syncs, 1);
      } finally { delete mocks["next/server"]; delete mocks["@/lib/referrals/service"]; }
    });
    await t.test("Provider outage preserves funds and publishes a safe trace instead of claiming no payment", async () => {
      const f = await invite(), orderId = `QA-${prefix}-${randomUUID()}`, captureId = `QA-${prefix}-${randomUUID()}`;
      await db.aiCreditPurchase.create({ data: { userId: f.guest.id, paypalOrderId: orderId, requestId: randomUUID() } });
      remote.set(orderId, { id: orderId, status: "COMPLETED", payer: { payer_id: randomUUID() }, purchase_units: [{ custom_id: f.guest.id, payments: { captures: [{ id: captureId, status: "COMPLETED", create_time: "2026-10-01T00:00:00.000Z" }] } }] });
      captures.set(captureId, { id: captureId, status: "COMPLETED", amount: { currency_code: "USD", value: "5.00" }, create_time: "2026-10-01T00:00:00.000Z" });
      state.providerFails = true; await assert.rejects(service.reconcileReferral(f.row.id)); state.providerFails = false;
      const summary = await service.referralSummary(f.owner.id, 1); assert.equal(summary.rows[0].reason, "payment_unavailable"); assert.equal(summary.rows[0].errorRequestId, "qa-trace"); assert.equal(summary.rows[0].status, "review"); assert.doesNotMatch(JSON.stringify(summary), /Injected|orderId|payerHash/);
      await service.reconcileReferral(f.row.id); assert.equal((await row(f.row.id)).status, "granted"); assert.equal((await row(f.row.id)).errorRequestId, null);
    });
    await t.test("AI reservation/refund races remain nonnegative and failed calls return through the original path", async () => {
      const f = await invite(), payment = proof(); await service.settleReferral(f.row.id, [payment], [], at14);
      await db.aiAllowance.update({ where: { userId: f.owner.id }, data: { bonusBalance: 19, includedUsed: 12 } });
      const allowance = load<typeof import("../src/lib/ai/allowance")>("src/lib/ai/allowance.ts");
      const [usage] = await Promise.all([allowance.reserveAiUsage(f.owner as never, "copilot"), service.recordReferralRefund(payment.key)]);
      if (usage) await allowance.completeAiUsage(usage, false);
      const balance = await wallet(f.owner.id), account = await db.referralAccount.findUniqueOrThrow({ where: { userId: f.owner.id } });
      assert(balance.rewardBalance >= 0); assert.equal(balance.rewardBalance - account.debt, 0); assert.equal(balance.bonusBalance, 19); assert.equal(balance.includedUsed, 12);
      if (usage) assert.equal((await db.aiUsage.findUniqueOrThrow({ where: { id: usage } })).status, "failed");
    });
    await t.test("A granted reward entering review cannot grant twice, and refunds still revoke it", async () => {
      const f = await invite(), payment = proof(); await service.settleReferral(f.row.id, [payment], [], at14);
      await service.settleReferral(f.row.id, [{ ...payment, status: "review" }], [], at14); assert.equal((await row(f.row.id)).status, "review");
      await service.settleReferral(f.row.id, [payment], [], at14); assert.equal((await row(f.row.id)).status, "granted"); assert.equal((await wallet(f.owner.id)).rewardBalance, 5);
      await service.settleReferral(f.row.id, [{ ...payment, status: "review" }], [], at14); await service.recordReferralRefund(payment.key); assert.equal((await wallet(f.owner.id)).rewardBalance, 0);
      assert.equal(await db.referralEntry.count({ where: { referralId: f.row.id, kind: "grant" } }), 2);
      const early = await invite(), laterPayment = proof(); await service.settleReferral(early.row.id, [laterPayment], [], at14);
      const first = proof(randomUUID(), new Date("2026-09-30T00:00:00Z")); await service.settleReferral(early.row.id, [first, laterPayment], [], at14);
      assert.equal((await row(early.row.id)).paymentKey, first.key); assert.equal((await wallet(early.owner.id)).rewardBalance, 5);
      await service.recordReferralRefund(first.key); assert.equal((await wallet(early.owner.id)).rewardBalance, 0);
    });
    await t.test("Admin rejection works during provider outage; approval fails closed without changing the review", async () => {
      const f = await invite(); await service.settleReferral(f.row.id, [{ ...proof(), payerHash: null }], [], at14);
      state.providerFails = true;
      await service.reviewReferral({ id: f.row.id, revision: (await row(f.row.id)).revision, decision: "reject", note: "Evidence was not sufficient" }, "qa-admin");
      assert.equal((await row(f.row.id)).status, "rejected"); state.providerFails = false;
    });
    await t.test("Signed refund webhook is idempotent; forged refunds never change balances", async () => {
      const f = await invite(), paid = proof(); await service.settleReferral(f.row.id, [paid], [], at14);
      const webhook = load<typeof import("../src/app/api/billing/webhook/route")>("src/app/api/billing/webhook/route.ts");
      const body = { id: "WH-"+prefix, event_type: "PAYMENT.SALE.REFUNDED", resource: { id: "REFUND-ID", state: "completed", sale_id: paid.key.slice(8) } };
      // Use sale identity for the same canonical transaction, with a separate fixture.
      const sale = await invite(), saleProof = { ...proof(), key: `sale:QA-${prefix}-${randomUUID()}`, kind: "subscription" }; await service.settleReferral(sale.row.id, [saleProof], [], at14); body.resource.sale_id = saleProof.key.slice(5);
      state.validWebhook = false; assert.equal((await webhook.POST(request(body, "/api/billing/webhook"))).status, 401); assert.equal((await wallet(sale.owner.id)).rewardBalance, 5);
      state.validWebhook = true; assert.equal((await webhook.POST(request(body, "/api/billing/webhook"))).status, 200); assert.equal((await webhook.POST(request(body, "/api/billing/webhook"))).status, 200); assert.equal((await wallet(sale.owner.id)).rewardBalance, 0);
    });
    await t.test("Deletion cancels pending awards, preserves dedup tombstones and can revoke surviving-party rewards", async () => {
      const pending = await invite(); await db.$transaction(async tx => { await service.prepareReferralDeletion(tx, pending.guest.id); await tx.user.delete({ where: { id: pending.guest.id } }); }); assert.equal((await row(pending.row.id)).status, "rejected"); assert.equal((await row(pending.row.id)).inviteeId, null);
      const paid = await invite(), payer = randomUUID(), payment = proof(payer); await service.settleReferral(paid.row.id, [payment], [], at14); const hash = (await row(paid.row.id)).payerHash;
      await db.$transaction(async tx => { await service.prepareReferralDeletion(tx, paid.guest.id); await tx.user.delete({ where: { id: paid.guest.id } }); });
      assert.equal((await row(paid.row.id)).payerHash, hash); assert.equal((await db.referralPayment.findUniqueOrThrow({ where: { key: payment.key } })).userId, null);
      await service.recordReferralRefund(payment.key); assert.equal((await wallet(paid.owner.id)).rewardBalance, 0);
      const recreated = await invite(); await service.settleReferral(recreated.row.id, [proof(payer)], [], at14); assert.equal((await row(recreated.row.id)).reason, "duplicate_payer");
    });
  } finally {
    const accounts = await db.referralAccount.findMany({ where: { OR: [{ userId: { in: users } }, { invitations: { some: { id: { in: refs } } } }, { entries: { some: { referralId: { in: refs } } } }] }, select: { id: true } }); accountIds.push(...accounts.map(a => a.id));
    await db.referralEntry.deleteMany({ where: { OR: [{ referralId: { in: refs } }, { accountId: { in: accountIds } }] } });
    await db.referral.deleteMany({ where: { OR: [{ id: { in: refs } }, { inviterId: { in: accountIds } }] } });
    await db.referralPayment.deleteMany({ where: { OR: [{ userId: { in: users } }, { key: { contains: prefix } }] } });
    await db.referralAccount.deleteMany({ where: { id: { in: accountIds } } });
    await db.webhookEvent.deleteMany({ where: { id: "WH-"+prefix } });
    await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
    if (oldKey === undefined) delete process.env.REFERRAL_PAYER_HMAC_KEY; else process.env.REFERRAL_PAYER_HMAC_KEY = oldKey;
    if (oldRollon === undefined) delete process.env.ROLLON_SIGNUP_CODE_SHA256; else process.env.ROLLON_SIGNUP_CODE_SHA256 = oldRollon;
  }
});
