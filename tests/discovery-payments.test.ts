import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { emptyInsight } from "../src/lib/customer-insights/schema";
import * as policy from "../src/lib/discovery/policy";
import { verifiedFounderCapture } from "../src/lib/discovery/founder-policy";
import type { PaypalOrder } from "../src/lib/billing/paypal";

function paidOrder(id = "REMOTEORDER", custom = "local", amount = "348.00"): PaypalOrder { return { id, status: "COMPLETED", purchase_units: [{ custom_id: custom, payments: { captures: [{ id: `CAPTURE${id}`, status: "COMPLETED", amount: { currency_code: "USD", value: amount }, create_time: "2026-10-16T01:00:00Z" }] } }] }; }
test("Founding payment validates the exact amount, currency, local order and single completed capture", () => {
  assert.equal(verifiedFounderCapture(paidOrder(), "local").id, "CAPTUREREMOTEORDER");
  for (const value of [paidOrder("REMOTEORDER", "wrong"), paidOrder("REMOTEORDER", "local", "29.00"), { ...paidOrder(), status: "APPROVED" }, { ...paidOrder(), purchase_units: [{ custom_id: "local", payments: { captures: [{ id: "BAD", status: "COMPLETED", amount: { currency_code: "TWD", value: "348.00" } }] } }] }, { ...paidOrder(), purchase_units: [...paidOrder().purchase_units!, ...paidOrder().purchase_units!] }]) assert.throws(() => verifiedFounderCapture(value, "local"));
});

