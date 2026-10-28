import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { conditionMet, pairKey, weekDueAt, weekKey, shareSchema, messageSchema } from "../src/lib/network/policy";
import { emptyInsight } from "../src/lib/customer-insights/schema";
import { publicCard } from "../src/lib/matchmaking/schema";

test("Taipei weeks, conditions and trust boundaries are deterministic", () => {
  assert.equal(weekKey(new Date("2026-10-25T15:59:59Z")), "2026-10-19");
  assert.equal(weekKey(new Date("2026-10-25T16:00:00Z")), "2026-10-26");
  assert.equal(weekDueAt("2026-10-19").toISOString(), "2026-10-26T01:00:00.000Z");
  assert.equal(pairKey("b", "a"), pairKey("a", "b"));
  assert(!messageSchema.safeParse({ body: " ", requestId: randomUUID() }).success);
  assert(!messageSchema.safeParse({ body: "x".repeat(4001), requestId: randomUUID() }).success);
  assert(!shareSchema.safeParse({ revision: 0, sections: ["signals"] }).success);
  const p = { interviews: 5, complete: false, paid: 0, fundraising: false };
  assert(conditionMet("interviews_5", p)); assert(!conditionMet("interviews_10", p));
  assert(!conditionMet("interviews_complete", p)); assert(!conditionMet("first_paid_customer", p)); assert(!conditionMet("invented", p));
  assert(conditionMet("first_paid_customer", { ...p, paid: 1 }));
  assert(conditionMet("fundraising_open", { ...p, fundraising: true }));
  const result = publicCard({ id: "card", sourcePolicy: 2, role: "founder", country: "", industry: "", slogan: "", offers: "", looksFor: "", categories: ["collaboration"], visibleFields: ["country", "industry", "companyPitch", "icp", "stats"], lastActiveAt: null, verified: false, recommended: false }, { companyName: "Public Startup", country: "Taiwan", industry: "SaaS", oneLinePitch: "Public pitch", icp: "Public ICP", targetMarkets: [] }, { interviews: 9, milestones: 2, payingCustomers: 1 }, null, new Date(), true);
  assert.equal(result.companyName, "Public Startup"); assert(!("stats" in result));
});

