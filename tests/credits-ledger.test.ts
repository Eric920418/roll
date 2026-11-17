import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pdfRuntime } from "./helpers/pdf-runtime";
import { isolatedTarget } from "../scripts/credits-ledger";

test("ledger runner rejects production and ambiguous database targets before connecting", () => {
  const env = { ROLL_LOCAL_POSTGRES: "true", DATABASE_URL: "postgresql://localhost/roll_rewards_qa_ledger" };
  assert.equal(isolatedTarget(env).hostname, "localhost");
  for (const invalid of [{ NODE_ENV: "production" }, { VERCEL: "1" }, { DATABASE_URL: "postgresql://localhost/live" }, { DATABASE_URL: "postgresql://host/roll_rewards_qa" }, { DATABASE_URL: "postgresql://localhost/roll_rewards_qa?host=remote" }, { ROLL_LOCAL_POSTGRES: "false" }]) assert.throws(() => isolatedTarget({ ...env, ...invalid }));
});

test("normalized ledger cutover and rollback preserve money, expiry and membership", async t => {
  const url = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
  if (!url) return t.skip("Explicit isolated QA database required");
  isolatedTarget({ DATABASE_URL: url, ROLL_LOCAL_POSTGRES: "true" });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 8 }) });
  if (!(await db.$queryRaw<{ installed: boolean }[]>`SELECT to_regclass('public."CreditControl"') IS NOT NULL AS installed`)[0].installed) { await db.$disconnect(); return t.skip("Install prisma/credits.sql in the isolated database first"); }
  const now = new Date("2026-11-17T06:00:00Z"), users: string[] = [], env = { DATABASE_URL: url, ROLL_LOCAL_POSTGRES: "true", ROLL_UNIFIED_CREDITS_LOCAL: "false", NODE_ENV: "test" };
  class Clock extends Date { constructor(value?: string | number) { super(value ?? now.getTime()); } static now() { return now.getTime(); } }
  class MemberError extends Error { constructor(message: string, public status = 409) { super(message); } }
  let quote = { monthlyGrant: 150, inviteFee: 5, searchFee: 20, monthlyCompanies: 10, dailyInvites: 20, version: "original", grantStartsPeriod: "" };
  const load = pdfRuntime({ "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/auth/account": { getBetaAccess: async () => false }, "@/lib/member-http": { MemberError }, "@/lib/billing/commerce": { tokenQuote: async () => ({ ...quote }) } }, { Date: Clock, process: { env } });
  const cutover = load<typeof import("../src/lib/credits/cutover")>("src/lib/credits/cutover.ts"), credits = load<typeof import("../src/lib/credits/service")>("src/lib/credits/service.ts"), authority = load<typeof import("../src/lib/credits/authority")>("src/lib/credits/authority.ts"), storage = load<typeof import("../src/lib/credits/storage")>("src/lib/credits/storage.ts"), policy = load<typeof import("../src/lib/credits/policy")>("src/lib/credits/policy.ts"), verify = load<typeof import("../src/lib/credits/verify")>("src/lib/credits/verify.ts"), pricing = load<typeof import("../src/lib/credits/pricing")>("src/lib/credits/pricing.ts");
  const run = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => db.$transaction(fn, { timeout: 20000 });
  const op = (key = randomUUID()) => ({ key, actor: "qa-operator", reason: "isolated cutover rehearsal" });
  const user = async (balance = 8) => {
    const u = await db.user.create({ data: { email: `ledger-${randomUUID()}@example.invalid`, createdAt: new Date("2026-11-01T00:00:00Z") } }); users.push(u.id);
    if (balance) { await db.tokenWallet.create({ data: { userId: u.id, available: balance } }); await db.tokenLedger.create({ data: { userId: u.id, eventKey: randomUUID(), kind: "grant", availableDelta: balance, reservedDelta: 0, reason: "original" } }); }
    return u;
  };
  const activate = (uid: string) => run(async tx => { const p = await cutover.prepareMember(tx, uid, op(), now); return cutover.activateMember(tx, uid, p.sourceHash, op(), now); });
  try {
    await t.test("changed source refuses activation, changed request refuses replay; re-preparation imports once", async () => {
      const u = await user(), request = op();
      const prepared = await run(tx => cutover.prepareMember(tx, u.id, request, now));
      assert.deepEqual(JSON.parse(JSON.stringify(await run(tx => cutover.prepareMember(tx, u.id, request, now)))), JSON.parse(JSON.stringify(prepared)));
      await assert.rejects(run(tx => cutover.prepareMember(tx, u.id, { ...request, reason: "different" }, now)), /idempotency/);
      await run(async tx => { await tx.tokenWallet.update({ where: { userId: u.id }, data: { available: 7 } }); await tx.tokenLedger.create({ data: { userId: u.id, eventKey: randomUUID(), kind: "spend", availableDelta: -1, reservedDelta: 0, reason: "legacy activity after prepare" } }); });
      await assert.rejects(run(tx => cutover.activateMember(tx, u.id, prepared.sourceHash, op(), now)), /Source changed/);
      assert.equal((await run(tx => storage.accountFor(tx, u.id)))!.version, 0);
      const fresh = await run(tx => cutover.prepareMember(tx, u.id, op(), now)), activation = op();
      const first = await run(tx => cutover.activateMember(tx, u.id, fresh.sourceHash, activation, now));
      assert.deepEqual(JSON.parse(JSON.stringify(await run(tx => cutover.activateMember(tx, u.id, fresh.sourceHash, activation, now)))), JSON.parse(JSON.stringify(first)));
      assert.equal((await credits.creditSnapshot(u.id)).available, 7);
      await assert.rejects(run(tx => cutover.prepareMember(tx, u.id, op(), now)), /already active/);
    });
    await t.test("early rollback keeps old balances unchanged and can re-convert without duplication", async () => {
      const u = await user(17), before = JSON.stringify(await db.user.findUnique({ where: { id: u.id } }));
      await activate(u.id);
      const request = op(), rollback = await run(tx => cutover.rollbackMember(tx, u.id, request, now));
      assert.equal(rollback.authority, "legacy");
      assert.equal(await authority.memberCreditsEnabled(u.id), false);
      assert.deepEqual(JSON.parse(JSON.stringify(await run(tx => cutover.rollbackMember(tx, u.id, request, now)))), JSON.parse(JSON.stringify(rollback)));
      assert.equal((await db.tokenWallet.findUniqueOrThrow({ where: { userId: u.id } })).available, 17);
      await activate(u.id); assert.equal((await credits.creditSnapshot(u.id)).available, 17);
      assert.equal(JSON.stringify(await db.user.findUnique({ where: { id: u.id } })), before);
    });
    await t.test("spending requires a compatible rollback; old binaries and flag changes cannot double spend", async () => {
      const u = await user(21); await activate(u.id);
      await run(tx => credits.withCreditWallet(tx, u.id, w => { policy.reserve(w, { id: "pending", amount: 500, kind: "invite", expiresAt: "2026-12-01T00:00:00.000Z" }, now); }));
      const rollback = await run(tx => cutover.rollbackMember(tx, u.id, op(), now));
      assert.equal(rollback.authority, "credits"); assert.equal(rollback.status, "compatible");
      assert.equal(await authority.memberCreditsEnabled(u.id), true);
      assert.equal((await credits.creditSnapshot(u.id)).available, 16); assert.equal((await credits.creditSnapshot(u.id)).reserved, 5);
      await assert.rejects(db.tokenWallet.update({ where: { userId: u.id }, data: { available: { decrement: 1 } } }), /Legacy balances are sealed|CREDITS_LEGACY_FENCED/);
      await assert.rejects(db.tokenLedger.create({ data: { userId: u.id, eventKey: randomUUID(), kind: "grant", availableDelta: 1, reservedDelta: 0, reason: "old writer" } }), /CREDITS_LEGACY_FENCED/);
      await assert.rejects(db.user.delete({ where: { id: u.id } }), /CREDITS_PENDING_HOLDS/);
      await run(tx => credits.withCreditWallet(tx, u.id, w => policy.settle(w, "pending", "capture", "completed", now)));
      await run(tx => credits.withCreditWallet(tx, u.id, w => policy.settle(w, "pending", "refund", "failed delivery", now, true)));
      assert.equal((await credits.creditSnapshot(u.id)).available, 21); assert.equal((await credits.creditSnapshot(u.id)).reserved, 0);
    });
    await t.test("immutable receipts and deferred database accounting reject partial or unbalanced writes", async () => {
      const u = await user(1); await activate(u.id); const account = (await run(tx => storage.accountFor(tx, u.id)))!;
      await assert.rejects(db.$executeRaw`UPDATE "CreditEntry" SET reason='tampered' WHERE "accountId"=${account.id}`, /CREDITS_IMMUTABLE/);
      await assert.rejects(db.$executeRaw`DELETE FROM "CreditEntry" WHERE "accountId"=${account.id}`, /CREDITS_IMMUTABLE/);
      await assert.rejects(db.$executeRaw`UPDATE "CreditLot" SET remaining=999 WHERE "accountId"=${account.id} AND key='migration:token'`, /CREDITS_UNBALANCED/);
      await assert.rejects(db.$executeRaw`UPDATE "CreditLot" SET "expiresAt"=${now} WHERE "accountId"=${account.id}`, /CREDITS_TERMS_IMMUTABLE/);
      await assert.rejects(run(async tx => { await credits.grantCredit(tx, u.id, { key: "atomic", amount: 500, origin: "purchased", reason: "transaction abort" }); throw new Error("forced abort"); }), /forced abort/);
      assert.equal((await credits.creditSnapshot(u.id)).available, 1);
      const snapshot = JSON.stringify(await db.$queryRaw`SELECT * FROM "CreditEntry" WHERE "accountId"=${account.id}`, (_, v) => typeof v === "bigint" ? v.toString() : v);
      const report = await run(async tx => { await tx.$executeRaw`SET TRANSACTION READ ONLY`; return verify.verifyLedger(tx, now); });
      assert.equal(report.balanced, true);
      assert.equal(JSON.stringify(await db.$queryRaw`SELECT * FROM "CreditEntry" WHERE "accountId"=${account.id}`, (_, v) => typeof v === "bigint" ? v.toString() : v), snapshot);
    });
    await t.test("grandfathered fees, monthly grants and quotas cannot shrink when catalog changes", async () => {
      const u = await user(4); await activate(u.id);
      quote = { ...quote, monthlyGrant: 1, searchFee: 99, inviteFee: 25, dailyInvites: 1, monthlyCompanies: 0, version: "reduced" };
      const q = await run(tx => pricing.memberTokenQuote(tx, u.id));
      assert.equal(q.searchFee, 20); assert.equal(q.inviteFee, 5); assert.equal(q.monthlyGrant, 150); assert.equal(q.dailyInvites, 20); assert.equal(q.monthlyCompanies, 10);
      quote = { ...quote, monthlyGrant: 200, searchFee: 10, inviteFee: 1, dailyInvites: 30, monthlyCompanies: 20 };
      const improved = await run(tx => pricing.memberTokenQuote(tx, u.id)); assert.equal(improved.monthlyGrant, 200); assert.equal(improved.searchFee, 10);
    });
    await t.test("deleted members detach identity while retaining anonymous, balanced financial receipts", async () => {
      const u = await user(6); await activate(u.id); const account = (await run(tx => storage.accountFor(tx, u.id)))!;
      await db.user.delete({ where: { id: u.id } });
      assert.equal(await run(tx => storage.accountFor(tx, u.id)), null);
      const [retained] = await db.$queryRaw<{ status: string }[]>`SELECT status FROM "CreditAccount" WHERE id=${account.id}`; assert.equal(retained.status, "closed");
      assert((await db.$queryRaw<unknown[]>`SELECT * FROM "CreditEntry" WHERE "accountId"=${account.id}`).length > 0);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
  }
});

