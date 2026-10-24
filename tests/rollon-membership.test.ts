import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { NextResponse, NextRequest } from "next/server";
import ts from "typescript";
import * as policy from "../src/lib/discovery/policy";
import { browserMutationGuard } from "../src/lib/security/http";
import type { BillingAccount } from "../src/lib/billing/gate";

const code = "ROLLON-TEST-PRIVATE-CODE";
const hash = createHash("sha256").update(code).digest("hex");
const now = new Date("2026-10-25T00:00:00Z");

function harness() {
  const env: Record<string, string | undefined> = { ROLLON_SIGNUP_CODE_SHA256: hash, DISCOVERY_TRIAL_ENABLED: "true", BILLING_REQUIRE_EXPLICIT_ENTITLEMENT: "true" };
  const state = { allowed: true, existing: null as Record<string, unknown> | null, writes: [] as Record<string, unknown>[], reads: 0 };
  const require = createRequire(import.meta.url), cache = new Map<string, unknown>();
  const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/prisma": { prisma: { user: {
      findUnique: async () => { state.reads++; return state.existing; },
      create: async ({ data }: { data: Record<string, unknown> }) => { state.writes.push(data); return { ...data, id: randomUUID(), sessionVersion: 0, completed: false, onboardingStep: 2 }; },
    } } },
    "@/lib/auth/account": {},
    "@/lib/auth/password": { hashPassword: async () => "password-hash" },
    "@/lib/auth/session": { createUserSession: async () => "user-token", USER_SESSION_COOKIE: "user_session", SESSION_MAX_AGE: 604800 },
    "@/lib/security/http": { browserMutationGuard },
    "@/lib/security/log": { logSecurityError: () => "request-id", publicErrorMessage: () => "Server error (request-id)" },
    "@/lib/api": { ok: (data: unknown, status = 200) => json({ data }, status), fail: (error: string, status = 400) => json({ error }, status), failFromError: () => json({ error: "Server error" }, 500), rateLimited: () => json({ error: "Too many attempts" }, 429) },
    "@/lib/rate-limit": { MINUTE_MS: 60000, clientIp: () => "127.0.0.1", checkRateLimit: async () => ({ ok: state.allowed, retryAfterMs: 60000 }) },
    "@/lib/auth/google": { buildAuthUrl: (value: string) => `https://accounts.google.com/auth?state=${value}`, localePrefixFromNext: (value: string) => value.startsWith("/zh-tw") ? "/zh-tw" : "", exchangeCodeForProfile: async () => ({ sub: "google-id", email: "google@example.test", emailVerified: true }) },
    "@/lib/discovery/policy": policy,
  };
  function load<T>(file: string): T {
    const absolute = resolve(file);
    if (cache.has(absolute)) return cache.get(absolute) as T;
    const loaded = { exports: {} }; cache.set(absolute, loaded.exports);
    const source = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    runInNewContext(source, { module: loaded, exports: loaded.exports, process: { env }, Date, Error, Buffer, URL, console, crypto: { randomUUID }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(resolve(dirname(absolute), `${id}.ts`)) : require(id) });
    return loaded.exports as T;
  }
  return { env, state, load };
}
function post(body: unknown, path = "/api/auth/signup", origin = "https://example.test") {
  return new NextRequest(`https://example.test${path}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function callback(cookie: string) {
  const req = new NextRequest("https://example.test/api/auth/google/callback?state=s&code=google-code");
  req.cookies.set("g_oauth", cookie);
  return req;
}
const signupBody = { email: "new@example.test", password: "test-password" };
const account: BillingAccount = { plan: "free", subscriptionStatus: null, paypalSubscriptionId: null, currentPeriodEnd: null, planUpdatedAt: null, trialPlan: null, trialStartsAt: null, trialEndsAt: null };

test("Single rollon code accepts case/outer whitespace and rejects malformed, wrong or unavailable codes", () => {
  const { env, load } = harness();
  const { rollonSignupData } = load<typeof import("../src/lib/auth/rollon")>("src/lib/auth/rollon.ts");
  for (const value of [undefined, "", "  "]) assert.equal(rollonSignupData(value), null);
  for (const value of [code, `  ${code.toLowerCase()}  `]) {
    const grant = rollonSignupData(value, now)!;
    assert.equal(grant.rollonMember, true); assert.equal(grant.plan, "pro"); assert.equal(grant.planUpdatedAt, now);
  }
  for (const value of [null, 1, true, {}, [code], "wrong", "x".repeat(129)]) assert.throws(() => rollonSignupData(value), /Invalid/);
  for (const value of [undefined, "", "bad", "00".repeat(32)]) { env.ROLLON_SIGNUP_CODE_SHA256 = value; assert.throws(() => rollonSignupData(code), /Invalid/); }
});

test("Email signup grants permanent Pro and does not create a trial, subscription or payment record", async () => {
  const { state, load } = harness();
  const { POST } = load<typeof import("../src/app/api/auth/signup/route")>("src/app/api/auth/signup/route.ts");
  for (const email of ["first@example.test", "second@example.test"]) {
    const res = await POST(post({ ...signupBody, email, rollonCode: code }));
    assert.equal(res.status, 201); assert(res.headers.has("set-cookie"));
  }
  assert.equal(state.writes.length, 2);
  for (const row of state.writes) {
    assert.equal(row.rollonMember, true); assert.equal(row.plan, "pro");
    assert.equal(row.trialPlan, undefined); assert.equal(row.subscriptionStatus, undefined); assert.equal(row.paypalSubscriptionId, undefined);
    assert(!JSON.stringify(row).includes(code));
  }
});

test("Signup preserves ordinary trials and ignores forged membership flags; invalid codes cause zero writes", async () => {
  const { state, env, load } = harness();
  const { POST } = load<typeof import("../src/app/api/auth/signup/route")>("src/app/api/auth/signup/route.ts");
  const previous = process.env.DISCOVERY_TRIAL_ENABLED;
  process.env.DISCOVERY_TRIAL_ENABLED = "true";
  try {
    assert.equal((await POST(post({ ...signupBody, rollonCode: "", rollonMember: true, plan: "enterprise" }))).status, 201);
    assert.equal(state.writes[0].rollonMember, undefined); assert.equal(state.writes[0].trialPolicy, policy.DISCOVERY_POLICY);
  } finally { if (previous === undefined) delete process.env.DISCOVERY_TRIAL_ENABLED; else process.env.DISCOVERY_TRIAL_ENABLED = previous; }
  for (const rollonCode of ["wrong", {}, null]) {
    const res = await POST(post({ ...signupBody, rollonCode })); assert.equal(res.status, 400); assert.match((await res.json()).error, /rollon會員/);
  }
  delete env.ROLLON_SIGNUP_CODE_SHA256;
  assert.equal((await POST(post({ ...signupBody, rollonCode: code }))).status, 400);
  assert.equal(state.writes.length, 1);
  state.allowed = false; assert.equal((await POST(post({ ...signupBody, rollonCode: code }))).status, 429);
  assert.equal((await POST(post(signupBody, undefined, "https://evil.test"))).status, 403);
  assert.equal(state.writes.length, 1);
});

test("Existing email accounts are rejected without an update or membership change", async () => {
  const { state, load } = harness(); state.existing = { id: "existing", rollonMember: false };
  const { POST } = load<typeof import("../src/app/api/auth/signup/route")>("src/app/api/auth/signup/route.ts");
  assert.equal((await POST(post({ ...signupBody, rollonCode: code }))).status, 409);
  assert.equal(state.existing.rollonMember, false); assert.equal(state.writes.length, 0);
});

test("Google signup sends no membership code in a URL and guards origin, rate and invalid codes", async () => {
  const { state, load } = harness();
  const route = load<typeof import("../src/app/api/auth/google/authorize/route")>("src/app/api/auth/google/authorize/route.ts");
  const body = { next: "/zh-tw/onboarding/company", rollonCode: code };
  const res = await route.POST(post(body, "/api/auth/google/authorize"));
  assert.equal(res.status, 200); assert(!JSON.stringify(await res.json()).includes(code));
  const cookie = res.cookies.get("g_oauth")!;
  assert.equal(JSON.parse(cookie.value).rollonCode, code); assert.equal(cookie.httpOnly, true); assert.equal(cookie.maxAge, 600); assert.equal(cookie.sameSite, "lax");
  assert.equal((await route.POST(post(body, "/api/auth/google/authorize", "https://evil.test"))).status, 403);
  assert.equal((await route.POST(post({ ...body, rollonCode: "wrong" }, "/api/auth/google/authorize"))).status, 400);
  state.allowed = false; assert.equal((await route.POST(post(body, "/api/auth/google/authorize"))).status, 429);
  assert.equal(state.writes.length, 0);
  const legacy = await route.GET(new NextRequest("https://example.test/api/auth/google/authorize?next=/"));
  assert.equal(legacy.status, 307); assert.equal(JSON.parse(legacy.cookies.get("g_oauth")!.value).rollonCode, undefined);
});

test("Google callback validates the code again and grants only new users, never existing accounts", async () => {
  const { state, env, load } = harness();
  const route = load<typeof import("../src/app/api/auth/google/callback/route")>("src/app/api/auth/google/callback/route.ts");
  const saved = JSON.stringify({ state: "s", next: "/zh-tw/onboarding/company", rollonCode: code });
  const valid = await route.GET(callback(saved)); assert.equal(valid.status, 307);
  assert.equal(state.writes[0].rollonMember, true); assert.equal(state.writes[0].trialPlan, undefined);
  assert.equal(valid.cookies.get("g_oauth")!.maxAge, 0);
  delete env.ROLLON_SIGNUP_CODE_SHA256;
  const invalid = await route.GET(callback(saved)); assert.match(decodeURIComponent(invalid.headers.get("location")!), /rollon會員驗證碼/);
  assert.equal(state.writes.length, 1);
  state.existing = { id: "old-google", email: "google@example.test", completed: true, onboardingStep: 4, rollonMember: false, sessionVersion: 0 };
  await route.GET(callback(saved)); assert.equal(state.existing.rollonMember, false); assert.equal(state.writes.length, 1);
  const forged = await route.GET(callback(JSON.stringify({ state: "s", next: "/", rollonMember: true })));
  assert.equal(forged.status, 307); assert.equal(state.writes.length, 1);
});

test("rollon Pro survives expiry, strict billing and disabled beta without granting Business or Enterprise", () => {
  const { env, load } = harness();
  const { getPaidPlan, getEffectivePlan } = load<typeof import("../src/lib/billing/gate")>("src/lib/billing/gate.ts");
  for (const betaAccess of [false, true]) for (const subscriptionStatus of [null, "ACTIVE", "CANCELLED", "EXPIRED", "SUSPENDED"]) {
    const member = { ...account, rollonMember: true, betaAccess, subscriptionStatus, currentPeriodEnd: new Date(0), trialEndsAt: new Date(0) };
    assert.equal(getPaidPlan(member, now), "pro"); assert.equal(getEffectivePlan(member, new Date("2099-01-01")), "pro");
  }
  assert.equal(getPaidPlan({ ...account, plan: "pro", rollonMember: false }, now), "free");
  assert.equal(getPaidPlan({ ...account, rollonMember: true, plan: "business", paypalSubscriptionId: "I-paid", subscriptionStatus: "ACTIVE", currentPeriodEnd: new Date("2099-01-01") }, now), "business");
  delete env.ROLLON_SIGNUP_CODE_SHA256;
  assert.equal(getPaidPlan({ ...account, rollonMember: true }, now), "pro");
});
