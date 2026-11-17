import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, cp, appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { auditColumns, collectAuditSnapshot, type AuditDataset } from "../scripts/credits-audit-snapshot";
import { auditMembers } from "../scripts/credits-audit-members";
import { auditCsv, auditHtml } from "../scripts/credits-audit-report";
const date = (value: string) => new Date(value), start = date("2026-11-01T00:00:00Z");
function fixture(): AuditDataset {
  const tables = Object.fromEntries(Object.keys(auditColumns).map(k => [k, []])) as unknown as AuditDataset["tables"];
  tables.User = [{ id: "member", email: "member@example.invalid", firstName: "=Private <script>alert(1)</script>", lastName: "", plan: "free", rollonMember: true, paypalSubscriptionId: null, subscriptionStatus: null, currentPeriodEnd: null, planUpdatedAt: null, trialPlan: null, trialStartsAt: null, trialEndsAt: null, founderStartedAt: null, founderEndsAt: null, trialPolicy: null, featurePolicy: null, createdAt: start }];
  tables.TokenWallet = [{ userId: "member", available: 230, reserved: 20 }];
  tables.TokenLedger = [{ id: "first", userId: "member", eventKey: "old", kind: "grant", availableDelta: 100, reservedDelta: 0 }, { id: "monthly", userId: "member", eventKey: "monthly:member:2026-11", kind: "grant", availableDelta: 150, reservedDelta: 0 }, { id: "held", userId: "member", reservationId: "hold", eventKey: "reserve:hold", kind: "reserve", availableDelta: -20, reservedDelta: 20 }];
  tables.TokenReservation = [{ id: "hold", userId: "member", kind: "search", resourceId: "order", status: "reserved", amount: 20, expiresAt: date("2026-11-18T00:00:00Z"), pricing: { amount: 20 } }];
  tables.ProspectingOrder = [{ id: "order", userId: "member", status: "queued" }];
  tables.RewardAccount = [{ userId: "member", balance: 30 }];
  tables.RewardEntry = [{ userId: "member", id: "earn", eventKey: "action:one", kind: "action", points: 130 }, { userId: "member", id: "redeem", eventKey: "redeem:one", kind: "redeem", points: -100 }];
  tables.RewardRedemption = [{ id: "redemption", userId: "member", requestId: "one", points: 100, credits: 5 }];
  tables.AiAllowance = [{ userId: "member", cycleStart: start, cycleEnd: date("2026-12-01T00:00:00Z"), includedUsed: 10, includedReserved: 0, bonusBalance: 2, rewardBalance: 5 }];
  tables.AiUsage = [...Array.from({ length: 10 }, (_, i) => ({ id: "ai" + i, userId: "member", source: "included", status: "succeeded", cycleStart: start })), { id: "bonus", userId: "member", source: "bonus", status: "succeeded" }];
  tables.AiCreditPurchase = [{ id: "purchase", userId: "member", status: "COMPLETED", credits: 3, hasCapture: true, completedAt: start, amountMinor: 500, currency: "USD" }];
  tables.LegacyFeatureGrant = [{ id: "grant", userId: "member", feature: "prospects", sourceKey: "rollon-member" }];
  return { asOf: "2026-11-17T00:00:00.000Z", tables, settings: [], localWalletKeys: [] };
}
test("member audit preserves balances, original access and source data; report escapes PII and CSV formulas", async () => {
  const input = fixture(), before = JSON.stringify(input), report = await auditMembers(input, { MEMBER_NETWORK_ENABLED: "true" });
  assert.equal(JSON.stringify(input), before); assert.equal(report.totals.ready, 1); assert.equal(report.totals.blocked, 0);
  const member = report.members[0]; assert.equal((member.conversion?.after as { available: number }).available, 378.5);
  assert(member.entitlements.featuresBefore.prospects); assert.deepEqual(member.entitlements.featuresBefore, member.entitlements.featuresAfter);
  assert(auditHtml(report).includes("&lt;script&gt;")); assert(!auditHtml(report).includes("<script>alert(1)</script>"));
  assert(auditCsv(report).includes('"\'=Private'));
});
test("audit blocks every ledger discrepancy without repairing balances and separates unposted entitlements", async () => {
  const input = fixture(); input.tables.TokenWallet[0].available = 231; input.tables.AiAllowance[0].bonusBalance = 3;
  const report = await auditMembers(input, { MEMBER_NETWORK_ENABLED: "true" });
  assert.equal(report.members[0].status, "blocked"); assert.equal(report.members[0].conversion, null);
  assert(report.members[0].findings.some(f => f.code === "token_available_ledger" && f.expected === 230 && f.actual === 231));
  assert(report.members[0].findings.some(f => f.code === "purchased_ai_provenance")); assert.equal(input.tables.TokenWallet[0].available, 231);
  const owed = fixture(); owed.tables.TokenLedger = owed.tables.TokenLedger.filter(r => r.id !== "monthly"); owed.tables.TokenWallet[0].available = 80;
  const due = (await auditMembers(owed, { MEMBER_NETWORK_ENABLED: "true" })).members[0];
  assert.equal(due.entitlements.monthlyOwed, 150);
  assert.equal((due.conversion?.afterEntitlementsDue as { available: number }).available - (due.conversion?.after as { available: number }).available, 150);
});
test("overdue AI holds are only simulated and do not reissue previously redeemed rewards", async () => {
  const input = fixture(); input.tables.AiAllowance[0].rewardBalance = 4;
  input.tables.AiUsage.push({ id: "pending", userId: "member", source: "reward", status: "pending", expiresAt: date("2026-11-16T00:00:00Z") });
  const member = (await auditMembers(input, { MEMBER_NETWORK_ENABLED: "true" })).members[0];
  assert.equal(member.status, "review"); assert.equal((member.conversion?.after as { available: number }).available, 377.5);
  assert.equal((member.conversion?.afterPendingAiRelease as { available: number }).available, 378.5);
  assert.equal(input.tables.AiUsage.at(-1)!.status, "pending");
});
test("entitlements are compared against a separate source tree and a downgrade blocks conversion", async () => {
  const root = await mkdtemp("/tmp/credits-baseline-test-");
  try {
    await cp("src/lib", join(root, "src/lib"), { recursive: true });
    await appendFile(join(root, "src/lib/billing/gate.ts"), "\nexports.getEffectivePlan = () => 'enterprise';\nexports.getPaidPlan = () => 'enterprise';\n");
    await appendFile(join(root, "src/lib/billing/commerce.ts"), "\nconst auditOriginalQuote = exports.tokenQuote; exports.tokenQuote = async tx => ({...await auditOriginalQuote(tx), monthlyGrant: 160, searchFee: 19});\n");
    const member = (await auditMembers(fixture(), { MEMBER_NETWORK_ENABLED: "true" }, root)).members[0];
    assert.equal(member.status, "blocked"); assert.equal(member.entitlements.originalPlan, "enterprise"); assert.equal(member.entitlements.effectivePlan, "pro");
    assert(member.findings.some(f => f.code === "effective_plan_changed")); assert(member.findings.some(f => f.code === "rights_reduced"));
    assert(member.findings.some(f => f.code === "recurring_entitlement_reduced")); assert(member.findings.some(f => f.code === "purchasing_power_reduced"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("database audit uses a read-only repeatable snapshot, records zero writes and rolls back", async t => {
  const url = process.env.ROLL_REWARDS_TEST_DATABASE_URL; if (!url) { t.skip("Explicit isolated QA database required"); return; }
  const target = new URL(url); assert(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const user = await db.user.create({ data: { email: `readonly-${randomUUID()}@example.invalid` } });
  try {
    const result = await collectAuditSnapshot(url, async data => data.tables.User.some(r => r.id === user.id));
    assert(result.result); assert.equal(result.proof.readOnly, "on"); assert.equal(result.proof.transactionWrites, 0); assert(result.proof.rolledBack);
    await assert.rejects(collectAuditSnapshot(url, async data => { data.tables.User.find(r => r.id === user.id)!.email = "changed@example.invalid"; return null; }), /immutable/);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).email, user.email);
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
});
