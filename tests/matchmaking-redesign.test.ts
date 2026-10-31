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
import { actionProgress } from "../src/lib/dashboard/next-steps";
import { privacyState, identityIsCurrent, tourWriteSchema } from "../src/lib/network/viewer-privacy";
import { matchCopy, publicCard, recommendationRank } from "../src/lib/matchmaking/schema";

test("Recorded steps preserve exact decimal progress at a task boundary", () => {
  assert.equal(actionProgress([{ done: false, metric: { current: 3, target: 10 } }, { done: false }, { done: false }]), 10);
  assert.equal(actionProgress([{ done: false, metric: { current: 2, target: 10 } }, { done: false }, { done: false }]), 6.6);
});
test("Identified visitors require the current opt-in epoch; historical and revoked visits never reveal identity", () => {
  const at = new Date("2026-10-31T01:00:00Z"), state = { enabled: true, consentAt: at.toISOString(), revision: 1, requestId: "test", hash: "test" };
  assert.equal(privacyState(null).enabled, false);
  assert.equal(identityIsCurrent(state, null, null), false);
  assert.equal(identityIsCurrent(state, at, new Date(at.getTime() + 1)), true);
  assert.equal(identityIsCurrent({ ...state, enabled: false }, at, at), false);
  assert.equal(identityIsCurrent({ ...state, consentAt: new Date(at.getTime() + 1).toISOString() }, at, at), false);
  assert.equal(tourWriteSchema.safeParse({ version: 1, step: 4, finished: false, revision: 0, requestId: randomUUID() }).success, false);
});
test("Recommendations and drafts use public facts without percentages, private signals or investor intent", () => {
  const card = publicCard({ id: "public-card", displayName: "Public name", role: "investor", categories: ["collaboration"], country: "TW", industry: "saas", slogan: "", offers: "Secret offer", looksFor: "", visibleFields: ["country", "industry"], lastActiveAt: null, verified: true, recommended: false }, { companyName: "Company", oneLinePitch: "Private pitch", icp: "Private ICP", targetMarkets: [] }, { interviews: 99, payingCustomers: 12, milestones: 2 }, { industry: "saas", categories: ["investors"] }, new Date(), true);
  assert.deepEqual(card.reasons, ["need", "industry"]); assert.equal(recommendationRank(card), 6);
  assert.equal(card.displayName, "Public name"); assert(!("stage" in card));
  for (const zh of [false, true]) {
    const copy = JSON.stringify(matchCopy(card, zh)); assert.doesNotMatch(copy, /Secret|Private|99|12|%/);
    assert(copy.includes("Public name"));
  }
  assert.equal(recommendationRank({ ...card, reasons: [] }), 0);
});
test("Redesign transactions on isolated PostgreSQL: consent, exclusions, company CAS, ranking and independent tour state", async t => {
  const url = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
  if (!url) { t.skip("Isolated QA database required"); return; }
  const parsed = new URL(url); assert(["127.0.0.1", "localhost"].includes(parsed.hostname)); assert(parsed.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }), ids: string[] = [];
  const native = createRequire(import.meta.url), modules = new Map<string, unknown>();
  const env = { ...process.env, MEMBER_NETWORK_ENABLED: "true", NETWORK_IDENTIFIED_VIEWS_ENABLED: "true" };
  class WriteError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const mocks: Record<string, unknown> = { "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/auth/account": { getBetaAccess: async () => false }, "@/lib/member-http": { MemberError: WriteError, changed: () => new WriteError("changed", 409) }, "@/lib/action-plan/service": {}, "@/lib/security/log": { logSecurityError() {} }, "@anthropic-ai/sdk": class { constructor() { throw new Error("No paid AI in redesign"); } } };
  function load<T>(file: string): T {
    const path = resolve(file); if (modules.has(path)) return modules.get(path) as T;
    const loaded = { exports: {} }; modules.set(path, loaded.exports);
    runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, process: { env, cwd: () => process.cwd() }, console, Date, Error, Buffer, URL, Response, Request, setTimeout, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(resolve(dirname(path), `${id}.ts`)) : native(id) });
    return loaded.exports as T;
  }
  const privacy = load<typeof import("../src/lib/network/identified-visitors")>("src/lib/network/identified-visitors.ts"), visits = load<typeof import("../src/lib/network/service")>("src/lib/network/service.ts"), cards = load<typeof import("../src/lib/matchmaking/service")>("src/lib/matchmaking/service.ts");
  async function user(plan = "business", industry = "saas", role = "founder") {
    const row = await db.user.create({ data: { email: `redesign-${randomUUID()}@example.invalid`, firstName: "Never automatically disclose", plan, featurePolicy: 2, ...(plan !== "free" ? { subscriptionStatus: "ACTIVE", paypalSubscriptionId: `qa-${randomUUID()}`, currentPeriodEnd: new Date(Date.now() + 86400000) } : {}), profile: { create: { companyName: `Redesign ${ids.length}`, country: "TW", industry, oneLinePitch: "Public pitch", companyStage: "MVP", primaryNeed: "Validate", icp: "Private ICP", targetMarkets: [], needs: [] } }, matchmakingProfile: { create: { role, categories: ["collaboration"], country: "TW", industry, slogan: "", offers: "", looksFor: "", sourcePolicy: 2, visible: true, verified: role === "investor", visibleFields: ["country", "industry", "companyPitch"] } } }, include: { matchmakingProfile: true } }); ids.push(row.id); return row;
  }
  try {
    const owner = await user(), viewer = await user(), free = await user("free");
    const input = { profileId: owner.matchmakingProfile!.id };
    await visits.recordVisit(viewer.id, input);
    const historical = await db.memberVisit.findFirstOrThrow({ where: { ownerId: owner.id } });
    assert.equal((await privacy.identifiedVisitors(owner.id)).members.length, 0);
    const enabled = await privacy.writeViewerPrivacy(viewer.id, { enabled: true, revision: 0, requestId: randomUUID() });
    assert.equal((await privacy.identifiedVisitors(owner.id)).members.length, 0, "Opting in does not reveal the earlier anonymous visit");
    await visits.recordVisit(viewer.id, input);
    const named = await privacy.identifiedVisitors(owner.id);
    assert.equal(named.members.length, 1); assert.equal(named.members[0]!.card.id, viewer.matchmakingProfile!.id);
    assert.doesNotMatch(JSON.stringify(named), /Never automatically|Private ICP|viewerId|ownerId|@example/);
    assert.equal(await db.memberVisit.count({ where: { ownerId: owner.id, viewerId: viewer.id } }), 1);
    assert.equal((await db.memberVisit.findUniqueOrThrow({ where: { id: historical.id } })).createdAt.getTime(), historical.createdAt.getTime());
    const off = await privacy.writeViewerPrivacy(viewer.id, { enabled: false, revision: enabled.revision, requestId: randomUUID() });
    assert.equal((await privacy.identifiedVisitors(owner.id)).members.length, 0);
    await privacy.writeViewerPrivacy(viewer.id, { enabled: true, revision: off.revision, requestId: randomUUID() });
    assert.equal((await privacy.identifiedVisitors(owner.id)).members.length, 0, "Re-consenting cannot restore an old consent epoch");
    await visits.recordVisit(viewer.id, input);
    assert.equal((await privacy.identifiedVisitors(owner.id)).members.length, 1);
    await db.matchmakingProfile.update({ where: { userId: viewer.id }, data: { visible: false, hiddenByUserAt: new Date() } });
    assert.equal((await privacy.identifiedVisitors(owner.id)).members.length, 0);
    await db.matchmakingProfile.update({ where: { userId: viewer.id }, data: { visible: true, hiddenByUserAt: null } });
    const connection = await db.networkConnection.create({ data: { pairKey: [owner.id, viewer.id].sort().join(":"), senderId: owner.id, recipientId: viewer.id, status: "blocked", blockedBy: owner.id } });
    assert.equal((await privacy.identifiedVisitors(owner.id)).members.length, 0);
    await assert.rejects(cards.getMemberCard(owner.id, viewer.matchmakingProfile!.id));
    await assert.rejects(visits.recordVisit(viewer.id, input));
    await db.networkConnection.delete({ where: { id: connection.id } });
    await assert.rejects(privacy.identifiedVisitors(free.id));
    env.NETWORK_IDENTIFIED_VIEWS_ENABLED = "false";
    assert.equal((await privacy.identifiedVisitors(owner.id)).available, false);
    env.NETWORK_IDENTIFIED_VIEWS_ENABLED = "true";

    const before = await cards.getMyCard(viewer.id), company = { sourceVersion: before.sourceVersion, companyName: "Updated company", country: "TW", industry: "saas", oneLinePitch: "Updated pitch", companyStage: "MVP" };
    const save = { action: "save" as const, requestId: randomUUID(), revision: before.revision, draft: { ...before.draft, displayName: "Voluntary name" }, company };
    const saved = await cards.writeMyCard(viewer.id, save);
    assert.equal(saved.source?.companyName, "Updated company"); assert.equal(saved.draft.displayName, "Voluntary name");
    const again = await cards.writeMyCard(viewer.id, save); assert.equal(again.revision, saved.revision);
    assert.equal(await db.rewardEntry.count({ where: { userId: viewer.id, kind: "profile" } }), 1);
    await db.onboardingProfile.update({ where: { userId: viewer.id }, data: { oneLinePitch: "Changed in another tab" } });
    await assert.rejects(cards.writeMyCard(viewer.id, { ...save, requestId: randomUUID(), revision: saved.revision, company: { ...company, sourceVersion: saved.sourceVersion } }));
    assert.equal((await cards.getMyCard(viewer.id)).revision, saved.revision);
    assert.equal((await db.onboardingProfile.findUniqueOrThrow({ where: { userId: viewer.id } })).oneLinePitch, "Changed in another tab");
    const latest = await cards.getMyCard(viewer.id);
    const concurrent = await Promise.allSettled([1, 2].map(n => cards.writeMyCard(viewer.id, { ...save, requestId: randomUUID(), revision: latest.revision, company: { ...company, companyName: `Concurrent ${n}`, sourceVersion: latest.sourceVersion } })));
    assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1);

    const rollback = await user(), base = await cards.getMyCard(rollback.id);
    await assert.rejects(cards.writeMyCard(rollback.id, { action: "save", revision: base.revision, requestId: randomUUID(), company: { ...company, sourceVersion: base.sourceVersion, companyName: "Must roll back" }, draft: { ...base.draft, country: "Invalid new country" } }));
    assert.equal((await db.onboardingProfile.findUniqueOrThrow({ where: { userId: rollback.id } })).companyName, base.source?.companyName);
    assert.equal(await db.rewardEntry.count({ where: { userId: rollback.id } }), 0);
    assert.equal(await db.rewardAccount.findUnique({ where: { userId: rollback.id } }), null);
    assert.equal((await cards.getMyCard(rollback.id)).revision, base.revision);
    const privacyWrites = await Promise.allSettled([true, false].map(enabled => privacy.writeViewerPrivacy(rollback.id, { enabled, revision: 0, requestId: randomUUID() })));
    assert.equal(privacyWrites.filter(v => v.status === "fulfilled").length, 1);
    const mentor = await user("business", "other", "mentor"), investor = await user("business", "other", "investor");
    await db.matchmakingProfile.update({ where: { userId: owner.id }, data: { categories: ["investors"] } });
    const recommended = await cards.listCards(owner.id, "all", 1, { view: "recommendations", q: "Redesign" });
    assert.equal(recommended.cards.some(c => c.id === owner.matchmakingProfile!.id), false);
    assert.equal(recommended.cards.some(c => c.id === mentor.matchmakingProfile!.id), false);
    assert.equal(recommended.cards[0]!.id, investor.matchmakingProfile!.id);
    const filtered = await cards.listCards(owner.id, "all", 1, { view: "all", q: "Private ICP" }); assert.equal(filtered.cards.length, 0);
    await db.user.update({ where: { id: owner.id }, data: { gettingStartedVersion: 3, gettingStartedCompletedAt: new Date() } });
    const tour = await privacy.writeTour(owner.id, { version: 1, step: 2, finished: true, revision: 0, requestId: randomUUID() });
    assert.equal(tour.finished, true); assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).gettingStartedVersion, 3);
    await assert.rejects(privacy.writeTour(owner.id, { version: 1, step: 1, finished: false, revision: 0, requestId: randomUUID() }));
  } finally { await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); }
});

