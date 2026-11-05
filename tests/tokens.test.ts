import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

test("Independent Token ledger: atomic holds, settlement, expiry, concurrency, ownership and legacy preservation", async t => {
  const url = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
  if (!url) { t.skip("Explicit isolated QA database required"); return; }
  const target = new URL(url); assert(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const ids: string[] = [], native = createRequire(import.meta.url), cache = new Map<string, { exports: unknown }>();
  let clock = Date.now(), admin = false; const actor = "";
  class Clock extends Date { constructor(value?: string | number) { super(value === undefined ? clock : value); } static now() { return clock; } }
  class MemberError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/auth/account": { getBetaAccess: async () => false },
    "@/lib/member-http": { MemberError, changed: () => new MemberError("Content changed", 409), memberAccess: async () => actor || Response.json({ error: "Unauthorized" }, { status: 401 }), privateOk: (data: unknown) => Response.json({ data }), memberError: (error: Error) => Response.json({ error: error.message }, { status: error instanceof MemberError ? error.status : 500 }) },
    "@/lib/auth/guard": { getAdminSession: async () => admin ? { email: "qa-admin@example.invalid" } : null },
    "@/lib/security/http": { browserMutationGuard: () => null }, "@/lib/security/log": { logSecurityError() {} },
    "@/lib/rate-limit": { DAY_MS: 86400000, MINUTE_MS: 60000, HOUR_MS: 3600000, checkRateLimit: async () => ({ ok: true }) },
    "@anthropic-ai/sdk": class { constructor() { throw new Error("Token ledger must not call AI"); } },
  };
  function load<T>(file: string): T {
    const path = resolve(file); if (cache.has(path)) return cache.get(path)!.exports as T;
    const loaded = { exports: {} }; cache.set(path, loaded);
    runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, Date: Clock, Error, Response, Request, Headers, Buffer, URL, process: { cwd: () => process.cwd(), env: { ...process.env, MEMBER_NETWORK_ENABLED: "true", MEMBER_NETWORK_EMAIL_ENABLED: "false" } }, console, setTimeout, clearTimeout, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(resolve(dirname(path), `${id}.ts`)) : native(id) });
    return loaded.exports as T;
  }
  const tokens = load<typeof import("../src/lib/tokens/service")>("src/lib/tokens/service.ts");
  const network = load<typeof import("../src/lib/network/service")>("src/lib/network/service.ts");
  const expiry = load<typeof import("../src/lib/tokens/expiry")>("src/lib/tokens/expiry.ts");
  const routes = load<typeof import("../src/app/api/admin/tokens/route")>("src/app/api/admin/tokens/route.ts");
  async function member(paid = true) {
    const row = await db.user.create({ data: { email: `token-${randomUUID()}@example.invalid`, ...(paid ? { plan: "business", subscriptionStatus: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 366 * 86400000), paypalSubscriptionId: `qa-${randomUUID()}` } : {}), profile: { create: { companyName: "Token QA", country: "TW", industry: "SaaS" } }, matchmakingProfile: { create: { visible: true, role: "founder", country: "TW", industry: "SaaS", categories: ["collaboration"], visibleFields: [], slogan: "", offers: "", looksFor: "" } } }, include: { matchmakingProfile: true } }); ids.push(row.id); return row;
  }
  const tx = <T>(fn: (db: Parameters<typeof tokens.lockWallet>[0]) => Promise<T>) => db.$transaction(fn);
  const snapshot = async (id: string) => { const s = await tokens.tokenSnapshot(id); return [s.available, s.reserved]; };
  const invite = (profileId: string) => ({ profileId, requestId: randomUUID(), pricingVersion: 1 as const, opening: "Hello, can we discuss customer research?", conditions: [] });
  const patch = (body: unknown) => new Request("https://example.com/api/admin/tokens", { method: "PATCH", body: JSON.stringify(body) });
  try {
    await t.test("Monthly grants are independent, once per UTC month, concurrent-safe and preserve AI balances and plans", async () => {
      const user = await member();
      await db.aiAllowance.create({ data: { userId: user.id, bonusBalance: 73 } });
      const before = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      await Promise.all(Array.from({ length: 6 }, () => tokens.tokenSnapshot(user.id)));
      assert.deepEqual(await snapshot(user.id), [150, 0]); assert.equal(await db.tokenLedger.count({ where: { userId: user.id } }), 1);
      clock = new Date(Date.now()).setUTCMonth(new Date().getUTCMonth() + 1);
      assert.deepEqual(await snapshot(user.id), [300, 0]); clock = Date.now();
      assert.equal((await db.aiAllowance.findUniqueOrThrow({ where: { userId: user.id } })).bonusBalance, 73);
      assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: user.id } }), before);
      const free = await member(false); assert.deepEqual(await snapshot(free.id), [0, 0]);
      await db.user.update({ where: { id: free.id }, data: { plan: "business", subscriptionStatus: "ACTIVE", currentPeriodEnd: new Date(0) } });
      assert.deepEqual(await snapshot(free.id), [0, 0]);
    });
    await t.test("One invitation hold per request and pair; changed retries fail, acceptance captures once and delivers opening once", async () => {
      const sender = await member(), recipient = await member(), body = invite(recipient.matchmakingProfile!.id);
      const all = await Promise.all([network.invite(sender.id, body), network.invite(sender.id, body)]); assert.equal(all[0].id, all[1].id);
      assert.deepEqual(await snapshot(sender.id), [145, 5]);
      await assert.rejects(network.invite(sender.id, { ...body, opening: "Changed text" }), /different|不同/);
      await network.invite(sender.id, { ...body, requestId: randomUUID() }); assert.deepEqual(await snapshot(sender.id), [145, 5]);
      const stranger = await member(); await assert.rejects(network.changeConnection(stranger.id, all[0].id, { action: "accept", revision: 1 }));
      await Promise.all([network.changeConnection(recipient.id, all[0].id, { action: "accept", revision: 1 }), network.changeConnection(recipient.id, all[0].id, { action: "accept", revision: 1 })]);
      assert.deepEqual(await snapshot(sender.id), [145, 0]);
      assert.equal(await db.networkMessage.count({ where: { connectionId: all[0].id, body: body.opening } }), 1);
      assert.equal(await db.networkShare.count({ where: { connectionId: all[0].id } }), 0);
      await db.user.update({ where: { id: sender.id }, data: { currentPeriodEnd: new Date(0) } });
      await db.matchmakingProfile.update({ where: { id: recipient.matchmakingProfile!.id }, data: { visible: false } });
      assert.equal((await network.invite(sender.id, body)).id, all[0].id, "A lost acknowledgement remains replayable after entitlement expiry or a hidden card");
      await network.changeConnection(sender.id, all[0].id, { action: "block", revision: 2 }); assert.deepEqual(await snapshot(sender.id), [145, 0]);
    });
    await t.test("Decline, sender cancellation and pre-acceptance blocking release exactly one hold", async () => {
      for (const action of ["decline", "cancel", "block"] as const) {
        const sender = await member(), recipient = await member(), body = invite(recipient.matchmakingProfile!.id), row = await network.invite(sender.id, body);
        const who = action === "cancel" ? sender.id : recipient.id;
        await network.changeConnection(who, row.id, { action, revision: 1 });
        await network.changeConnection(who, row.id, { action, revision: 1 });
        assert.deepEqual(await snapshot(sender.id), [150, 0]);
        assert.equal(await db.tokenLedger.count({ where: { userId: sender.id, kind: "release" } }), 1);
      }
    });
    await t.test("Late acceptance commits expiry/refund before returning an error; sweep races never capture a released hold", async () => {
      const sender = await member(), recipient = await member(), row = await network.invite(sender.id, invite(recipient.matchmakingProfile!.id));
      await db.tokenReservation.updateMany({ where: { resourceId: row.id }, data: { expiresAt: new Date(0) } });
      await assert.rejects(network.changeConnection(recipient.id, row.id, { action: "accept", revision: 1 }), /expired|逾/);
      assert.equal((await db.networkConnection.findUniqueOrThrow({ where: { id: row.id } })).status, "expired"); assert.deepEqual(await snapshot(sender.id), [150, 0]);
      const row2 = await network.invite(sender.id, invite(recipient.matchmakingProfile!.id));
      await db.tokenReservation.updateMany({ where: { resourceId: row2.id, status: "reserved" }, data: { expiresAt: new Date(0) } });
      await Promise.allSettled([expiry.expireTokens(sender.id), network.changeConnection(recipient.id, row2.id, { action: "accept", revision: 3 })]);
      assert.deepEqual(await snapshot(sender.id), [150, 0]);
      assert.equal(await db.tokenLedger.count({ where: { userId: sender.id, kind: "capture" } }), 0);
    });
    await t.test("Insufficient balance rolls back the connection, notification and reservation together", async () => {
      const sender = await member(), recipient = await member(); await tokens.tokenSnapshot(sender.id);
      await tx(db => tokens.grantTokens(db, sender.id, -149, `qa-debit:${sender.id}`, "QA fixture debit"));
      await assert.rejects(network.invite(sender.id, invite(recipient.matchmakingProfile!.id)), /Insufficient|不足/);
      assert.equal(await db.networkConnection.count({ where: { senderId: sender.id } }), 0);
      assert.equal(await db.tokenReservation.count({ where: { userId: sender.id } }), 0);
      assert.deepEqual(await snapshot(sender.id), [1, 0]);
    });
    await t.test("Legacy pending invitations accept without retroactive Token holds", async () => {
      const sender = await member(), recipient = await member();
      const row = await db.networkConnection.create({ data: { pairKey: [sender.id, recipient.id].sort().join(":"), senderId: sender.id, recipientId: recipient.id } });
      await network.changeConnection(recipient.id, row.id, { action: "accept", revision: 1 });
      assert.equal(await db.tokenLedger.count({ where: { userId: sender.id } }), 0);
    });
    await t.test("Admin adjustments require auth, preserve held balance, reject changed retry and cannot overdraw", async () => {
      const user = await member(); const body = { userId: user.id, requestId: randomUUID(), amount: 30, reason: "Approved manual QA grant" };
      const post = (value = body) => new Request("https://example.com/api/admin/tokens", { method: "POST", body: JSON.stringify(value) });
      assert.equal((await routes.POST(post())).status, 401); admin = true;
      assert.equal((await routes.POST(post())).status, 200); assert.equal((await routes.POST(post())).status, 200);
      assert.equal((await routes.POST(post({ ...body, amount: 31 }))).status, 409);
      assert.deepEqual(await snapshot(user.id), [180, 0]);
      assert.equal((await routes.POST(post({ ...body, requestId: randomUUID(), amount: -181 }))).status, 402);
      const other = await member(); const record = await db.tokenLedger.findFirstOrThrow({ where: { userId: other.id } }).catch(() => null); assert.equal(record, null);
      const own = await db.tokenLedger.findFirstOrThrow({ where: { userId: user.id } }); await assert.rejects(tokens.tokenSnapshot(other.id, own.id), /Invalid|無效/);
    });
    await t.test("Unsubmitted search expires even with worker disabled; submitted unknown holds require explicit audited reconciliation", async () => {
      const user = await member();
      async function order(submitted: boolean) {
        const row = await db.prospectingOrder.create({ data: { userId: user.id, requestId: randomUUID(), payloadHash: "qa", country: "TW", description: "QA buyers", count: 5, period: "2099-01", reservedCount: 5, audienceRequest: {}, audienceKey: randomUUID(), orderKey: randomUUID(), status: submitted ? "reconciling" : "pending", submittedAt: submitted ? new Date(0) : null } });
        const hold = await tx(db => tokens.reserveTokens(db, { userId: user.id, requestId: row.requestId, payloadHash: "qa", kind: "search", resourceId: row.id, expiresAt: new Date(0) })); return { row, hold };
      }
      const first = await order(false); await expiry.expireTokens(user.id); assert.deepEqual(await snapshot(user.id), [150, 0]);
      assert.equal((await db.prospectingOrder.findUniqueOrThrow({ where: { id: first.row.id } })).status, "failed");
      const second = await order(true); await expiry.expireTokens(user.id); assert.deepEqual(await snapshot(user.id), [130, 20]);
      const body = { orderId: second.row.id, revision: second.row.updatedAt.toISOString(), requestId: randomUUID(), action: "confirm_no_delivery", evidence: "Provider ticket QA confirms no delivery" };
      admin = false; assert.equal((await routes.PATCH(patch(body))).status, 401); admin = true;
      assert.equal((await routes.PATCH(patch({ ...body, revision: new Date(0).toISOString() }))).status, 409);
      assert.equal((await routes.PATCH(patch(body))).status, 200); assert.equal((await routes.PATCH(patch(body))).status, 200); assert.deepEqual(await snapshot(user.id), [150, 0]);
      const third = await order(true); const providerOrderId = randomUUID();
      const attach = { ...body, orderId: third.row.id, revision: third.row.updatedAt.toISOString(), requestId: randomUUID(), action: "attach_receipt", providerOrderId };
      assert.equal((await routes.PATCH(patch(attach))).status, 200); assert.equal((await routes.PATCH(patch(attach))).status, 200);
      assert.deepEqual(await snapshot(user.id), [130, 20]);
      assert.equal((await db.prospectingOrder.findUniqueOrThrow({ where: { id: third.row.id } })).providerOrderId, providerOrderId);
    });
    await t.test("Daily monthly-grant cron credits inactive eligible members without waiting for login and never grants twice", async () => {
      const paid = await member(), free = await member(false);
      const monthly = load<typeof import("../src/lib/tokens/monthly")>("src/lib/tokens/monthly.ts");
      await monthly.grantMonthlyTokens(); await monthly.grantMonthlyTokens();
      assert.equal((await db.tokenWallet.findUniqueOrThrow({ where: { userId: paid.id } })).available, 150);
      assert.equal(await db.tokenLedger.count({ where: { userId: paid.id, kind: "grant" } }), 1);
      assert.equal(await db.tokenLedger.count({ where: { userId: free.id } }), 0);
    });
    await t.test("Capture/refund is immutable and idempotent; wallet totals equal all ledger deltas", async () => {
      const user = await member();
      const hold = await tx(db => tokens.reserveTokens(db, { userId: user.id, requestId: randomUUID(), payloadHash: "qa", kind: "search", resourceId: randomUUID(), expiresAt: new Date(Date.now() + 86400000) }));
      await tx(db => tokens.settleTokens(db, hold.id, "capture", "Verified delivery"));
      await Promise.all([tx(db => tokens.settleTokens(db, hold.id, "refund", "Invalid original data")), tx(db => tokens.settleTokens(db, hold.id, "refund", "Invalid original data"))]);
      await tx(db => tokens.settleTokens(db, hold.id, "capture", "Late duplicate delivery"));
      assert.deepEqual(await snapshot(user.id), [150, 0]);
      for (const id of ids) {
        const wallet = await db.tokenWallet.findUnique({ where: { userId: id } }); if (!wallet) continue;
        const sums = await db.tokenLedger.aggregate({ where: { userId: id }, _sum: { availableDelta: true, reservedDelta: true } });
        assert.equal(wallet.available, sums._sum.availableDelta || 0); assert.equal(wallet.reserved, sums._sum.reservedDelta || 0);
      }
    });
  } finally { await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); }
});
