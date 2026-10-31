import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { audienceDescription, orderInputSchema, uniqueProspects, utcPeriod } from "../src/lib/prospecting/schema";
import { emptyInsight } from "../src/lib/customer-insights/schema";
const native = createRequire(import.meta.url);
function loader(mocks: Record<string, unknown>, env: Record<string, string> = {}, fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { exports: unknown }>();
  function load<T>(file: string): T {
    const path = resolve(file); if (cache.has(path)) return cache.get(path)!.exports as T;
    const loaded = { exports: {} }; cache.set(path, loaded);
    runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, Date, Error, SyntaxError, Response, Request, Headers, URL, Buffer, AbortSignal, TextEncoder, TextDecoder, process: { env }, fetch: fetcher, console, setTimeout, clearTimeout, require: (id: string) => id === "server-only" ? {} : id in mocks ? mocks[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(resolve(dirname(path), `${id}.ts`)) : native(id) });
    return loaded.exports as T;
  }
  return load;
}
const providerCompany = (n = 0) => ({ company_id: randomUUID(), name: `New Buyer ${n}`, domain: `buyer${n}.example.com`, website_url: `https://buyer${n}.example.com`, country_code: "TW", match_quality: "possible", match_note: "Team size remains unconfirmed", researched_at: new Date().toISOString(), fit_evidence: [{ criterion: "Public B2B operations", source_url: `https://buyer${n}.example.com/contact`, observed_at: new Date().toISOString() }], contacts: { emails: [{ value: `info@buyer${n}.example.com`, kind: "company_inbox", status: "published", source_url: `https://buyer${n}.example.com/contact` }], people: [], phones: [] } });
const contactModule = loader({})("src/lib/prospecting/contact.ts") as typeof import("../src/lib/prospecting/contact");
const html = async (url: string) => ({ url, html: `<form><textarea name="message"></textarea>Contact our business team</form> ${new URL(url).hostname.includes("buyer") ? `info@${new URL(url).hostname}` : ""}` });
test("Omrade input only accepts one ISO market and 5/10; buyer ICP and UTC periods stay independent of seller industry", () => {
  const input = { requestId: randomUUID(), revision: 0, country: "TW", description: "Operations teams buying inventory tools", count: 5 };
  assert(orderInputSchema.safeParse(input).success);
  for (const invalid of [{ count: 6 }, { country: "Taiwan" }, { max_charge_cents: 1 }, { description: "" }]) assert(!orderInputSchema.safeParse({ ...input, ...invalid }).success);
  assert.equal(utcPeriod(new Date("2026-10-31T23:59:59Z")), "2026-10");
  assert.equal(utcPeriod(new Date("2026-11-01T00:00:00Z")), "2026-11");
  assert(audienceDescription({ who: "Food distributors", problem: "Inventory planning" }).includes("Food distributors"));
});
test("Public email needs official HTML; shared inboxes, possible matches, private URLs and genuine contact pages are distinguished", async () => {
  const raw = providerCompany();
  const checked = await contactModule.verifyCompany(raw, "TW", html);
  assert.equal(checked.company?.quality, "possible"); assert.equal(checked.company?.contact.name, null);
  assert.equal(checked.company?.contact.kind, "email");
  assert.equal((await contactModule.verifyCompany(raw, "CA", html)).rejection, "wrong_country");
  assert.equal((await contactModule.verifyCompany({ ...raw, website_url: "https://127.0.0.1" }, "TW", html)).rejection, "invalid_fields");
  assert.equal((await contactModule.verifyCompany(raw, "TW", async () => null)).rejection, "unavailable_fit_source");
  assert.equal((await contactModule.verifyCompany(raw, "TW", async url => ({ url, html: "We build B2B tools; no email, no form" }))).company, undefined);
  for (const body of ["<form><input type='email'>Newsletter signup</form>", "<a href='tel:123'>Call</a>"]) assert.equal((await contactModule.verifyCompany({ ...raw, contacts: { emails: [], people: [] } }, "TW", async url => ({ url, html: body }))).company, undefined, "Newsletter or phone-only data is not a verified contact route");
  const page = await contactModule.verifyCompany({ ...raw, contacts: { emails: [], people: [] } }, "TW", html);
  assert.equal(page.company?.contact.kind, "page");
  const person = { name: "Alex", role: "Operations", role_status: "published", role_source_url: raw.website_url + "/contact", email: raw.contacts.emails[0].value, email_status: "published", email_source_url: raw.website_url + "/contact" };
  assert.equal((await contactModule.verifyCompany({ ...raw, contacts: { emails: [], people: [person] } }, "TW", html)).company?.contact.name, null, "info@ is not a personal email even if vendor attaches a name");
  const named = { ...person, email: `alex@${raw.domain}` };
  assert.equal((await contactModule.verifyCompany({ ...raw, contacts: { emails: [], people: [named] } }, "TW", async url => ({ url, html: `Alex Operations alex@${raw.domain}` }))).company?.contact.name, "Alex");
  const company = checked.company!;
  assert.equal(uniqueProspects([company, company], []).length, 1);
  assert.equal(uniqueProspects([company], [" Ｎｅｗ Ｂｕｙｅｒ 0 Co., Ltd. "]).length, 0);
  assert.equal(uniqueProspects([company], [raw.website_url]).length, 0);
});
test("Omrade v1.0.3 accepts an omitted people array and inbox kind without inventing a named contact", async () => {
  const raw = providerCompany();
  const inbox = { value: raw.contacts.emails[0].value, status: "published", source_url: raw.contacts.emails[0].source_url };
  const result = await contactModule.verifyCompany({ ...raw, contacts: { phones: [], emails: [inbox] } }, "TW", html);
  assert.equal(result.company?.contact.kind, "email");
  assert.equal(result.company?.contact.value, inbox.value);
  assert.equal(result.company?.contact.name, null);
  assert.equal(result.company?.contact.role, null);
  assert.equal((await contactModule.verifyCompany({ ...raw, contacts: { phones: [], emails: [inbox], people: null } }, "TW", html)).rejection, "invalid_fields");
  assert.equal((await contactModule.verifyCompany({ ...raw, contacts: { phones: [], emails: [{ ...inbox, source_url: "https://127.0.0.1/contact" }] } }, "TW", html)).rejection, "invalid_fields");
});
test("HTML reader pins public DNS, rejects private/oversized/non-HTML sources and bounds redirects without credentials", async () => {
  type Reply = { status?: number; location?: string; type?: string; size?: number; html?: string };
  function checker(replies: Reply[], address = "93.184.216.34") {
    let attempts = 0, signal: AbortSignal | undefined;
    const load = loader({
      "node:dns": { lookup: (_host: string, options: { family: number; all: boolean }, callback: (e: null, rows: { address: string; family: number }[]) => void) => { assert.equal(options.family, 4); assert(options.all); callback(null, [{ address, family: 4 }]); } },
      "node:https": { get: (url: string, options: { signal: AbortSignal; family: number; headers: Record<string, string>; lookup: (host: string, options: object, callback: (e: Error | null, address: string, family: number) => void) => void }, respond: (reply: object) => void) => {
        const request = new EventEmitter(), reply = replies[attempts++] || {}; assert.equal(options.family, 4);
        assert(!("Authorization" in options.headers) && !("Cookie" in options.headers));
        if (signal) assert.equal(options.signal, signal); else signal = options.signal;
        queueMicrotask(() => options.lookup(new URL(url).hostname, {}, (error, pinned, family) => {
          if (error) { request.emit("error", error); return; }
          assert.equal(pinned, address); assert.equal(family, 4);
          const result = Object.assign(new EventEmitter(), { statusCode: reply.status || 200, headers: { "content-type": reply.type || "text/html", "content-length": reply.size, location: reply.location }, destroy() {} });
          respond(result); queueMicrotask(() => { result.emit("data", Buffer.from(reply.html || "<form>Contact</form>")); result.emit("end"); });
        })); return request;
      } },
    });
    return { read: load<typeof import("../src/lib/prospecting/contact")>("src/lib/prospecting/contact.ts").readPublicPage, attempts: () => attempts };
  }
  const url = "https://buyer.example.com/contact", website = "https://buyer.example.com";
  assert(await checker([{}]).read(url, website));
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1"]) assert.equal(await checker([{}], address).read(url, website), null);
  for (const reply of [{ status: 403 }, { type: "application/pdf" }, { size: 262145 }, { html: "x".repeat(262145) }]) assert.equal(await checker([reply]).read(url, website), null);
  assert(await checker([{ status: 302, location: "/contact-us" }, {}]).read(url, website));
  for (const location of ["http://buyer.example.com/contact", "https://different.example.com/contact", "https://127.0.0.1/contact"]) { const c = checker([{ status: 302, location }, {}]); assert.equal(await c.read(url, website), null); assert.equal(c.attempts(), 1); }
  const loop = checker(Array(4).fill({ status: 302, location: "/contact" })); assert.equal(await loop.read(url, website), null); assert.equal(loop.attempts(), 3);
});
test("Client enforces fixed HTTPS origin, stable POST key, Retry-After and safe credential errors", async () => {
  let status = 429;
  const client = loader({}, { OMRADE_API_KEY: "private-test-key", OMRADE_ENABLED: "true" }, async (url, init) => {
    assert(String(url).startsWith("https://omrade.app/api/v1/prospecting/"));
    assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "stable-key");
    return new Response(JSON.stringify({ error: { message: "secret private-test-key" } }), { status, headers: { "Retry-After": "120", "x-request-id": "trace-qa" } });
  })("src/lib/prospecting/client.ts") as typeof import("../src/lib/prospecting/client");
  await assert.rejects(client.omradeRequest("https://other.example.com"));
  await assert.rejects(client.omradeRequest("/orders", {}, undefined));
  await assert.rejects(client.omradeRequest("/orders", {}, "stable-key"), (e: unknown) => { const x = e as { retryAfter: number; message: string }; assert.equal(x.retryAfter, 120); assert(!x.message.includes("private-test-key")); return true; });
  status = 402; await assert.rejects(client.omradeRequest("/orders", {}, "stable-key"), /免費|free/);
});
test("Provider timestamps accept RFC3339 offsets and fractional seconds, but reject timezone-free dates", () => {
  const { orderResponse } = loader({})("src/lib/prospecting/client.ts") as typeof import("../src/lib/prospecting/client");
  const body = { order_id: randomUUID(), icp_id: randomUUID(), icp_version: 1, status: "queued", requested_count: 5, delivered_count: 0, created_at: "2026-10-31T05:15:04.045332+00:00", delivered_at: null, companies: [], billing: { period: "2026-10", currency: "USD", max_charge_cents: 0, amount_cents: 0, free_companies: 0, paid_companies: 0 } };
  assert(orderResponse.safeParse(body).success);
  assert(orderResponse.safeParse({ ...body, delivered_at: "2026-11-01T00:15:04.045332+08:00" }).success);
  assert(!orderResponse.safeParse({ ...body, created_at: "2026-10-31T05:15:04" }).success);
});