const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
test("Founding payments in isolated PostgreSQL: ten seats, expiry, ownership, idempotency and rollback", { skip: !connectionString }, async t => {
  const url = new URL(connectionString!); assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 12 }) });
  const users: string[] = [], orderIds = new Set<string>(), remote = new Map<string, PaypalOrder>(); let refundStatus = "COMPLETED"; let captures = 0, failGrant = false, timeoutCapture = false;
  class WriteError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const require = createRequire(import.meta.url), cache = new Map<string, unknown>();
  const extended = db.$extends({ query: { user: { async update({ args, query }) { if (failGrant && args.data.founderEndsAt) throw new Error("Injected grant rollback"); return query(args); } } } });
  const provider = {
    isPaypalConfigured: () => true,
    createFounderPayment: async ({ localOrderId }: { localOrderId: string }) => { const id = `ORDER${localOrderId.replace(/[^a-z0-9]/gi, "")}`; if (!remote.has(id)) remote.set(id, { id, status: "APPROVED", links: [{ rel: "approve", method: "GET", href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }] }); return remote.get(id)!; },
    getOrder: async (id: string) => { const value = remote.get(id); if (!value) throw Error("Unknown test order"); return value; },
    captureFounderPayment: async (id: string, localId: string) => { captures++; const value = paidOrder(id, localId); remote.set(id, value); if (timeoutCapture) throw Error("Injected timeout after provider capture"); return value; },
    getFounderCapture: async (id: string) => ({ id, status: refundStatus }),
  };
  const mocks: Record<string, unknown> = { "server-only": {}, "@/lib/prisma": { prisma: extended }, "@/lib/action-plan/service": { PlanWriteError: WriteError }, "@/lib/auth/account": { getCurrentAccount: async () => null }, "@/lib/billing/paypal": provider, "@/lib/discovery/policy": policy };
  function load<T>(file: string): T {
    const absolute = resolve(file); if (cache.has(absolute)) return cache.get(absolute) as T;
    const loaded = { exports: {} }; cache.set(absolute, loaded.exports);
    runInNewContext(ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, Date, Error, console, process, URL, Set, Buffer, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(resolve(dirname(absolute), `${id}.ts`)) : require(id) });
    cache.set(absolute, loaded.exports); return loaded.exports as T;
  }
  const billing = load<typeof import("../src/lib/billing/gate")>("src/lib/billing/gate.ts");
  const founder = load<typeof import("../src/lib/discovery/founder")>("src/lib/discovery/founder.ts");
  const enabled = process.env.FOUNDER_OFFER_ENABLED; process.env.FOUNDER_OFFER_ENABLED = "true";
  let allocations: Awaited<ReturnType<typeof founder.reserveFounderOrder>>[] = [];
  try {
    for (let i = 0; i < 11; i++) {
      const user = await db.user.create({ data: { email: `discovery-${randomUUID()}@example.invalid`, trialPolicy: policy.DISCOVERY_POLICY, trialPlan: "pro", trialStartsAt: new Date(), trialEndsAt: new Date(Date.now() + 14 * 86400000) } }); users.push(user.id);
      const journey = await db.discoveryJourney.create({ data: { userId: user.id } });
      await db.meetingNote.createMany({ data: [1, 2, 3].map(n => ({ userId: user.id, title: `Founder ${n}`, insight: { ...emptyInsight("discover"), journeyId: journey.id, name: `Founder ${n}`, company: `Company ${n}`, notes: "Real interview evidence" } })) });
    }
    await t.test("Eleven parallel applicants can reserve only ten seats", async () => {
      const results = await Promise.allSettled(users.map(id => founder.reserveFounderOrder(id, randomUUID())));
      allocations = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []); allocations.forEach(row => orderIds.add(row.id));
      assert.equal(allocations.length, 10); assert.equal(new Set(allocations.map(row => row.seat)).size, 10);
      assert.equal(results.filter(result => result.status === "rejected").length, 1); assert.equal((await founder.founderOfferSnapshot()).remaining, 0);
    });
    await t.test("Duplicate tabs reuse a reservation; foreign request IDs are rejected", async () => {
      const first = allocations[0]; const again = await founder.reserveFounderOrder(first.userId!, randomUUID()); assert.equal(again.id, first.id);
      await assert.rejects(founder.reserveFounderOrder(allocations[1].userId!, first.requestId), error => (error as WriteError).status === 409);
    });
    await t.test("An expired unpaid hold releases its seat without changing any entitlement", async () => {
      const expired = allocations[9]; await db.founderOrder.update({ where: { id: expired.id }, data: { reservedUntil: new Date(Date.now() - 1) } });
      const outsider = users.find(id => !allocations.some(row => row.userId === id))!;
      const replacement = await founder.reserveFounderOrder(outsider, randomUUID()); orderIds.add(replacement.id);
      assert.equal(replacement.seat, expired.seat); assert.equal((await db.founderOrder.findUniqueOrThrow({ where: { id: expired.id } })).seat, null);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: expired.userId! } })).founderEndsAt, null);
    });
    await t.test("Parallel capture and webhook retries grant exactly one prepaid year", async () => {
      const first = allocations[0], checkout = await founder.createFounderCheckout(first.userId!, first.requestId, "https://example.test/return", "https://example.test/cancel");
      const results = await Promise.allSettled([founder.confirmFounderPayment(first.userId!, checkout.orderId), founder.confirmFounderPayment(first.userId!, checkout.orderId)]);
      assert(results.some(result => result.status === "fulfilled")); assert.equal(captures, 1);
      const before = await db.user.findUniqueOrThrow({ where: { id: first.userId! } });
      assert.equal(before.founderEndsAt!.toISOString(), "2027-10-16T01:00:00.000Z"); assert.equal(before.plan, "free"); assert.equal(before.paypalSubscriptionId, null);
      const account = { ...before, plan: "free" as const, trialPlan: "pro" as const };
      assert.equal(billing.getEffectivePlan(account, new Date("2026-10-16T02:00:00Z")), "pro"); assert.equal(billing.getEffectivePlan({ ...account, founderEndsAt: new Date(0) }), "free");
      assert.equal(billing.getEffectivePlan({ ...account, founderEndsAt: null, betaAccess: true }), "free");
      await founder.fulfillFounderOrder(remote.get(checkout.orderId)!); assert.equal((await db.user.findUniqueOrThrow({ where: { id: first.userId! } })).founderEndsAt!.getTime(), before.founderEndsAt!.getTime());
      await assert.rejects(founder.confirmFounderPayment(allocations[1].userId!, checkout.orderId), error => (error as WriteError).status === 404);
    });
    await t.test("A timeout after provider capture keeps the seat and recovers without another charge", async () => {
      const row = allocations[1], checkout = await founder.createFounderCheckout(row.userId!, row.requestId, "https://example.test/return", "https://example.test/cancel");
      timeoutCapture = true; await assert.rejects(founder.confirmFounderPayment(row.userId!, checkout.orderId)); timeoutCapture = false;
      const held = await db.founderOrder.findUniqueOrThrow({ where: { id: row.id } }); assert.equal(held.status, "capturing"); assert(held.seat);
      await db.founderOrder.update({ where: { id: row.id }, data: { captureExpiresAt: new Date(0) } });
      const count = captures; await founder.confirmFounderPayment(row.userId!, checkout.orderId); assert.equal(captures, count);
      assert((await db.user.findUniqueOrThrow({ where: { id: row.userId! } })).founderEndsAt);
    });
    await t.test("Entitlement failure rolls back paid state; retry safely completes the same capture", async () => {
      const row = allocations[2], checkout = await founder.createFounderCheckout(row.userId!, row.requestId, "https://example.test/return", "https://example.test/cancel");
      failGrant = true; await assert.rejects(founder.confirmFounderPayment(row.userId!, checkout.orderId)); failGrant = false;
      assert.equal((await db.founderOrder.findUniqueOrThrow({ where: { id: row.id } })).status, "capturing");
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: row.userId! } })).founderEndsAt, null);
      await founder.fulfillFounderOrder(remote.get(checkout.orderId)!); assert((await db.user.findUniqueOrThrow({ where: { id: row.userId! } })).founderEndsAt);
    });
    await t.test("Scheduled reconciliation recovers a timed-out capture with the original payment", async () => {
      const row = allocations[3], checkout = await founder.createFounderCheckout(row.userId!, row.requestId, "https://example.test/return", "https://example.test/cancel");
      timeoutCapture = true; await assert.rejects(founder.confirmFounderPayment(row.userId!, checkout.orderId)); timeoutCapture = false;
      await db.founderOrder.update({ where: { id: row.id }, data: { captureExpiresAt: new Date(0) } });
      const before = captures, result = await founder.reconcileFounderPayments(); assert.equal(result.recovered, 1); assert.equal(captures, before);
      assert.equal((await db.founderOrder.findUniqueOrThrow({ where: { id: row.id } })).status, "paid");
    });
    await t.test("Verified refunds revoke only founder access; late completion never reinstates it", async () => {
      const row = await db.founderOrder.findUniqueOrThrow({ where: { id: allocations[0].id } });
      refundStatus = "REFUNDED"; await founder.revokeFounderCapture(row.paypalCaptureId!);
      const account = await db.user.findUniqueOrThrow({ where: { id: row.userId! } }); assert(account.founderEndsAt! <= new Date());
      assert.equal((await db.founderOrder.findUniqueOrThrow({ where: { id: row.id } })).seat, row.seat);
      await founder.fulfillFounderOrder(remote.get(row.paypalOrderId!)!); assert((await db.user.findUniqueOrThrow({ where: { id: row.userId! } })).founderEndsAt! <= new Date());
    });
    await t.test("Deleting a paid account retains its anonymous historical seat", async () => {
      const row = allocations[1]; await db.user.delete({ where: { id: row.userId! } });
      const retained = await db.founderOrder.findUniqueOrThrow({ where: { id: row.id } }); assert.equal(retained.userId, null); assert(retained.seat);
    });
  } finally {
    if (enabled === undefined) delete process.env.FOUNDER_OFFER_ENABLED; else process.env.FOUNDER_OFFER_ENABLED = enabled;
    const remaining = await db.founderOrder.findMany({ where: { userId: { in: users } }, select: { id: true } }); remaining.forEach(row => orderIds.add(row.id));
    await db.founderOrder.deleteMany({ where: { id: { in: [...orderIds] } } }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
  }
});
