import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { convertLegacy } from "../src/lib/credits/conversion";
import { emptyWallet, expire, grant, referralGrant, referralRevoke, reserve, settle, summary, units, walletSchema } from "../src/lib/credits/policy";
import { localCreditsEnabled } from "../src/lib/credits/local";
const now = new Date("2026-11-16T04:00:00.000Z"), end = "2026-11-30T04:00:00.000Z";
const fixture = JSON.parse(readFileSync("tests/fixtures/credits-legacy.json", "utf8"));

test("legacy conversion preserves all independent balances, original holds and fractional rewards", () => {
  const report = convertLegacy(fixture.cases[0], now);
  assert.equal(report.after.available, 286.5); assert.equal(report.after.reserved, 20);
  assert.equal(report.after.permanent, 246.5); assert.equal(report.after.expiring[0].amount, 40);
  assert.equal(report.after.lifetimeEarned, 6.5); // Includes the previously redeemed 100 points, without reissuing them.
  assert.equal(report.wallet.events.reduce((sum, e) => sum + e.reservedDelta, 0), 2000);
  const free = convertLegacy(fixture.cases[1], now);
  assert.equal(free.after.available, 165.25); assert.equal(free.after.expiring.length, 0);
  const before = JSON.stringify(fixture); convertLegacy(fixture.cases[0], now); assert.equal(JSON.stringify(fixture), before);
});
test("mismatched legacy holds, invalid input and fractional minor units stop conversion", () => {
  assert.throws(() => convertLegacy({ ...fixture.cases[0], tokenReserved: 21 }, now), /mismatch/);
  assert.throws(() => convertLegacy({ ...fixture.cases[0], rewardPoints: -1 }, now));
  assert.throws(() => convertLegacy({ ...fixture.cases[0], included: { ...fixture.cases[0].included, expiresAt: "2025-01-01T00:00:00.000Z" } }, now), /mismatch/);
  assert.throws(() => units(0.251), /Invalid/); assert.equal(units(0.25), 25);
});
test("earliest expiry is spent first, permanent grants before purchases; spending does not lower achievements", () => {
  const w = emptyWallet(now);
  grant(w, { key: "buy", amount: 1000, origin: "purchased", reason: "buy" }, now);
  grant(w, { key: "earn", amount: 150, origin: "reward", earned: true, reason: "earn" }, now);
  grant(w, { key: "cycle", amount: 100, origin: "included", expiresAt: end, reason: "cycle" }, now);
  const input = { id: "a", amount: 200, kind: "ai" as const, expiresAt: end };
  reserve(w, input, now); reserve(w, input, now);
  assert.deepEqual(w.holds.a.allocations, [{ lotId: "cycle", amount: 100 }, { lotId: "earn", amount: 100 }]);
  assert.equal(summary(w, now).available, 10.5); assert.equal(summary(w, now).reserved, 2);
  settle(w, "a", "capture", "done", now); settle(w, "a", "capture", "done", now);
  assert.equal(summary(w, now).lifetimeEarned, 1.5);
  assert.throws(() => reserve(w, { ...input, amount: 201 }, now), /mismatch/);
  assert.throws(() => reserve(w, { ...input, id: "b", amount: 2000 }, now), /Insufficient/);
});
test("refunds restore original allocations once; confirmed failure across expiry returns permanent compensation", () => {
  const w = emptyWallet(now);
  grant(w, { key: "cycle", amount: 200, origin: "included", expiresAt: end, reason: "cycle" }, now);
  reserve(w, { id: "ai", amount: 100, kind: "ai", expiresAt: end }, now);
  const after = new Date("2026-12-01T00:00:00.000Z"); expire(w, after);
  settle(w, "ai", "refund", "provider failed", after, true); settle(w, "ai", "refund", "retry", after, true);
  assert.equal(summary(w, after).available, 1); assert.equal(summary(w, after).permanent, 1);
  assert.equal(summary(w, after).reserved, 0);
  assert.equal(w.events.reduce((sum, e) => sum + e.availableDelta, 0), 100);
  settle(w, "ai", "capture", "late provider", after); assert.equal(summary(w, after).available, 1);
  walletSchema.parse(w);
});
test("captured legacy orders remain refundable at their original price; unknown outcomes remain held", () => {
  const input = structuredClone(fixture.cases[0]); input.holds[0].status = "captured"; input.tokenReserved = 0;
  const w = convertLegacy(input, now).wallet; settle(w, "original-search", "refund", "verified failure", now);
  assert.equal(summary(w, now).available, 306.5);
  const held = convertLegacy(fixture.cases[0], now).wallet;
  expire(held, new Date("2027-01-01T00:00:00.000Z"));
  assert.equal(summary(held, new Date("2027-01-01T00:00:00.000Z")).reserved, 20);
});
test("referral revocation never takes purchased Credits, shortfall only offsets future referral rewards", () => {
  const w = emptyWallet(now);
  grant(w, { key: "buy", amount: 1000, origin: "purchased", reason: "buy" }, now);
  referralGrant(w, "ref1", 500, now);
  reserve(w, { id: "spend", amount: 350, kind: "invite", expiresAt: end }, now); settle(w, "spend", "capture", "done", now);
  referralRevoke(w, "revoke1", 500, now); referralRevoke(w, "revoke1", 500, now);
  assert.equal(summary(w, now).available, 10); assert.equal(summary(w, now).referralDebt, 3.5);
  referralGrant(w, "ref2", 500, now); referralGrant(w, "ref2", 500, now);
  assert.equal(summary(w, now).available, 11.5); assert.equal(summary(w, now).lifetimeEarned, 1.5);
  referralRevoke(w, "revoke2", 150, now, 350);
  assert.equal(summary(w, now).available, 10); assert.equal(summary(w, now).referralDebt, 3.5);
});
test("local mode is off by default and rejects production, non-QA databases and hosted targets", () => {
  assert.equal(localCreditsEnabled({}), false);
  const env = { ROLL_UNIFIED_CREDITS_LOCAL: "true", ROLL_LOCAL_POSTGRES: "true", DATABASE_URL: "postgresql://localhost/roll_rewards_qa_credits" };
  assert.equal(localCreditsEnabled(env), true);
  for (const invalid of [{ NODE_ENV: "production" }, { VERCEL: "1" }, { DATABASE_URL: "postgresql://example.com/roll_rewards_qa" }, { DATABASE_URL: "postgresql://localhost/roll" }, { ROLL_LOCAL_POSTGRES: "false" }]) assert.throws(() => localCreditsEnabled({ ...env, ...invalid }), /prohibited/);
});