test("whole-cohort activation is atomic; new registrations enrol and mixed rollback retains authority", async t => {
  const url = process.env.ROLL_CREDITS_CUTOVER_TEST_DATABASE_URL;
  if (!url) return t.skip("Dedicated empty cutover database required");
  isolatedTarget({ DATABASE_URL: url, ROLL_LOCAL_POSTGRES: "true" });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 8 }) });
  assert.equal(await db.user.count(), 0, "Dedicated cutover database must contain no members");
  class MemberError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const load = pdfRuntime({ "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/auth/account": { getBetaAccess: async () => false }, "@/lib/member-http": { MemberError } }, { process: { env: { ROLL_UNIFIED_CREDITS_LOCAL: "false" } } });
  const cutover = load<typeof import("../src/lib/credits/cutover")>("src/lib/credits/cutover.ts"), authority = load<typeof import("../src/lib/credits/authority")>("src/lib/credits/authority.ts"), credits = load<typeof import("../src/lib/credits/service")>("src/lib/credits/service.ts"), policy = load<typeof import("../src/lib/credits/policy")>("src/lib/credits/policy.ts");
  const run = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => db.$transaction(fn, { timeout: 20000 });
  const op = () => ({ key: randomUUID(), actor: "qa", reason: "whole cohort rehearsal" });
  const users: string[] = [];
  const create = async () => { const u = await db.user.create({ data: { email: `cohort-${randomUUID()}@example.invalid` } }); users.push(u.id); return u; };
  try {
    const a = await create(), b = await create();
    const prepare = async () => { const manifest = []; for (const uid of users) { const p = await run(tx => cutover.prepareMember(tx, uid, op())); manifest.push({ userId: uid, sourceHash: p.sourceHash }); } return manifest; };
    const stale = await prepare();
    await create();
    await assert.rejects(run(tx => cutover.activateAll(tx, stale, op())), /manifest changed/);
    const state = await db.$queryRaw<{ mode: string }[]>`SELECT mode FROM "CreditControl"`; assert.equal(state[0].mode, "legacy");
    const manifest = await prepare();
    await db.user.update({ where: { id: b.id }, data: { rollonMember: true } });
    await assert.rejects(run(tx => cutover.activateAll(tx, manifest, op())), /Source changed/);
    assert.equal((await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "CreditAccount" WHERE status='active'`)[0].n, BigInt(0), "Failure in one member rolls back all prior activations");
    const fresh = await prepare();
    assert.equal((await run(tx => cutover.activateAll(tx, fresh, op()))).activated, 3);
    await run(tx => credits.grantCredit(tx, a.id, { key: "real-activity", amount: 123, origin: "reward", earned: true, reason: "earned after cutover" }));
    const request = op(); await run(tx => cutover.rollbackAll(tx, request)); await run(tx => cutover.rollbackAll(tx, request));
    assert.equal(await authority.memberCreditsEnabled(a.id), true); assert.equal((await credits.creditSnapshot(a.id)).available, 1.23);
    assert.equal(await authority.memberCreditsEnabled(b.id), false, "No post-cutover transactions can still use original accounting");
    const newcomer = await create(); assert.equal(await authority.memberCreditsEnabled(newcomer.id), true);
    assert.equal((await credits.creditSnapshot(newcomer.id)).available, 0);
    await run(tx => credits.withCreditWallet(tx, a.id, w => policy.adjust(w, "debit", -23, "admin correction")));
    await run(tx => credits.withCreditWallet(tx, a.id, w => policy.adjust(w, "debit", -23, "admin correction")));
    await assert.rejects(run(tx => credits.withCreditWallet(tx, a.id, w => policy.adjust(w, "debit", 23, "admin correction"))), /idempotency/);
    assert.equal((await credits.creditSnapshot(a.id)).available, 1); assert.equal((await credits.creditSnapshot(a.id)).lifetimeEarned, 1.23);
  } finally {
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$executeRaw`UPDATE "CreditControl" SET mode='legacy',"activatedAt"=NULL WHERE id='main'`;
    await db.$disconnect();
  }
});