test("Member network transactions, privacy, evidence, weekly deduplication and notification delivery", async t => {
  const url = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
  if (!url) { t.skip("Isolated QA database required"); return; }
  const parsed = new URL(url); assert(["127.0.0.1", "localhost"].includes(parsed.hostname)); assert(parsed.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const suffix = randomUUID(), userIds: string[] = [];
  const env: Record<string, string | undefined> = { ...process.env, MEMBER_NETWORK_ENABLED: "true", MEMBER_NETWORK_EMAIL_ENABLED: "false", AUTH_SECRET: "test-only-member-network-signature", NEXT_PUBLIC_APP_URL: "https://example.com", RESEND_API_KEY: "test-only-resend", RESEND_FROM_EMAIL: "NOVA <test@example.com>" };
  const nativeRequire = createRequire(import.meta.url), modules = new Map<string, unknown>();
  class WriteError extends Error { constructor(text: string, public status = 409) { super(text); } }
  const mocks: Record<string, unknown> = { "server-only": {}, "@anthropic-ai/sdk": class { constructor() { throw new Error("Unexpected paid AI call"); } }, "@/lib/prisma": { prisma: db }, "@/lib/auth/account": { getBetaAccess: async () => false }, "@/lib/member-http": { MemberError: WriteError, changed: () => new WriteError("changed", 409) }, "@/lib/action-plan/service": { PlanWriteError: WriteError, lockActivePlan: async () => {} }, "@/lib/security/log": { logSecurityError() {} }, "@/lib/rate-limit": { DAY_MS: 86400000, MINUTE_MS: 60000, checkRateLimit: async () => ({ ok: true }) } };
  let sends = 0, failEmail = false, sentBody = "", photoPath = "";
  mocks["@vercel/blob"] = { get: async (path: string) => { photoPath = path; return { statusCode: 200, stream: new Response("qa photo").body }; } };
  mocks["@/lib/billing/paypal"] = {};
  env.MATCHMAKING_BLOB_READ_WRITE_TOKEN = "qa-private-store";
  function load<T>(file: string): T {
    const path = resolve(file); if (modules.has(path)) return modules.get(path) as T;
    const loaded = { exports: {} }; modules.set(path, loaded.exports);
    runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, process: { env, cwd: () => process.cwd() }, console, Date, Error, SyntaxError, Buffer, URL, Response, Request, AbortSignal, ReadableStream, TextEncoder, TextDecoder, setTimeout, fetch: async (target: string, options: { body: string }) => { assert.equal(target, "https://api.resend.com/emails"); sends++; sentBody = options.body; return failEmail ? Response.json({ message: "retry" }, { status: 503 }) : Response.json({ id: "qa-provider-id" }); }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(resolve(dirname(path), `${id}.ts`)) : nativeRequire(id) });
    return loaded.exports as T;
  }
  const access = load<typeof import("../src/lib/network/access")>("src/lib/network/access.ts"), service = load<typeof import("../src/lib/network/service")>("src/lib/network/service.ts"), watches = load<typeof import("../src/lib/network/watches")>("src/lib/network/watches.ts"), notifications = load<typeof import("../src/lib/network/notifications")>("src/lib/network/notifications.ts"), portalService = load<typeof import("../src/lib/investor/portal")>("src/lib/investor/portal.ts");
  async function user(plan = "free", investor = false) {
    const row = await db.user.create({ data: { email: `network-${suffix}-${userIds.length}@example.invalid`, plan, ...(plan !== "free" ? { subscriptionStatus: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 86400000), paypalSubscriptionId: `qa-${randomUUID()}` } : {}), profile: { create: { companyName: `QA Company ${userIds.length}`, industry: "SaaS", country: "Taiwan", oneLinePitch: "QA public pitch", targetMarkets: [], needs: [] } }, matchmakingProfile: { create: { role: investor ? "investor" : "founder", categories: ["collaboration"], country: "Taiwan", industry: "SaaS", slogan: "Public pitch", offers: "", looksFor: "", visibleFields: ["companyPitch", "icp", "photo"], visible: true, sourcePolicy: 2, verified: investor } } }, include: { matchmakingProfile: true } });
    userIds.push(row.id); return row;
  }
  try {
    const owner = await user("business"), investor = await user("free", true), stranger = await user(), spark = await user("pro");
    const photo = load<typeof import("../src/lib/matchmaking/photo")>("src/lib/matchmaking/photo.ts");
    await db.matchmakingProfile.update({ where: { userId: owner.id }, data: { originalPhoto: "qa/original.webp", blurredPhoto: "qa/blurred.webp" } });
    await photo.readPhoto(investor.id, owner.matchmakingProfile!.id); assert.equal(photoPath, "qa/blurred.webp");
    const journey = await db.discoveryJourney.create({ data: { userId: owner.id } });
    await t.test("New SPARK is gated; expired legacy sources and self-declared investors cannot elevate access", async () => {
      assert.equal((await access.features(spark.id)).prospects, false);
      const sourceKey = access.sources(spark)[0]!;
      await db.legacyFeatureGrant.create({ data: { userId: spark.id, feature: "prospects", sourceKey } });
      assert.equal((await access.features(spark.id)).prospects, true);
      await db.user.update({ where: { id: spark.id }, data: { featurePolicy: 2 } });
      assert.equal((await access.features(spark.id)).prospects, false);
      await db.user.update({ where: { id: spark.id }, data: { featurePolicy: null } });
      await db.user.update({ where: { id: spark.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000), trialPlan: "pro", trialStartsAt: new Date(Date.now() - 1000), trialEndsAt: new Date(Date.now() + 86400000) } });
      assert.equal((await access.features(spark.id)).prospects, false);
      await db.matchmakingProfile.update({ where: { userId: stranger.id }, data: { role: "investor", verified: false } });
      assert.equal((await access.features(stranger.id)).invite, false);
      assert.equal((await access.features(investor.id)).invite, true);
    });
    await t.test("Automatic cards follow company completeness without overriding explicit hiding or manual cards", async () => {
      const cards = load<typeof import("../src/lib/network/cards")>("src/lib/network/cards.ts"), own = load<typeof import("../src/lib/matchmaking/service")>("src/lib/matchmaking/service.ts");
      await db.onboardingProfile.update({ where: { userId: stranger.id }, data: { country: null } });
      await cards.syncAutomaticCard(stranger.id);
      assert.equal((await own.getMyCard(stranger.id)).visible, false);
      await db.onboardingProfile.update({ where: { userId: stranger.id }, data: { country: "Taiwan" } });
      await cards.syncAutomaticCard(stranger.id);
      const visible = await own.getMyCard(stranger.id); assert.equal(visible.visible, true);
      await own.writeMyCard(stranger.id, { action: "hide", revision: visible.revision, requestId: randomUUID() });
      await cards.syncAutomaticCard(stranger.id);
      assert.equal((await own.getMyCard(stranger.id)).visible, false);
      await db.matchmakingProfile.update({ where: { userId: stranger.id }, data: { sourcePolicy: null, slogan: "Original manual content" } });
      await cards.syncAutomaticCard(stranger.id);
      assert.equal((await own.getMyCard(stranger.id)).draft.slogan, "Original manual content");
    });
    let linkId = "";
    await t.test("Only a completed new-policy purchase changes policy; old renewals remain grandfathered", async () => {
      const reconcile = load<typeof import("../src/lib/billing/reconcile")>("src/lib/billing/reconcile.ts");
      const marker = "member_network_v2_snapshot";
      await db.setting.upsert({ where: { key: marker }, create: { key: marker, value: new Date(Date.now() - 1000).toISOString() }, update: { value: new Date(Date.now() - 1000).toISOString() } });
      const subscription = await db.subscription.create({ data: { userId: spark.id, paypalSubscriptionId: `qa-new-${suffix}`, paypalPlanId: "qa-plan", plan: "pro", status: "APPROVAL_PENDING", currentPeriodEnd: new Date(Date.now() + 86400000) } });
      await reconcile.reconcileFromPaypal({ id: subscription.paypalSubscriptionId, plan_id: "qa-plan", status: "APPROVAL_PENDING" } as never);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: spark.id } })).featurePolicy, null);
      await reconcile.reconcileFromPaypal({ id: subscription.paypalSubscriptionId, plan_id: "qa-plan", status: "ACTIVE" } as never);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: spark.id } })).featurePolicy, 2);
      await db.setting.delete({ where: { key: marker } });
    });
    await t.test("Pair deduplication, explicit acceptance and idempotent messages retain ownership boundaries", async () => {
      const args = { profileId: owner.matchmakingProfile!.id, conditions: ["interviews_5" as const] };
      const results = await Promise.all([service.invite(investor.id, args), service.invite(investor.id, args)]);
      linkId = results[0]!.id; assert.equal(results[1]!.id, linkId);
      assert.equal(await db.networkConnection.count({ where: { pairKey: pairKey(owner.id, investor.id) } }), 1);
      await assert.rejects(service.sendMessage(investor.id, linkId, { requestId: randomUUID(), body: "not accepted" }));
      await assert.rejects(service.changeConnection(investor.id, linkId, { action: "accept", revision: 1 }));
      await service.changeConnection(owner.id, linkId, { action: "accept", revision: 1 });
      await photo.readPhoto(investor.id, owner.matchmakingProfile!.id); assert.equal(photoPath, "qa/original.webp");
      const input = { requestId: randomUUID(), body: "A real QA message" };
      const sent = await Promise.all([service.sendMessage(investor.id, linkId, input), service.sendMessage(investor.id, linkId, input)]);
      assert.equal(sent[0]!.id, sent[1]!.id);
      await assert.rejects(service.sendMessage(investor.id, linkId, { ...input, body: "changed" }));
      await assert.rejects(service.messages(stranger.id, linkId));
      assert.equal((await service.messages(owner.id, linkId)).messages.length, 1);
      assert.equal((await service.listConnections(owner.id))[0]!.unread, 1);
    });
    await t.test("Private Portal requires consent, survives no kill-switch downgrade, and rejects foreign workspaces", async () => {
      const p = await db.investorPortal.create({ data: { userId: owner.id, shareProfile: true } });
      await db.investorInvitation.create({ data: { portalId: p.id, invitedEmail: investor.email, acceptedByUserId: investor.id, status: "accepted", networkPolicy: 2, expiresAt: new Date(Date.now() + 86400000) } });
      assert.equal(await portalService.getInvestorView(p.id, investor.id), null);
      await assert.rejects(service.share(owner.id, linkId, { revision: 0, sections: ["signals"], scope: { journeyId: "foreign" } }));
      await service.share(owner.id, linkId, { revision: 0, sections: ["signals", "profile"], scope: { journeyId: journey.id } });
      assert((await portalService.getInvestorView(p.id, investor.id))?.profile);
      env.MEMBER_NETWORK_ENABLED = "false";
      assert.equal(await portalService.getInvestorView(p.id, investor.id), null);
      env.MEMBER_NETWORK_ENABLED = "true";
      assert.equal(await db.memberNotification.count({ where: { userId: investor.id, kind: "watch" } }), 0);
    });
    const addInterview = (tx: typeof db, company: string) => tx.meetingNote.create({ data: { userId: owner.id, title: "QA interview", insight: { ...emptyInsight("discover"), journeyId: journey.id, company, notes: "Actual QA interview evidence" } } });
    await t.test("Five unique companies trigger once; rollback, duplicates, empty records and retries never inflate evidence", async () => {
      for (let i = 0; i < 4; i++) await addInterview(db, `Buyer ${i}`);
      await addInterview(db, "ＢＵＹＥＲ ０");
      await db.meetingNote.create({ data: { userId: owner.id, title: "Empty", insight: { ...emptyInsight("discover"), journeyId: journey.id, company: "Empty" } } });
      await assert.rejects(db.$transaction(async tx => { await addInterview(tx as never, "Buyer 4"); await watches.evaluateWatches(tx, owner.id); throw new Error("rollback"); }));
      assert.equal(await db.memberNotification.count({ where: { userId: investor.id, kind: "watch" } }), 0);
      await db.$transaction(async tx => { await addInterview(tx as never, "Buyer 4"); await watches.evaluateWatches(tx, owner.id); });
      await db.$transaction(tx => watches.evaluateWatches(tx, owner.id));
      assert.equal(await db.memberNotification.count({ where: { userId: investor.id, kind: "watch" } }), 1);
      assert.equal((await watches.watchSummary(owner.id)).investors, 1);
    });
    await t.test("Cross-page unique visits never return identities; self views do not count", async () => {
      await service.recordVisit(investor.id, { profileId: owner.matchmakingProfile!.id });
      const p = await db.investorPortal.findUniqueOrThrow({ where: { userId: owner.id } });
      await service.recordVisit(investor.id, { portalId: p.id });
      await service.recordVisit(owner.id, { profileId: owner.matchmakingProfile!.id });
      const summary = await service.visitorSummary(owner.id); assert.equal(summary.investors, 1);
      assert(!JSON.stringify(summary).includes(investor.id)); assert(!JSON.stringify(summary).includes(investor.email));
    });
    await t.test("Delivery persists exact payload, retries once, and unsubscribe is signed and category-specific", async () => {
      env.MEMBER_NETWORK_EMAIL_ENABLED = "true"; failEmail = true;
      await notifications.runNotifications(); assert.equal(sends, 1, JSON.stringify(await db.memberNotificationDelivery.findMany({ select: { status: true, lastError: true } })));
      const delivery = await db.memberNotificationDelivery.findFirstOrThrow({ where: { notification: { userId: investor.id } } });
      assert.equal(delivery.status, "pending"); assert.equal(delivery.attempts, 1);
      const previousBody = sentBody; failEmail = false;
      await notifications.runNotifications(new Date(Date.now() + 16 * 60000)); assert.equal(sends, 2); assert.equal(sentBody, previousBody);
      const accepted = await db.memberNotificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } }); assert.equal(accepted.status, "accepted");
      const prefs = await db.memberNotificationPreference.findUniqueOrThrow({ where: { userId: investor.id } });
      const token = notifications.notificationToken(investor.id, prefs.version, "watch");
      assert.throws(() => notifications.readNotificationToken(token + "x"));
      await notifications.unsubscribe(token); await notifications.unsubscribe(token);
      const saved = await db.memberNotificationPreference.findUniqueOrThrow({ where: { userId: investor.id } }); assert.equal(saved.watchEmail, false); assert.equal(saved.weeklyEmail, true);
      env.MEMBER_NETWORK_EMAIL_ENABLED = "false";
    });
    await t.test("Test-only delivery cannot send another account's notifications", async () => {
      env.MEMBER_NETWORK_EMAIL_ENABLED = "test";
      env.MEMBER_NETWORK_EMAIL_TEST_USER_ID = investor.id;
      env.MEMBER_NETWORK_EMAIL_TEST_TO = "qa-recipient@example.invalid";
      const other = await db.$transaction(tx => notifications.queueNotification(tx, owner.id, `qa-test-scope:${suffix}`, "weekly", { investors: 1, founders: 0, others: 0 }, true));
      const before = sends; await notifications.runNotifications(); assert.equal(sends, before);
      assert.equal((await db.memberNotificationDelivery.findUniqueOrThrow({ where: { notificationId: other.id } })).attempts, 0);
      env.MEMBER_NETWORK_EMAIL_ENABLED = "false";
    });
    await t.test("Actual receipts, full-stage confirmation and revoked grants are checked against saved evidence", async () => {
      const proof = { id: randomUUID(), kind: "signed", amount: "100", currency: "USD", date: "2026-10-28", pathname: "qa/private.pdf", filename: "proof.pdf", confirmed: true };
      const deal = await db.deal.create({ data: { userId: owner.id, title: "Buyer 0", stage: "won", validation: { scope: { journeyId: journey.id }, company: "Buyer 0", name: "Buyer", version: 1, status: "signed", events: [], proofs: [proof] } } });
      assert.equal((await watches.progressSnapshot(db as never, owner.id, { journeyId: journey.id })).paid, 0);
      await db.deal.update({ where: { id: deal.id }, data: { validation: { scope: { journeyId: journey.id }, company: "Buyer 0", name: "Buyer", version: 2, status: "paid", events: [], proofs: [{ ...proof, kind: "paid" }] } } });
      assert.equal((await watches.progressSnapshot(db as never, owner.id, { journeyId: journey.id })).paid, 1);
      await db.deal.update({ where: { id: deal.id }, data: { validation: { scope: { journeyId: journey.id }, company: "Buyer 0", name: "Buyer", version: 3, status: "paid", events: [], proofs: [{ ...proof, kind: "paid", revokedAt: new Date().toISOString() }] } } });
      assert.equal((await watches.progressSnapshot(db as never, owner.id, { journeyId: journey.id })).paid, 0);
      await assert.rejects(watches.updateProgress(owner.id, { confirmInterviews: { journeyId: journey.id } }));
      for (let i = 5; i < 10; i++) await addInterview(db, `Buyer ${i}`);
      assert.equal((await watches.progressSnapshot(db as never, owner.id, { journeyId: journey.id })).complete, false);
      await watches.updateProgress(owner.id, { confirmInterviews: { journeyId: journey.id } });
      assert.equal((await watches.progressSnapshot(db as never, owner.id, { journeyId: journey.id })).complete, true);
      const portal = await db.investorPortal.findUniqueOrThrow({ where: { userId: owner.id } });
      await db.investorInvitation.updateMany({ where: { portalId: portal.id }, data: { networkPolicy: null } });
      const grant = await db.networkShare.findUniqueOrThrow({ where: { ownerId_viewerId: { ownerId: owner.id, viewerId: investor.id } } });
      const input = { revision: grant.revision, sections: [] };
      const first = await service.share(owner.id, linkId, input);
      assert.equal((await service.share(owner.id, linkId, input)).revision, first.revision);
      assert.equal(await portalService.getInvestorView(portal.id, investor.id), null);
    });
    await t.test("Blocking stops private access and new messages while preserving chat history", async () => {
      const row = await db.networkConnection.findUniqueOrThrow({ where: { id: linkId } });
      await service.changeConnection(owner.id, linkId, { action: "block", revision: row.revision });
      assert.equal(await access.activeShare(owner.id, investor.id, "signals"), null);
      await photo.readPhoto(investor.id, owner.matchmakingProfile!.id); assert.equal(photoPath, "qa/blurred.webp");
      await assert.rejects(service.sendMessage(investor.id, linkId, { requestId: randomUUID(), body: "blocked" }));
      assert.equal((await service.messages(owner.id, linkId)).messages.length, 1);
      assert.equal((await notifications.notificationList(investor.id)).notifications.find(n => n.kind === "unavailable")?.payload && true, true);
    });
    await t.test("Weekly nonzero summaries are unique; zero viewers do not get a digest", async () => {
      const week = "2031-12-29";
      await db.memberVisit.create({ data: { viewerId: investor.id, ownerId: owner.id, week, role: "investor" } });
      await notifications.runNotifications(weekDueAt(week)); await notifications.runNotifications(weekDueAt(week));
      assert.equal(await db.memberNotification.count({ where: { userId: owner.id, eventKey: `visits:${owner.id}:${week}` } }), 1);
      assert.equal(await db.memberNotification.count({ where: { userId: stranger.id, kind: "weekly" } }), 0);
      await db.setting.deleteMany({ where: { key: `member_digest:${week}` } });
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: userIds } } }); await db.$disconnect();
  }
});
