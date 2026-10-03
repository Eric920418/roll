import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import * as sessions from "../src/lib/auth/session";
import * as api from "../src/lib/api";
import { browserMutationGuard, SecurityUnavailableError } from "../src/lib/security/http";
import { contentJsonPath } from "../src/lib/security/content-path";
import { logSecurityError } from "../src/lib/security/log";

export function load<T>(file: string, mocks: Record<string, unknown>, env: Record<string, string | undefined> = process.env): T {
  const require = createRequire(import.meta.url), loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  runInNewContext(source, { module: loaded, exports: loaded.exports, process: { env }, console, Date, Error, SyntaxError, Buffer, URL, Request, Response, crypto: { randomUUID }, require: (id: string) => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id) });
  return loaded.exports as T;
}
function request(body?: unknown, origin: string | null = "https://example.test", type = "application/json", pathname = "/api/test") {
  return new NextRequest(`https://example.test${pathname}`, { method: "POST", headers: { ...(origin ? { Origin: origin } : {}), "Content-Type": type }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const limiter = { MINUTE_MS: 60000, clientIp: () => "127.0.0.1", checkRateLimit: async () => ({ ok: true, retryAfterMs: 0 }) };
const authMocks = { "@/lib/api": api, "@/lib/auth/password": { DUMMY_PASSWORD_HASH: "hash", hashPassword: async (p: string) => `hash:${p}` }, "@/lib/rate-limit": limiter };

test("Browser mutation boundary rejects absent/foreign/null/subdomain origins and simple form content types", async () => {
  for (const origin of [null, "null", "https://evil.test", "https://sub.example.test"]) assert.equal(browserMutationGuard(request({}, origin))?.status, 403);
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) assert.equal(browserMutationGuard(request({}, undefined, type))?.status, 415);
  assert.equal(browserMutationGuard(request({}, undefined, "Application/JSON; charset=utf-8")), null);
  assert.equal(browserMutationGuard(request(undefined, undefined, ""), false), null);
});

test("All browser write handlers enforce their own origin boundary, provider callbacks keep separate authentication", () => {
  const exceptions = new Set(["billing/webhook/route.ts", "rewards/unsubscribe/route.ts", "admin/upload/route.ts", "investor-portal/business-plan/upload/route.ts"]);
  let checked = 0;
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name === "route.ts") {
        const source = readFileSync(file, "utf8");
        if (exceptions.has(path.relative("src/app/api", file))) continue;
        for (const match of source.matchAll(/export async function (POST|PUT|PATCH|DELETE)\([^)]*\) \{([\s\S]*?)(?=export async function|$)/g)) {
          assert.match(match[2], /^\s*const blocked = browserMutationGuard\(/, file); checked++;
        }
      }
    }
  }
  walk("src/app/api"); assert(checked > 60);
});

test("Admin throttling stops before bcrypt; limiter outage becomes safe 503", async () => {
  let compared = 0, calls = 0;
  const route = load<typeof import("../src/app/api/admin/login/route")>("src/app/api/admin/login/route.ts", {
    ...authMocks, bcryptjs: { compare: async () => { compared++; return false; } },
    "@/lib/auth/session": { ...sessions, createSession: async () => "test" },
    "@/lib/rate-limit": { ...limiter, checkRateLimit: async (key: string) => { if (key !== "admin-login:account") calls++; return { ok: calls <= 10, retryAfterMs: 1500 }; } },
  }, { ADMIN_EMAIL: "admin@example.test", ADMIN_PASSWORD_HASH: "hash" });
  for (let n = 0; n < 10; n++) assert.equal((await route.POST(request({ email: "admin@example.test", password: "wrong" }))).status, 401);
  const blocked = await route.POST(request({ email: "admin@example.test", password: "wrong" }));
  assert.equal(blocked.status, 429); assert.equal(blocked.headers.get("retry-after"), "2"); assert.equal(compared, 10);
  const unavailable = load<typeof route>("src/app/api/admin/login/route.ts", { ...authMocks, bcryptjs: { compare: async () => { compared++; } }, "@/lib/auth/session": sessions,
    "@/lib/rate-limit": { ...limiter, checkRateLimit: async () => { throw new SecurityUnavailableError(); } } }, { ADMIN_EMAIL: "admin@example.test", ADMIN_PASSWORD_HASH: "hash" });
  assert.equal((await unavailable.POST(request({ email: "admin@example.test", password: "wrong" }))).status, 503); assert.equal(compared, 10);
});