test("Visit recorder cancels background-tab timers and records only a visible two-second visit", () => {
  const native = createRequire(import.meta.url), effects: Array<() => (() => void) | void> = [], timers = new Map<number, () => void>(), listeners = new Map<string, () => void>();
  const document = { visibilityState: "visible", addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) };
  const requests: string[] = []; let timerId = 0;
  const loaded = { exports: {} as typeof import("../src/components/dashboard/network/NetworkPanels") };
  runInNewContext(ts.transpileModule(readFileSync("src/components/dashboard/network/NetworkPanels.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module: loaded, exports: loaded.exports, document,
    setTimeout: (fn: () => void, ms: number) => { assert.equal(ms, 2000); timers.set(++timerId, fn); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
    require: (id: string) => {
      if (id === "react") return { useState: (initial: unknown) => [initial === null ? { enabled: true } : initial, () => {}], useCallback: (fn: unknown) => fn, useEffect: (fn: () => void) => effects.push(fn), useRef: (value: unknown) => ({ current: value }) };
      if (id === "@/lib/member-fetch") return { memberFetch: async (path: string) => { requests.push(path); return {}; } };
      if (id === "./ViewerOverview" || id === "../matchmaking/CardView" || id === "next/link") return {};
      if (id === "next-intl") return { useLocale: () => "en" };
      return native(id.startsWith("@/") ? `../src/${id.slice(2)}` : id);
    },
  });
  loaded.exports.VisitRecorder({ profileId: "public-profile" });
  const stop = effects.at(-1)!(); assert.equal(timers.size, 1);
  const early = [...timers.values()][0]!;
  document.visibilityState = "hidden"; listeners.get("visibilitychange")!(); assert.equal(timers.size, 0);
  early(); assert.equal(requests.length, 0, "A timer racing with a hidden tab cannot record a view");
  document.visibilityState = "visible"; listeners.get("visibilitychange")!(); assert.equal(timers.size, 1);
  [...timers.values()][0]!(); assert.deepEqual(requests, ["/api/network/views"]);
  listeners.get("visibilitychange")!(); assert.equal(timers.size, 0, "A mounted card does not keep posting on visibility changes");
  stop?.(); assert.equal(listeners.size, 0);
});
