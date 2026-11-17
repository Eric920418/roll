import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pdfRuntime } from "./helpers/pdf-runtime";
import type { Account } from "../src/lib/auth/account";

test("local unified Credits: read-only conversion, legacy preservation, cross-feature spending and concurrent holds", async t => {
  const url = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
  if (!url) { t.skip("Explicit isolated database required"); return; }
  const target = new URL(url); assert(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 8 }) });
  const users: string[] = [];
  let currentUser = "", clock = new Date("2026-11-16T04:00:00.000Z").getTime();
  class Clock extends Date { constructor(value?: string | number) { super(value === undefined ? clock : value); } static now() { return clock; } }
  class MemberError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const load = pdfRuntime({ "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/auth/account": { getBetaAccess: async () => false, getCurrentAccount: async () => db.user.findUnique({ where: { id: currentUser }, include: { profile: true } }) }, "@/lib/auth/guard": {}, "@/lib/member-http": { MemberError }, "@/lib/action-plan/service": { getActiveActionPlan: async () => null }, "@/lib/playbook/quiz": { fortnightIndex: () => 0, periodEnd: () => new Date(clock + 86400000) } }, { Date: Clock, process: { env: { DATABASE_URL: url, ROLL_LOCAL_POSTGRES: "true", ROLL_UNIFIED_CREDITS_LOCAL: "true", NODE_ENV: "test" } } });
  const tokens = load<typeof import("../src/lib/tokens/service")>("src/lib/tokens/service.ts"), ai = load<typeof import("../src/lib/ai/allowance")>("src/lib/ai/allowance.ts"), credits = load<typeof import("../src/lib/credits/service")>("src/lib/credits/service.ts"), rewards = load<typeof import("../src/lib/rewards/service")>("src/lib/rewards/service.ts"), legacy = load<typeof import("../src/lib/credits/legacy")>("src/lib/credits/legacy.ts");
  const cutover = load<typeof import("../src/lib/credits/cutover")>("src/lib/credits/cutover.ts");
  const activate = async (id: string) => run(async tx => { const p = await cutover.prepareMember(tx, id, { key: randomUUID(), actor: "qa", reason: "conversion rehearsal" }, new Date(clock)); return cutover.activateMember(tx, id, p.sourceHash, { key: randomUUID(), actor: "qa", reason: "conversion rehearsal" }, new Date(clock)); });
  const user = async (paid = true) => { const u = await db.user.create({ data: { email: `credits-${randomUUID()}@example.invalid`, rollonMember: paid, createdAt: new Date("2026-11-01T04:00:00Z") } }); users.push(u.id); return u; };
  const run = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => db.$transaction(fn, { timeout: 15000 });
  try {
    const u = await user(); currentUser = u.id;
    await db.tokenWallet.create({ data: { userId: u.id, available: 230, reserved: 20 } });
    await db.rewardAccount.create({ data: { userId: u.id, balance: 30 } });
    await db.rewardEntry.createMany({ data: [{ userId: u.id, eventKey: "action:old", kind: "action", points: 130, dayKey: "2026-11-01" }, { userId: u.id, eventKey: "redeem:old", kind: "redeem", points: -100, dayKey: "2026-11-01" }] });
    await db.aiAllowance.create({ data: { userId: u.id, cycleStart: new Date("2026-11-01T04:00:00Z"), cycleEnd: new Date("2026-12-01T04:00:00Z"), includedUsed: 110, bonusBalance: 10, rewardBalance: 5 } });
    await db.aiUsage.createMany({ data: Array.from({ length: 110 }, () => ({ userId: u.id, source: "included", status: "succeeded", cycleStart: new Date("2026-11-01T04:00:00Z"), expiresAt: new Date(clock), completedAt: new Date(clock) })) });
    await db.aiCreditPurchase.create({ data: { userId: u.id, paypalOrderId: randomUUID(), requestId: randomUUID(), paypalCaptureId: randomUUID(), status: "COMPLETED", completedAt: new Date(clock), credits: 10 } });
    await db.rewardRedemption.create({ data: { userId: u.id, requestId: "old", points: 100, credits: 5, monthKey: "2026-11" } });
    const oldHold = await db.tokenReservation.create({ data: { userId: u.id, requestId: randomUUID(), payloadHash: "old", kind: "search", resourceId: randomUUID(), amount: 20, expiresAt: new Date("2026-11-17T04:00:00Z") } });
    await db.tokenLedger.createMany({ data: [{ userId: u.id, eventKey: `seed:${u.id}`, kind: "grant", availableDelta: 100, reservedDelta: 0, reason: "original" }, { userId: u.id, eventKey: `monthly:${u.id}:2026-11`, kind: "grant", availableDelta: 150, reservedDelta: 0, reason: "每月方案贈額 / Monthly plan grant" }, { userId: u.id, eventKey: `reserve:${oldHold.id}`, kind: "reserve", availableDelta: -20, reservedDelta: 20, reservationId: oldHold.id, reason: "old hold" }] });
    const original = JSON.stringify(await Promise.all([db.user.findUnique({ where: { id: u.id } }), db.tokenWallet.findUnique({ where: { userId: u.id } }), db.aiAllowance.findUnique({ where: { userId: u.id } }), db.rewardAccount.findUnique({ where: { userId: u.id } })]));
    await t.test("trial is read only and conversion is repeatable without shrinking original rights", async () => {
      const report = await run(async tx => { await tx.$executeRaw`SET TRANSACTION READ ONLY`; return legacy.trialConversion(tx, u.id, new Date(clock)); });
      assert.equal(report.after.available, 286.5); assert.equal(report.after.reserved, 20);
      assert.equal(await db.setting.count({ where: { key: `localCredits.v1:${u.id}` } }), 0);
      await activate(u.id);
      const first = await tokens.tokenSnapshot(u.id), second = await tokens.tokenSnapshot(u.id);
      assert.equal(first.available, 286.5); assert.equal(second.available, 286.5);
      assert.equal(first.permanent, 246.5); assert.equal(first.lifetimeEarned, 6.5);
      assert.equal(JSON.stringify(await Promise.all([db.user.findUnique({ where: { id: u.id } }), db.tokenWallet.findUnique({ where: { userId: u.id } }), db.aiAllowance.findUnique({ where: { userId: u.id } }), db.rewardAccount.findUnique({ where: { userId: u.id } })])), original);
    });
    await t.test("AI, company search and rewards share the same wallet; receipts are idempotent", async () => {
      const id = await ai.reserveAiUsage(u as unknown as Account, "copilot"); assert(id);
      assert.equal((await tokens.tokenSnapshot(u.id)).available, 285.5);
      await ai.completeAiUsage(id, true); await ai.completeAiUsage(id, true);
      await run(tx => tokens.settleTokens(tx, oldHold.id, "refund", "confirmed failed delivery"));
      await run(tx => tokens.settleTokens(tx, oldHold.id, "refund", "retry"));
      assert.equal((await tokens.tokenSnapshot(u.id)).available, 305.5);
      const input = { userId: u.id, requestId: randomUUID(), payloadHash: "new", kind: "search" as const, resourceId: randomUUID(), expiresAt: new Date(clock + 86400000) };
      const reservation = await run(tx => tokens.reserveTokens(tx, input));
      await run(tx => tokens.reserveTokens(tx, input));
      assert.equal((await tokens.tokenSnapshot(u.id)).available, 285.5);
      await run(tx => tokens.settleTokens(tx, reservation.id, "capture", "delivered"));
      await rewards.rewardTransaction(tx => rewards.awardReward(tx, u.id, "quiz", "new"));
      await rewards.rewardTransaction(tx => rewards.awardReward(tx, u.id, "quiz", "new"));
      assert.equal((await tokens.tokenSnapshot(u.id)).available, 288);
      assert.equal((await tokens.tokenSnapshot(u.id)).lifetimeEarned, 9);
      await assert.rejects(rewards.redeemReward(u.id, randomUUID()), /no redemption required/);
      assert.equal((await rewards.getRewardSummary()).credits?.available, 288);
    });
    await t.test("completed purchase credits the normalized ledger once and never changes legacy AI balances", async () => {
      const member = await user(false); await activate(member.id);
      const purchase = await db.aiCreditPurchase.create({ data: { userId: member.id, paypalOrderId: randomUUID(), requestId: randomUUID(), credits: 10 } });
      const billing = load<typeof import("../src/lib/billing/credits")>("src/lib/billing/credits.ts");
      const order = { id: purchase.paypalOrderId, status: "COMPLETED", purchase_units: [{ custom_id: member.id, payments: { captures: [{ id: randomUUID(), status: "COMPLETED", amount: { currency_code: "USD", value: "5.00" } }] } }] } as import("../src/lib/billing/paypal").PaypalOrder;
      const results = await Promise.all([billing.fulfillCreditOrder(order), billing.fulfillCreditOrder(order)]);
      assert.equal(results.filter(r => r.added).length, 1);
      const wallet = await credits.creditSnapshot(member.id); assert.equal(wallet.available, 10); assert.equal(wallet.permanent, 10); assert.equal(wallet.lifetimeEarned, 0);
      assert.equal(await db.aiAllowance.findUnique({ where: { userId: member.id } }), null);
      await db.rewardEntry.create({ data: { userId: member.id, eventKey: "unsubscribe:qa", kind: "unsubscribe", points: 0, dayKey: "2026-11-17" } });
      assert.equal((await credits.creditSnapshot(member.id)).available, 10, "Unsubscribe markers never award Credits");
    });
    await t.test("rollback and concurrent requests cannot mint or overspend Credits", async () => {
      const free = await user(false); await db.tokenWallet.create({ data: { userId: free.id, available: 1 } });
      await db.tokenLedger.create({ data: { userId: free.id, eventKey: `seed:${free.id}`, kind: "grant", availableDelta: 1, reservedDelta: 0, reason: "original" } });
      await activate(free.id);
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => ai.reserveAiUsage(free as unknown as Account, "copilot")));
      const successful = results.filter(r => r.status === "fulfilled" && r.value);
      assert.equal(successful.length, 1); assert.equal((await tokens.tokenSnapshot(free.id)).available, 0);
      await assert.rejects(run(async tx => { await credits.grantCredit(tx, free.id, { key: "rollback", amount: 100, origin: "admin", reason: "rollback" }); throw new Error("rollback"); }), /rollback/);
      assert.equal((await tokens.tokenSnapshot(free.id)).available, 0);
      const id = (successful[0] as PromiseFulfilledResult<string>).value;
      await ai.completeAiUsage(id, false); await ai.completeAiUsage(id, false);
      assert.equal((await tokens.tokenSnapshot(free.id)).available, 1);
      assert.equal(await ai.reserveAiUsage(free as unknown as Account, "paid"), null);
      await db.user.update({ where: { id: free.id }, data: { rollonMember: true } });
      assert.equal((await tokens.tokenSnapshot(free.id)).available, 301, "A later upgrade receives both benefits even when the free wallet was imported earlier in this cycle");
    });
    await t.test("late cancellation cannot turn expiring grants into permanent Credits; verified delivery failure is compensated", async () => {
      for (const verifiedFailure of [false, true]) {
        const member = await user(false);
        await activate(member.id);
        await run(tx => credits.grantCredit(tx, member.id, { key: "temporary", amount: 2000, origin: "included", expiresAt: new Date(clock + 60000).toISOString(), reason: "original expiry" }));
        const held = await run(tx => tokens.reserveTokens(tx, { userId: member.id, requestId: randomUUID(), payloadHash: "expiry-test", kind: "search", resourceId: randomUUID(), expiresAt: new Date(clock + 86400000) }));
        clock += 120000;
        await run(tx => tokens.settleTokens(tx, held.id, "refund", verifiedFailure ? "provider confirmed failure" : "user cancelled", verifiedFailure));
        const state = await tokens.tokenSnapshot(member.id);
        assert.equal(state.available, verifiedFailure ? 20 : 0);
        assert.equal(state.permanent, verifiedFailure ? 20 : 0);
      }
    });
    await t.test("both original monthly benefits recur independently; original permanent balances survive", async () => {
      clock = new Date("2026-12-02T04:00:00Z").getTime();
      const before = await tokens.tokenSnapshot(u.id), repeat = await tokens.tokenSnapshot(u.id);
      assert.equal(before.available, repeat.available);
      assert.equal(before.expiring?.reduce((sum, l) => sum + l.amount, 0), 150);
      assert(before.permanent! >= 150);
      assert.equal(before.lifetimeEarned, 9);
      const events = await db.$queryRaw<{ key: string }[]>`SELECT e.key FROM "CreditEntry" e JOIN "CreditAuthority" p ON p."accountId"=e."accountId" WHERE p."userId"=${u.id}`;
      assert.equal(events.filter(e => e.key === "monthly:2026-12").length, 1);
      assert.equal(events.filter(e => e.key === "included:2026-12-01T04:00:00.000Z").length, 1);
    });
  } finally {
    await db.setting.deleteMany({ where: { key: { in: users.map(id => `localCredits.v1:${id}`) } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});