test("Former text/plain login CSRF no longer signs a cookie; valid same-origin login still works", async () => {
  let queries = 0, tokens = 0;
  const route = load<typeof import("../src/app/api/auth/login/route")>("src/app/api/auth/login/route.ts", {
    ...authMocks, bcryptjs: { compare: async () => true },
    "@/lib/prisma": { prisma: { user: { findUnique: async () => { queries++; return { id: "a", email: "a@example.test", passwordHash: "hash", sessionVersion: 3 }; } } } },
    "@/lib/auth/session": { ...sessions, createUserSession: async (_id: string, _email: string, version: number) => { assert.equal(version, 3); tokens++; return "test-token"; } },
  });
  const body = { email: "a@example.test", password: "password", padding: "=" };
  for (const [origin, type, status] of [["https://evil.test", "text/plain", 403], ["https://example.test", "text/plain", 415]] as const) {
    const res = await route.POST(request(body, origin, type)); assert.equal(res.status, status); assert.equal(res.headers.has("set-cookie"), false);
  }
  assert.equal(queries, 0); assert.equal(tokens, 0);
  const valid = await route.POST(request(body)); assert.equal(valid.status, 200); assert(valid.headers.has("set-cookie"));
});

test("JWT role/shape, seven-day fixed cutoff, deleted accounts and version revocation", async () => {
  const previous = { secret: process.env.AUTH_SECRET, cutoff: process.env.AUTH_LEGACY_SESSION_ACCEPT_UNTIL };
  process.env.AUTH_SECRET = "local-security-test-secret-not-a-real-credential";
  const issued = Math.floor(Date.now() / 1000) - 3600;
  const cutoff = new Date((issued + 60 + sessions.SESSION_MAX_AGE) * 1000).toISOString().replace(".000Z", "Z");
  process.env.AUTH_LEGACY_SESSION_ACCEPT_UNTIL = cutoff;
  try {
    const token = await sessions.createUserSession("member", "a@example.test", 0);
    const session = (await sessions.verifyUserSession(token))!;
    assert.equal(await sessions.verifySession(token), null);
    assert.equal(await sessions.verifyUserSession(await sessions.createSession("admin@example.test")), null);
    const sign = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt(issued).setExpirationTime(issued + sessions.SESSION_MAX_AGE).sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    assert.equal(await sessions.verifyUserSession(await sign({ role: "user", email: "a@example.test" })), null);
    assert.equal(await sessions.verifyUserSession(await sign({ role: "user", uid: "member", email: "a@example.test", sessionVersion: -1 })), null);
    const legacyToken = await sign({ role: "user", uid: "member", email: "a@example.test" });
    const legacy = (await sessions.verifyUserSession(legacyToken))!;
    assert(sessions.acceptsSessionVersion(legacy, 0)); assert(!sessions.acceptsSessionVersion(legacy, 1));
    assert(!sessions.acceptsSessionVersion(legacy, 0, Date.parse(cutoff)));
    // Old instances can issue valid legacy tokens while the replacement build is running.
    assert(sessions.acceptsSessionVersion({ ...legacy, iat: issued + 120 }, 0));
    assert(!sessions.acceptsSessionVersion({ ...legacy, iat: issued + 120 }, 0, Date.parse(cutoff)));
    assert(sessions.acceptsSessionVersion(session, 0)); assert(!sessions.acceptsSessionVersion(session, 1));
    let record: { email: string; sessionVersion: number } | null = { email: "a@example.test", sessionVersion: 0 };
    const guard = load<typeof import("../src/lib/auth/guard")>("src/lib/auth/guard.ts", { "next/headers": { cookies: async () => ({ get: () => ({ value: token }) }) }, "./session": sessions, "@/lib/prisma": { prisma: { user: { findUnique: async () => record } } } });
    assert(await guard.getUserSession()); record.sessionVersion++; assert.equal(await guard.getUserSession(), null);
    record = null; assert.equal(await guard.getUserSession(), null);
    delete process.env.AUTH_LEGACY_SESSION_ACCEPT_UNTIL; assert(!sessions.acceptsSessionVersion(legacy, 0));
  } finally {
    if (previous.secret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previous.secret;
    if (previous.cutoff === undefined) delete process.env.AUTH_LEGACY_SESSION_ACCEPT_UNTIL; else process.env.AUTH_LEGACY_SESSION_ACCEPT_UNTIL = previous.cutoff;
  }
});

test("Concurrent password changes have one winner and only it receives a new version cookie", async () => {
  let version = 0, hash = "hash:old", reads = 0, release!: () => void;
  const barrier = new Promise<void>(r => { release = r; });
  const route = load<typeof import("../src/app/api/account/password/route")>("src/app/api/account/password/route.ts", {
    ...authMocks, bcryptjs: { compare: async () => true }, "@/lib/auth/guard": { getUserSession: async () => ({ uid: "a", sessionVersion: 0 }) },
    "@/lib/auth/session": { ...sessions, createUserSession: async (_id: string, _email: string, v: number) => `version-${v}` },
    "@/lib/prisma": { prisma: { user: {
      findUnique: async () => { const row = { id: "a", email: "a@example.test", sessionVersion: version, passwordHash: hash }; if (++reads === 2) release(); await barrier; return row; },
      updateMany: async ({ where, data }: { where: { sessionVersion: number; passwordHash: string }; data: { passwordHash: string } }) => { if (where.sessionVersion !== version || where.passwordHash !== hash) return { count: 0 }; version++; hash = data.passwordHash; return { count: 1 }; },
    } } },
  });
  const results = await Promise.all(["new-password-a", "new-password-b"].map(newPassword => route.POST(request({ currentPassword: "old", newPassword }))));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(version, 1);
  assert.equal(results.filter(r => r.headers.has("set-cookie")).length, 1);
});

test("Errors and OAuth redirects never reveal raw secrets, SQL, cookies or SDK bodies", async () => {
  const captured: unknown[] = [], original = console.error;
  console.error = (...values: unknown[]) => { captured.push(values); };
  const secret = "TOP_SECRET_password_cookie_token";
  const error = new Error(`SELECT passwordHash FROM User; postgresql://user:${secret}@host/db Authorization: Bearer ${secret}`);
  try {
    const response = api.failFromError(error); const body = await response.json();
    assert.equal(response.status, 500); assert.match(body.requestId, /^[a-f0-9-]{36}$/); assert.match(body.error, new RegExp(body.requestId));
    logSecurityError("test.provider", { ...error, message: secret, cause: { token: secret }, stack: secret });
    assert.doesNotMatch(JSON.stringify([body, captured]), /TOP_SECRET|SELECT|postgresql|passwordHash/);
    const route = load<typeof import("../src/app/api/auth/google/callback/route")>("src/app/api/auth/google/callback/route.ts", {
      "@/lib/prisma": { prisma: {} }, "@/lib/auth/google": { localePrefixFromNext: () => "", exchangeCodeForProfile: async () => { throw error; } },
      "@/lib/auth/session": sessions, "@/lib/auth/onboarding": {}, "@/lib/auth/return-path": { safeInvestorInvitePath: () => null },
    });
    const req = new NextRequest("https://example.test/api/auth/google/callback?state=s&code=c"); req.cookies.set("g_oauth", JSON.stringify({ state: "s", next: "/" }));
    const res = await route.GET(req); assert.equal(res.status, 307); assert.doesNotMatch(decodeURIComponent(res.headers.get("location")!), /TOP_SECRET|SELECT|postgresql/);
  } finally { console.error = original; }
});

test("Content lookup prevents traversal, encoded paths, and symlink escapes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "roll-security-path-"));
  try {
    const content = path.join(root, "content"); mkdirSync(content); writeFileSync(path.join(content, "valid-slug.json"), "{}"); writeFileSync(path.join(root, "outside.json"), "{}"); symlinkSync(path.join(root, "outside.json"), path.join(content, "escape.json"));
    assert(contentJsonPath(content, "valid-slug"));
    for (const slug of ["../outside", "..%2foutside", "a/b", "a\\b", "/outside", "escape", "constructor.json", "missing"]) assert.equal(contentJsonPath(content, slug), null);
  } finally { rmSync(root, { recursive: true }); }
});