test("Omrade durable orders in isolated PostgreSQL", { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async t => {
  const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL!, url = new URL(connectionString);
  assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 12 }) });
  const full = new Set<string>(), ids: string[] = [];
  let failSave = false;
  const serviceDB = db.$extends({ query: { prospectingOrder: { update({ args, query }) { if (failSave && args.data.status === "completed") throw new Error("Injected final save failure"); return query(args); } } } });
  let mode = "complete", contactsAvailable = true, rateAllowed = true, uid = "", sequence = 0;
  const calls: { path: string; key: string | null; body: Record<string, unknown> | null }[] = [], vendor = new Map<string, Record<string, unknown>>();
  const icpId = randomUUID();
  const env: Record<string, string> = { OMRADE_ENABLED: "true", OMRADE_API_KEY: "mock-only-key" };
  const fetcher: typeof fetch = async (target, init) => {
    const path = new URL(String(target)).pathname.replace("/api/v1/prospecting", "");
    const key = new Headers(init?.headers).get("Idempotency-Key"), body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, key, body });
    assert(String(target).startsWith("https://omrade.app/api/v1/prospecting"));
    if (path.startsWith("/icps")) { assert(key); assert(!JSON.stringify(body).includes("PRIVATE_INTERVIEW")); return Response.json({ icp_id: icpId, version: path.endsWith("versions") ? 2 : 1 }); }
    if (path === "/orders") {
      assert.equal(body.max_charge_cents, 0); assert(key);
      if (mode === "exhausted") return Response.json({ error: { code: "free_allowance_exhausted" } }, { status: 402 });
      let result = vendor.get(key!);
      if (!result) { const companies = Array.from({ length: body.count }, () => providerCompany(++sequence)); result = { order_id: randomUUID(), icp_id: body.icp_id, icp_version: body.icp_version, requested_count: body.count, delivered_count: body.count, companies, status: "completed", created_at: new Date().toISOString(), delivered_at: new Date().toISOString(), billing: { period: utcPeriod(), currency: "USD", max_charge_cents: 0, amount_cents: 0, free_companies: body.count, paid_companies: 0 } }; vendor.set(key!, result); }
      if (mode === "uncertain") { mode = "complete"; throw new Error("Connection closed after vendor acceptance"); }
      if (mode === "queued") return Response.json({ ...result, created_at: String(result.created_at).replace("Z", "+00:00"), status: "queued", delivered_count: 0, companies: [], delivered_at: null, billing: { ...(result.billing as object), free_companies: 0 } }, { status: 202, headers: { "Retry-After": "30" } });
      if (mode === "insufficient") return Response.json({ ...result, status: "failed", delivered_count: 0, companies: [], delivered_at: null, failure: { code: "insufficient_matches", message: "secret private-test-key" }, billing: { ...(result.billing as object), free_companies: 0 } });
      if (mode === "bad-release") return Response.json({ ...result, status: "failed", delivered_count: 0, companies: [], delivered_at: null });
      if (mode === "offset") { const created_at = `${String(result.created_at).slice(0, 7)}-01T00:30:00+08:00`; return Response.json({ ...result, created_at, billing: { ...(result.billing as object), period: utcPeriod(new Date(created_at)) } }); }
      return Response.json(result);
    }
    const result = [...vendor.values()].find(v => path === `/orders/${v.order_id}`);
    if (mode === "expired") return new Response(null, { status: 410 });
    if (mode === "limited") return new Response(null, { status: 429, headers: { "Retry-After": "120" } });
    assert(result); return Response.json(result);
  };
  const load = loader({ "@/lib/prisma": { prisma: serviceDB }, "@/lib/network/access": { features: async (id: string) => ({ prospects: full.has(id) }) }, "@/lib/rate-limit": { MINUTE_MS: 60000, HOUR_MS: 3600000, checkRateLimit: async () => ({ ok: rateAllowed, retryAfterMs: 60000 }) }, "@/lib/member-http": { memberAccess: async () => uid || Response.json({ error: "Unauthorized" }, { status: 401 }), privateOk: (data: unknown, status = 200) => Response.json({ data }, { status }), memberError: () => Response.json({ error: "Safe failure" }, { status: 500 }) }, "./contact": { verifyCompany: (raw: unknown, country: string) => contactModule.verifyCompany(raw, country, contactsAvailable ? html : async () => null) }, "@/lib/security/http": { browserMutationGuard: () => null }, "@/lib/ai/allowance": { reserveAiUsage: () => { throw new Error("Company search must not debit AI"); } }, "@anthropic-ai/sdk": class { constructor() { throw new Error("Company search must not call Anthropic"); } } }, env, fetcher);
  const service = load<typeof import("../src/lib/prospecting/service")>("src/lib/prospecting/service.ts"), worker = load<typeof import("../src/lib/prospecting/worker")>("src/lib/prospecting/worker.ts");
  const input = (revision = 0, count: 5 | 10 = 5) => ({ requestId: randomUUID(), revision, country: "TW", description: "Inventory operations buyers in Taiwan", count });
  async function member(paid = true) { const user = await db.user.create({ data: { email: `omrade-${randomUUID()}@example.invalid`, ...(paid ? {} : { trialPolicy: "interviews-3-v1", trialPlan: "pro", trialStartsAt: new Date(Date.now() - 1000), trialEndsAt: new Date(Date.now() + 86400000) }) } }); ids.push(user.id); if (paid) full.add(user.id); return user; }
  const due = (id: string) => db.prospectingOrder.update({ where: { id }, data: { nextAttemptAt: new Date(0) } });
  const clean = async (id: string) => { await db.user.delete({ where: { id } }); };
  try {
    await t.test("Failed full-count research releases all quota with a safe specific reason; UTC admission month accepts offsets", async () => {
      const user = await member(); mode = "insufficient";
      const failed = await service.createProspectOrder(user.id, input()); await worker.runProspecting();
      const result = await service.getProspectOrder(user.id, failed.id);
      assert.equal(result.status, "failed"); assert.equal(result.delivered, 0); assert.equal(result.usable, 0);
      assert.equal(result.code, "provider_insufficient_matches"); assert.match(result.error!, /足額|enough/); assert(!result.error!.includes("private-test-key"));
      assert.equal((await service.prospectSnapshot(user.id)).quota.reserved, 0);
      await clean(user.id);
      const inconsistentUser = await member(); mode = "bad-release";
      const inconsistentOrder = await service.createProspectOrder(inconsistentUser.id, input()); await worker.runProspecting();
      const inconsistentResult = await service.getProspectOrder(inconsistentUser.id, inconsistentOrder.id);
      assert.equal(inconsistentResult.code, "provider_contract");
      assert.equal((await service.prospectSnapshot(inconsistentUser.id)).quota.reserved, 5, "An inconsistent failure receipt cannot silently release the reservation");
      await clean(inconsistentUser.id);
      const offsetUser = await member(); mode = "offset";
      const offsetOrder = await service.createProspectOrder(offsetUser.id, input()); await worker.runProspecting();
      const offsetResult = await service.getProspectOrder(offsetUser.id, offsetOrder.id);
      assert.equal(offsetResult.status, "completed"); assert.equal(offsetResult.usable, 5);
      const row = await db.prospectingOrder.findUniqueOrThrow({ where: { id: offsetOrder.id } });
      assert.equal(offsetResult.period, utcPeriod(row.acceptedAt!)); assert.notEqual(offsetResult.period, utcPeriod());
      await clean(offsetUser.id); mode = "complete";
    });
    await t.test("Two entrances and retries share a single frozen order; changed payload and cross-owner access fail", async () => {
      const user = await member(), body = input(), beforeCalls = calls.length; uid = user.id;
      const route = load<{ POST: (req: Request) => Promise<Response> }>("src/app/api/prospects/orders/route.ts");
      const request = () => new Request("https://rollon.com.tw/api/prospects/orders", { method: "POST", body: JSON.stringify(body) });
      const results = await Promise.all([route.POST(request()), route.POST(request())]); assert(results.every(r => r.status === 202));
      const orders = await db.prospectingOrder.findMany({ where: { userId: user.id } }); assert.equal(orders.length, 1); const order = orders[0];
      assert.equal(calls.length, beforeCalls, "Client POST only persists; no foreground provider network");
      await assert.rejects(service.createProspectOrder(user.id, { ...body, description: "Different targeting" }), /不同內容|different/);
      await assert.rejects(service.getProspectOrder("other", order.id), /找不到|not found/);
      const snap = await service.prospectSnapshot(user.id); assert.equal(snap.quota.reserved, 5);
      await worker.runProspecting();
      const complete = await service.getProspectOrder(user.id, order.id); assert.equal(complete.usable, 5); assert.equal(complete.delivered, 5);
      assert(!JSON.stringify(complete).includes("mock-only-key"));
      const before = calls.length; await worker.recheckProspectOrder(user.id, order.id); assert.equal(calls.length, before, "Recheck uses no vendor or AI calls");
      const selected = complete.companies[0]; const [a, b] = await Promise.all([service.addProspectContact(user.id, order.id, selected.id), service.addProspectContact(user.id, order.id, selected.id)]); assert.equal(a.id, b.id);
      assert.equal((await service.getProspectOrder(user.id, order.id)).usable, 4, "Saved companies are excluded on every read");
      assert.equal((await service.prospectSnapshot(user.id)).quota.delivered, 5, "Filtering does not erase vendor usage");
      await clean(user.id);
    });
    await t.test("200/202 polling honors minimum Retry-After, 429 and 410 never recreate an accepted order", async () => {
      const user = await member(); mode = "queued"; const order = await service.createProspectOrder(user.id, input()); await worker.runProspecting();
      let row = await db.prospectingOrder.findUniqueOrThrow({ where: { id: order.id } }); assert.equal(row.status, "queued"); assert(row.nextAttemptAt.getTime() > Date.now() + 25000);
      mode = "limited"; await due(order.id); await worker.runProspecting(); row = await db.prospectingOrder.findUniqueOrThrow({ where: { id: order.id } }); assert(row.nextAttemptAt.getTime() > Date.now() + 110000); assert.equal(row.reservedCount, 5);
      mode = "expired"; const posts = calls.filter(c => c.path === "/orders").length; await due(order.id); await worker.runProspecting(); assert.equal(calls.filter(c => c.path === "/orders").length, posts); assert.equal((await db.prospectingOrder.findUniqueOrThrow({ where: { id: order.id } })).reservedCount, 5);
      mode = "complete"; await due(order.id); await worker.runProspecting(); assert.equal((await service.getProspectOrder(user.id, order.id)).status, "completed"); await clean(user.id);
    });
    await t.test("Unknown acceptance beyond 40 minutes replays identical UUID/body and preserves reservation", async () => {
      const user = await member(); mode = "uncertain"; const order = await service.createProspectOrder(user.id, input()); await worker.runProspecting();
      let row = await db.prospectingOrder.findUniqueOrThrow({ where: { id: order.id } }); assert.equal(row.providerOrderId, null); assert.equal(row.reservedCount, 5);
      await db.prospectingOrder.update({ where: { id: order.id }, data: { submittedAt: new Date(Date.now() - 41 * 60000) } });
      mode = "limited"; rateAllowed = false; await due(order.id); await worker.runProspecting(); rateAllowed = true; row = await db.prospectingOrder.findUniqueOrThrow({ where: { id: order.id } }); assert.equal(row.status, "reconciling"); assert.equal(row.reservedCount, 5);
      mode = "complete"; await due(order.id); await worker.runProspecting();
      const attempts = calls.filter(c => c.path === "/orders" && c.key === row.orderKey); assert.equal(attempts.length, 2); assert.deepEqual(attempts[0].body, attempts[1].body); assert.equal((await service.getProspectOrder(user.id, order.id)).delivered, 5); await clean(user.id);
    });
    await t.test("Version conflicts, monthly reservations and parallel creates cannot exceed ten deliveries", async () => {
      const user = await member(); const first = await service.createProspectOrder(user.id, input(0, 10)); await worker.runProspecting();
      await assert.rejects(service.createProspectOrder(user.id, input(0)), /另一頁|another tab/);
      await assert.rejects(service.createProspectOrder(user.id, input(1)), /月|Monthly/);
      const row = await db.prospectingOrder.findUniqueOrThrow({ where: { id: first.id } }); await db.prospectingOrder.update({ where: { id: row.id }, data: { period: "2000-01" } });
      const results = await Promise.allSettled([service.createProspectOrder(user.id, input(1)), service.createProspectOrder(user.id, input(1))]); assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal((await service.prospectSnapshot(user.id)).quota.reserved, 5);
      await clean(user.id);
    });
    await t.test("Free exhaustion releases reservation; disabled/expired access creates no new order", async () => {
      const user = await member(); mode = "exhausted"; const order = await service.createProspectOrder(user.id, input()); await worker.runProspecting(); const result = await service.getProspectOrder(user.id, order.id); assert.equal(result.status, "failed"); assert.equal(result.code, "free_exhausted"); assert.equal((await service.prospectSnapshot(user.id)).quota.reserved, 0);
      env.OMRADE_ENABLED = "false"; await assert.rejects(service.createProspectOrder(user.id, input(1)), /尚未開放|not configured/); env.OMRADE_ENABLED = "true";
      env.OMRADE_WORKER_ENABLED = "false"; const requests = calls.length; assert.deepEqual(JSON.parse(JSON.stringify(await worker.runProspecting())), { enabled: false, processed: 0 }); assert.equal(calls.length, requests); await assert.rejects(service.createProspectOrder(user.id, input(1)), /尚未開放|not configured/); delete env.OMRADE_WORKER_ENABLED;
      full.delete(user.id); await assert.rejects(service.createProspectOrder(user.id, input(1)), /需要|NOVA/); mode = "complete"; await clean(user.id);
    });
    await t.test("Changed targeting creates a new vendor ICP version; old usable history is retained without automatic reorders", async () => {
      const user = await member(); const first = await service.createProspectOrder(user.id, input()); await worker.runProspecting();
      const second = await service.createProspectOrder(user.id, { ...input(1), description: "Food distribution operations teams" }); await worker.runProspecting();
      const versions = calls.filter(c => c.path.endsWith("/versions")); assert(versions.some(c => JSON.stringify(c.body).includes("Food distribution")));
      assert.equal((await db.prospectingOrder.findUniqueOrThrow({ where: { id: second.id } })).omradeIcpVersion, 2);
      const history = await service.getProspectOrder(user.id, first.id); assert(history.stale); assert(!history.needsRecheck); assert.equal(history.usable, 5); await clean(user.id);
    });
    await t.test("Overlapping workers retain the global five-active-order limit and one lease per order", async () => {
      const users = await Promise.all(Array.from({ length: 6 }, () => member())); mode = "queued";
      for (const user of users) await service.createProspectOrder(user.id, input());
      const before = calls.filter(c => c.path === "/orders").length;
      await Promise.all([worker.runProspecting(), worker.runProspecting()]);
      assert.equal(calls.filter(c => c.path === "/orders").length - before, 5);
      assert.equal(await db.prospectingOrder.count({ where: { userId: { in: users.map(u => u.id) }, providerOrderId: { not: null } } }), 5);
      mode = "complete"; for (const user of users) await clean(user.id);
    });
    await t.test("Final save failure rolls back the lifetime POC claim; recovered checking retries without new orders", async () => {
      const user = await member(false), journey = await db.discoveryJourney.create({ data: { userId: user.id } });
      for (const company of ["One", "Two", "Three"]) await db.meetingNote.create({ data: { userId: user.id, title: "QA", insight: { ...emptyInsight("discover"), journeyId: journey.id, company, notes: "Valid evidence" } } });
      const order = await service.createProspectOrder(user.id, input()); failSave = true;
      await worker.runProspecting(); failSave = false;
      assert.equal(await db.prospectingTrialGrant.count({ where: { userId: user.id } }), 0);
      assert.equal((await service.getProspectOrder(user.id, order.id)).status, "checking");
      const before = calls.length; await due(order.id); await worker.runProspecting(); assert.equal(calls.length, before); assert.equal(await db.prospectingTrialGrant.count({ where: { userId: user.id } }), 1); await clean(user.id);
    });
    await t.test("Trial POC counts three distinct valid companies, zero-quality retry and lifetime grant survive order removal", async () => {
      const user = await member(false), journey = await db.discoveryJourney.create({ data: { userId: user.id } });
      await assert.rejects(service.createProspectOrder(user.id, input()), /三家|three/);
      for (const company of ["Alpha", " ALPHA ", "Beta", "Gamma"]) await db.meetingNote.create({ data: { userId: user.id, title: "QA interview", body: "PRIVATE_INTERVIEW", insight: { ...emptyInsight("discover"), journeyId: journey.id, company, notes: "PRIVATE_INTERVIEW" } } });
      assert.equal((await service.eligibility(user.id)).interviews, 3);
      await assert.rejects(service.createProspectOrder(user.id, input(0, 10)), /五家|five/);
      contactsAvailable = false; const first = await service.createProspectOrder(user.id, input()); await worker.runProspecting(); assert.equal((await service.getProspectOrder(user.id, first.id)).usable, 0); assert.equal(await db.prospectingTrialGrant.count({ where: { userId: user.id } }), 0);
      contactsAvailable = true; const second = await service.createProspectOrder(user.id, input(1)); await worker.runProspecting(); assert.equal((await service.getProspectOrder(user.id, second.id)).usable, 5); assert.equal(await db.prospectingTrialGrant.count({ where: { userId: user.id } }), 1); assert.equal((await service.prospectSnapshot(user.id)).quota.delivered, 10);
      await assert.rejects(worker.recheckProspectOrder(user.id, first.id), /POC/);
      await assert.rejects(service.addProspectContact(user.id, second.id, (await service.getProspectOrder(user.id, second.id)).companies[0].id), /升級|Upgrade/);
      await db.prospectingOrder.delete({ where: { id: second.id } }); assert.equal(await db.prospectingTrialGrant.count({ where: { userId: user.id } }), 1); await assert.rejects(service.createProspectOrder(user.id, input(2)), /一次|once/); await clean(user.id);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); }
});
