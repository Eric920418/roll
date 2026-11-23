import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pdfRuntime } from "./helpers/pdf-runtime";
import type { Account } from "../src/lib/auth/account";

const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
test("Earned free month: actual cancellation, replay, timeout recovery, expiry and refund", { skip: !connectionString }, async t => {
  const url = new URL(connectionString!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
  const now = new Date("2026-11-23T12:00:00Z"), ids: string[] = [];
  class Clock extends Date { constructor(value: string | number | Date = now) { super(value); } static now() { return now.getTime(); } }
  const remote = new Map<string, { id: string; plan_id: string; status: string; billing_info: { next_billing_time: string } }>();
  let cancels = 0, timeoutAfterCancel = false;
  const provider = {
    getSubscription: async (id: string) => { const value = remote.get(id); assert(value); return { ...value }; },
    cancelSubscription: async (id: string) => { const value = remote.get(id); assert(value); cancels++; value.status = "CANCELLED"; if (timeoutAfterCancel) { timeoutAfterCancel = false; throw Error("provider response timeout"); } },
  };
  const load = pdfRuntime({ "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/auth/account": {}, "@/lib/security/log": { logSecurityError: () => "qa-free-month-trace" }, "@/lib/billing/paypal": provider, "@/lib/cron/schedules": { invalidateReferralSchedule() {} }, "@/lib/rewards/service": { rewardTransaction: async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
    for (let i = 0; ; i++) try { return await db.$transaction(work, { isolationLevel: "Serializable" }); } catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || i === 6) throw error; }
  } } }, { Date: Clock, process: { env: { REFERRAL_PAYER_HMAC_KEY: "local-isolated-reward-key-at-least-32-bytes" } } });
  const months = load<typeof import("../src/lib/referrals/free-months")>("src/lib/referrals/free-months.ts");
  const service = load<typeof import("../src/lib/referrals/service")>("src/lib/referrals/service.ts");
  const registration = load<typeof import("../src/lib/referrals/registration")>("src/lib/referrals/registration.ts");
  const gate = load<typeof import("../src/lib/billing/gate")>("src/lib/billing/gate.ts");
  async function fixture() {
    const inviter = await db.user.create({ data: { email: `${randomUUID()}@free-month.invalid`, trialPlan: "pro", trialStartsAt: new Date("2026-10-01"), trialEndsAt: new Date("2026-10-10"), trialPolicy: "original-qa-trial" } }); ids.push(inviter.id);
    const code = (await registration.ensureReferralAccount(inviter.id)).code;
    const invitee = await registration.registerWithReferral({ email: `${randomUUID()}@free-month.invalid` }, code); ids.push(invitee.id);
    const referral = await db.referral.findUniqueOrThrow({ where: { inviteeId: invitee.id } });
    assert.equal(referral.version, 2);
    const sourceSub = await db.subscription.create({ data: { userId: invitee.id, paypalSubscriptionId: `I-PAID-${randomUUID()}`, paypalPlanId: `P-PAID-${randomUUID()}`, plan: "pro", status: "CANCELLED", billingInterval: "month" } });
    const credit = { key: `capture:${randomUUID()}`, kind: "credits", orderId: randomUUID(), subscriptionId: null, payerHash: randomUUID(), amountMinor: 500, currency: "USD", paidAt: new Date("2026-11-01T11:00:00Z"), status: "completed" as const };
    await service.settleReferral(referral.id, [credit], [], now);
    assert.equal((await db.referral.findUniqueOrThrow({ where: { id: referral.id } })).status, "pending_payment");
    assert.equal(await db.referralFreeMonth.count({ where: { referralId: referral.id } }), 0);
    const proof = { key: `capture:${randomUUID()}`, kind: "subscription", orderId: null, subscriptionId: sourceSub.paypalSubscriptionId, payerHash: randomUUID(), amountMinor: 4900, currency: "USD", paidAt: new Date("2026-11-01T12:00:00Z"), status: "completed" as const };
    await service.settleReferral(referral.id, [proof], [], new Date("2026-11-14T12:00:00Z"));
    assert.equal(await db.referralFreeMonth.count({ where: { referralId: referral.id } }), 0);
    await Promise.all([service.settleReferral(referral.id, [proof], [], now), service.settleReferral(referral.id, [proof], [], now)]);
    const benefits = await db.referralFreeMonth.findMany({ where: { referralId: referral.id }, include: { account: true } });
    assert.equal(benefits.length, 2); assert.equal(await db.referralEntry.count({ where: { referralId: referral.id } }), 0);
    return { inviter, invitee, referral, proof, benefit: benefits.find(b => b.account.userId === inviter.id)! };
  }
  async function monthly(userId: string, interval = "month") {
    const id = `I-QA-${randomUUID()}`, plan = `P-QA-${randomUUID()}`;
    const localEnd = new Date("2026-11-29T12:00:00Z"), actualEnd = "2026-12-01T12:00:00Z";
    await db.subscription.create({ data: { userId, paypalSubscriptionId: id, paypalPlanId: plan, plan: "business", status: "ACTIVE", billingInterval: interval, currentPeriodEnd: localEnd } });
    await db.user.update({ where: { id: userId }, data: { paypalSubscriptionId: id, subscriptionStatus: "ACTIVE", plan: "business", currentPeriodEnd: localEnd } });
    remote.set(id, { id, plan_id: plan, status: "ACTIVE", billing_info: { next_billing_time: actualEnd } });
    return { id, actualEnd };
  }
  try {
    await t.test("calendar month respects Taipei midnight, leap years and month ends", () => {
      assert.equal(months.freeMonthEnd(new Date("2027-01-31T15:00:00Z")).toISOString(), "2027-02-28T15:00:00.000Z");
      assert.equal(months.freeMonthEnd(new Date("2028-01-31T16:00:00Z")).toISOString(), "2028-02-29T16:00:00.000Z");
    });
    await t.test("two-sided award waits fourteen days; free member redeems once; original trial is untouched", async () => {
      const f = await fixture();
      const result = await Promise.allSettled([months.redeemFreeMonth(f.inviter.id, f.benefit.id, randomUUID(), now), months.redeemFreeMonth(f.inviter.id, f.benefit.id, randomUUID(), now)]);
      assert(result.some(r => r.status === "fulfilled"));
      const saved = await db.referralFreeMonth.findUniqueOrThrow({ where: { id: f.benefit.id } });
      const replay = await months.redeemFreeMonth(f.inviter.id, f.benefit.id, randomUUID(), now);
      assert.equal(replay.endsAt?.toISOString(), saved.endsAt?.toISOString()); assert.equal(cancels, 0);
      const member = await db.user.findUniqueOrThrow({ where: { id: f.inviter.id } });
      assert.equal(member.trialPolicy, f.inviter.trialPolicy); assert.equal(member.trialEndsAt?.toISOString(), f.inviter.trialEndsAt?.toISOString());
      const account = { ...member, betaAccess: false } as unknown as Account;
      assert.equal(gate.getEffectivePlan(account, now), "pro");
      assert.equal(gate.getEffectivePlan(account, saved.endsAt!), "free");
      await assert.rejects(months.redeemFreeMonth(f.invitee.id, f.benefit.id, randomUUID(), now), /not found/);
      await service.recordReferralRefund(f.proof.key);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: f.inviter.id } })).referralMonthEndsAt, null);
      assert.equal(await db.referralFreeMonth.count({ where: { referralId: f.referral.id, status: "revoked" } }), 2);
    });
    await t.test("monthly renewal really cancels before free month; authoritative paid period is preserved", async () => {
      const f = await fixture(), sub = await monthly(f.inviter.id), before = cancels;
      const benefit = await months.redeemFreeMonth(f.inviter.id, f.benefit.id, randomUUID(), now);
      assert.equal(cancels, before + 1); assert.equal(remote.get(sub.id)?.status, "CANCELLED");
      assert.equal(benefit.startsAt?.toISOString(), sub.actualEnd.replace("Z", ".000Z")); assert.equal(benefit.plan, "business");
      assert.equal(benefit.endsAt?.toISOString(), "2027-01-01T12:00:00.000Z");
      const member = await db.user.findUniqueOrThrow({ where: { id: f.inviter.id } });
      assert.equal(member.subscriptionStatus, "CANCELLED"); assert.equal(member.currentPeriodEnd?.toISOString(), benefit.startsAt?.toISOString());
      assert.equal(gate.getEffectivePlan({ ...member, betaAccess: false } as unknown as Account, new Date("2026-12-15")), "business");
      assert.equal(gate.getEffectivePlan({ ...member, betaAccess: false } as unknown as Account, benefit.endsAt!), "free");
      await months.redeemFreeMonth(f.inviter.id, f.benefit.id, randomUUID(), now); assert.equal(cancels, before + 1);
    });
    await t.test("existing trial dates remain independent from authoritative paid-through", async () => {
      const f = await fixture(), sub = await monthly(f.inviter.id), trialEnd = new Date("2027-02-01T12:00:00Z");
      await db.user.update({ where: { id: f.inviter.id }, data: { trialPlan: "business", trialStartsAt: now, trialEndsAt: trialEnd } });
      const benefit = await months.redeemFreeMonth(f.inviter.id, f.benefit.id, randomUUID(), now);
      const member = await db.user.findUniqueOrThrow({ where: { id: f.inviter.id } });
      assert.equal(member.currentPeriodEnd?.toISOString(), new Date(sub.actualEnd).toISOString());
      assert.equal(member.trialEndsAt?.toISOString(), trialEnd.toISOString());
      assert.equal(benefit.startsAt?.toISOString(), new Date(sub.actualEnd).toISOString());
      assert.equal(gate.getEffectivePlan({ ...member, betaAccess: false, trialPlan: null, trialEndsAt: null } as unknown as Account, new Date("2027-01-15T12:00:00Z")), "free");
    });
    await t.test("lost cancellation response grants nothing until same cancellation is verified; annual cannot be cancelled", async () => {
      const f = await fixture(), sub = await monthly(f.inviter.id), before = cancels; timeoutAfterCancel = true;
      await assert.rejects(months.redeemFreeMonth(f.inviter.id, f.benefit.id, randomUUID(), now), /not active/);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: f.inviter.id } })).referralMonthEndsAt, null);
      // A real cancellation webhook may arrive before the retry.
      await db.subscription.update({ where: { paypalSubscriptionId: sub.id }, data: { status: "CANCELLED", currentPeriodEnd: new Date(sub.actualEnd) } });
      const result = await months.redeemFreeMonth(f.inviter.id, f.benefit.id, randomUUID(), now);
      assert.equal(result.startsAt?.toISOString(), "2026-12-01T12:00:00.000Z"); assert.equal(cancels, before + 1);
      const annual = await fixture(); await monthly(annual.inviter.id, "year");
      await assert.rejects(months.redeemFreeMonth(annual.inviter.id, annual.benefit.id, randomUUID(), now), /annual/); assert.equal(cancels, before + 1);
    });
  } finally {
    const accounts = await db.referralAccount.findMany({ where: { userId: { in: ids } }, select: { id: true } });
    await db.referralFreeMonth.deleteMany({ where: { accountId: { in: accounts.map(a => a.id) } } });
    await db.referralPayment.deleteMany({ where: { userId: { in: ids } } });
    await db.referral.deleteMany({ where: { inviteeId: { in: ids } } });
    await db.referralAccount.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