test("Forged PayPal webhook stops before any event or credit write", async () => {
  let writes = 0;
  const route = load<typeof import("../src/app/api/billing/webhook/route")>("src/app/api/billing/webhook/route.ts", {
    "@/lib/prisma": { prisma: { webhookEvent: { upsert: async () => { writes++; } } } }, "@/lib/billing/paypal": { verifyWebhookSignature: async () => false }, "@/lib/billing/reconcile": {}, "@/lib/billing/credits": {},
  });
  const response = await route.POST(request({ id: "forged", event_type: "PAYMENT.CAPTURE.COMPLETED" }, null));
  assert.equal(response.status, 401); assert.equal(writes, 0);
});

test("Patched braces preserves normal patterns and rejects deep or cyclic input before recursive walking", () => {
  let resolve = createRequire(import.meta.url);
  for (const dependency of ["eslint-config-next", "@next/eslint-plugin-next", "fast-glob", "micromatch"]) resolve = createRequire(resolve.resolve(dependency));
  const braces = resolve("braces");
  assert.deepEqual(braces.expand("file-{a,b}-{1..3}.txt"), ["file-a-1.txt", "file-a-2.txt", "file-a-3.txt", "file-b-1.txt", "file-b-2.txt", "file-b-3.txt"]);
  for (const pattern of ["{".repeat(10000) + "a,b" + "}".repeat(10000), "(".repeat(10000) + "x" + ")".repeat(10000)]) {
    for (const method of ["parse", "compile", "expand", "stringify"]) assert.throws(() => braces[method](pattern), SyntaxError);
  }
  const cycle: { nodes: unknown[] } = { nodes: [] }; cycle.nodes.push(cycle);
  for (const method of ["compile", "expand", "stringify"]) assert.throws(() => braces[method](cycle), SyntaxError);
});