test("earned/debt receipts balance, and signed adjustments cannot reuse a request for different money", async () => {
  const { adjust } = await import("../src/lib/credits/policy");
  const w = emptyWallet(now); grant(w, { key: "buy", amount: 500, origin: "purchased", reason: "paid" }, now);
  referralGrant(w, "first", 100, now); referralRevoke(w, "revoke", 200, now);
  referralGrant(w, "second", 300, now);
  assert.equal(w.events.reduce((n, e) => n + e.earnedDelta, 0), w.earned);
  assert.equal(w.events.reduce((n, e) => n + e.debtDelta, 0), w.referralDebt);
  adjust(w, "admin", -23, "correction", now); adjust(w, "admin", -23, "correction", now);
  assert.throws(() => adjust(w, "admin", 23, "correction", now), /idempotency/);
  assert.throws(() => adjust(w, "admin", -23, "different reason", now), /idempotency/);
  assert.equal(w.events.reduce((n, e) => n + e.availableDelta, 0), w.lots.reduce((n, l) => n + l.remaining, 0));
});

test("frontend returns complete known ledger errors without leaking SQL or credentials", async () => {
  const { creditFailure } = await import("../src/lib/credits/errors");
  for (const code of ["CREDITS_LEGACY_FENCED", "CREDITS_PENDING_HOLDS", "CREDITS_UNBALANCED", "CREDITS_IMMUTABLE", "CREDITS_TERMS_IMMUTABLE"]) {
    const result = creditFailure({ meta: { driverAdapterError: { cause: { originalMessage: `${code}: SELECT secret FROM passwords; postgres://private` } } } });
    assert(result?.message.includes(" / ")); assert(!/SELECT|passwords|postgres:\/\//.test(result!.message));
  }
  assert.equal(creditFailure(new Error("unknown SELECT password")), null);
});