test("Blob upload tokens require origin and login; provider callbacks remain independently authenticated", async () => {
  let signed = 0, callback = 0, authenticated = true;
  const sdk = { handleUpload: async (args: { body: { type: string }; onBeforeGenerateToken: (path: string) => Promise<unknown>; onUploadCompleted: (payload: object) => Promise<void> }) => {
    if (args.body.type === "blob.generate-client-token") { await args.onBeforeGenerateToken("investor-business-plans/portal/fixture.pdf"); signed++; }
    else { callback++; await args.onUploadCompleted({}); }
    return { ok: true };
  } };
  const mocks = { "@/lib/api": api, "@vercel/blob/client": sdk, "@vercel/blob": { del: async () => undefined }, "@/lib/auth/guard": { getAdminSession: async () => authenticated ? {} : null },
    "@/lib/auth/account": { getCurrentAccount: async () => authenticated ? { id: "owner" } : null },
    "@/lib/billing/gate": { getEffectivePlan: () => "business" }, "@/lib/billing/plans": { planAtLeast: () => true }, "@/lib/investor/portal": { getOrCreateOwnerPortal: async () => ({ id: "portal" }) }, "@/lib/investor/pdf": { MAX_INVESTOR_PDF_BYTES: 1024 } };
  for (const file of ["src/app/api/admin/upload/route.ts", "src/app/api/investor-portal/business-plan/upload/route.ts"]) {
    const route = load<{ POST: (req: NextRequest) => Promise<Response> }>(file, mocks, { BLOB_READ_WRITE_TOKEN: "public-fixture", INVESTOR_BLOB_READ_WRITE_TOKEN: "private-fixture" });
    const body = { type: "blob.generate-client-token" };
    assert.equal((await route.POST(request(body, "https://evil.test"))).status, 403);
    assert.equal((await route.POST(request(body, null))).status, 403);
    assert.equal((await route.POST(request(body, undefined, "text/plain"))).status, 415);
    authenticated = false; assert.equal((await route.POST(request(body))).status, 401);
    authenticated = true; assert.equal((await route.POST(request(body))).status, 200);
    assert.equal((await route.POST(request({ type: "blob.upload-completed" }, null))).status, 200);
  }
  assert.equal(signed, 2); assert.equal(callback, 2);
});

test("MDX content rejects traversal and retains ordinary content loading", async () => {
  const mdx = createRequire(import.meta.url)("../src/lib/mdx") as typeof import("../src/lib/mdx");
  for (const slug of ["../secrets", "../../.env", "a/b", "a\\b", "%2e%2e", "x".repeat(161)]) {
    await assert.rejects(mdx.loadContent("service", slug, "en"), /Content not found/);
  }
  await assert.rejects(mdx.loadContent("service", "market-entry", "../../secrets" as "en"), /Content not found/);
  const page = await mdx.loadContent("service", "market-entry", "en");
  assert(page.body.length > 0); assert.equal(page.frontmatter.slug, "market-entry");
});
