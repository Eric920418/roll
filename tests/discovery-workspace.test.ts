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
import { discoveryEvidence } from "../src/lib/discovery/policy";
import { emptyInsight } from "../src/lib/customer-insights/schema";

const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
test("Discovery records, analysis and entitlements in isolated PostgreSQL", { skip: !connectionString }, async t => {
  const url = new URL(connectionString!); assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 12 }) });
  const owner = await db.user.create({ data: { email: `journey-${randomUUID()}@example.invalid`, trialPolicy: "interviews-3-v1", trialPlan: "pro", trialStartsAt: new Date(Date.now() - 1000), trialEndsAt: new Date(Date.now() + 14 * 86400000) } });
  const stranger = await db.user.create({ data: { email: `journey-${randomUUID()}@example.invalid` } });
  const journey = await db.discoveryJourney.create({ data: { userId: owner.id } });
  let uid: string | null = owner.id, fullReservation = 0, aiCalls = 0, failure = false, mutateDuringAnalysis = false, refunded = 0;
  let inference: (() => Promise<void>) | null = null;
  class WriteError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const require = createRequire(import.meta.url), cache = new Map<string, unknown>();
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/action-plan/service": { PlanWriteError: WriteError, getActiveActionPlan: async () => null },
    "@/lib/auth/guard": { getUserSession: async () => uid ? { uid } : null }, "@/lib/auth/account": { getCurrentAccount: async () => null },
    "@/lib/security/http": { browserMutationGuard: () => null },
    "@/lib/api": { ok: (data: unknown, status = 200) => Response.json({ data }, { status }), fail: (error: string, status = 400) => Response.json({ error }, { status }), unauthorized: () => Response.json({ error: "Unauthorized" }, { status: 401 }), failFromError: () => Response.json({ error: "Safe error" }, { status: 500 }) },
    "@/lib/customer-insights/service": {}, "@/lib/action-plan/workspace-service": {},
    "@/lib/rate-limit": { DAY_MS: 86400000, checkRateLimit: async () => ({ ok: true }) },
    "@/lib/ai/allowance": { reserveAiUsage: async () => { fullReservation++; return "usage"; }, completeAiUsage: async (_id: string, success: boolean) => { if (!success) refunded++; } },
    "@anthropic-ai/sdk": class { messages = { create: async () => {
      aiCalls++; if (inference) await inference(); if (failure) throw Error("Injected AI timeout");
      const rows = await db.meetingNote.findMany({ where: { userId: owner.id }, orderBy: { createdAt: "asc" } });
      if (mutateDuringAnalysis) await db.discoveryJourney.update({ where: { id: journey.id }, data: { version: { increment: 1 } } });
      return { content: [{ type: "tool_use", name: "submit_interview_evidence", input: { topics: [{ label: "Finding customers", evidence: discoveryEvidence(journey.id, rows).slice(0, 2).map(row => ({ recordId: row.id, quote: "Finding customers is hard" })) }], nextMoves: ["Test a focused outreach offer"] } }] };
    } }; },
  };
  function load<T>(file: string): T { const absolute = resolve(file); if (cache.has(absolute)) return cache.get(absolute) as T; const loaded = { exports: {} }; cache.set(absolute, loaded.exports); runInNewContext(ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, Date, Error, console, process, URL, Set, Buffer, Response, Headers, setTimeout, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(resolve(dirname(absolute), `${id}.ts`)) : require(id) }); cache.set(absolute, loaded.exports); return loaded.exports as T; }
  const gate = load<typeof import("../src/lib/billing/gate")>("src/lib/billing/gate.ts");
  mocks["@/lib/billing/gate"] = { ...gate, requirePlan: async () => { const user = uid && await db.user.findUnique({ where: { id: uid } }); return user && gate.getEffectivePlan({ ...user, plan: "free", trialPlan: "pro" }) !== "free" ? user : null; } };
  const records = load<typeof import("../src/app/api/customer-insights/route")>("src/app/api/customer-insights/route.ts");
  const service = load<typeof import("../src/lib/discovery/service")>("src/lib/discovery/service.ts");
  const analysis = load<typeof import("../src/lib/discovery/analysis")>("src/lib/discovery/analysis.ts");
  const req = (body: unknown) => ({ json: async () => body }) as never;
  const insight = (company: string) => ({ ...emptyInsight("discover"), journeyId: journey.id, name: "Founder", company, notes: "Finding customers is hard" });
  const save = (company: string, requestId = randomUUID()) => records.POST(req({ requestId, insight: insight(company) }));
  const account = async () => ({ ...await db.user.findUniqueOrThrow({ where: { id: owner.id } }), profile: {} }) as never;
  try {
    await t.test("A new trial has no Pro API access even when beta is enabled; legacy trials remain intact", () => {
      const base = { ...owner, betaAccess: true, plan: "free" as const, trialPlan: "pro" as const };
      assert.equal(gate.getEffectivePlan(base), "free"); assert.equal(gate.getEffectivePlan({ ...base, trialPolicy: null, betaAccess: false }), "pro"); assert.equal(gate.getEffectivePlan({ ...base, trialPolicy: null }), "enterprise");
    });
    await t.test("Owned writes validate inputs, deduplicate request IDs and normalized company names", async () => {
      uid = null; assert.equal((await save("Acme")).status, 401); uid = stranger.id; assert.equal((await save("Acme")).status, 404); uid = owner.id;
      assert.equal((await save("")).status, 400); const requestId = randomUUID();
      const responses = await Promise.all([save("Acme", requestId), save("Acme", requestId), save("ＡＣＭＥ")]); assert(responses.every(r => r.status === 201));
      assert.equal((await service.getDiscoverySnapshot(owner.id)).total, 1); assert.equal(await db.meetingNote.count({ where: { userId: owner.id } }), 2);
    });
    await t.test("Parallel new interviews stop at three; editing duplicates cannot bypass the limit", async () => {
      const responses = await Promise.all([save("Beta"), save("Gamma"), save("Delta"), save("Epsilon")]); assert.equal(responses.filter(r => r.status === 201).length, 2); assert.equal(responses.filter(r => r.status === 402).length, 2);
      const duplicate = await db.meetingNote.findFirstOrThrow({ where: { userId: owner.id, insight: { path: ["company"], equals: "ＡＣＭＥ" } } });
      assert.equal((await records.PATCH(req({ id: duplicate.id, updatedAt: duplicate.updatedAt.toISOString(), insight: insight("Fourth company") }))).status, 402);
      assert.equal((await service.getDiscoverySnapshot(owner.id)).total, 3);
      assert.equal((await records.POST(req({ requestId: randomUUID(), insight: { ...insight("Bypass"), journeyId: undefined } }))).status, 403);
    });
    await t.test("Three-company preview uses actual quotes, caches retries and never spends paid AI credit", async () => {
      const snapshot = await analysis.analyseDiscovery(await account(), false, "en"); assert.equal(snapshot.total, 3); assert(snapshot.preview); assert.equal(fullReservation, 0); const before = aiCalls;
      await analysis.analyseDiscovery(await account(), false, "en"); assert.equal(aiCalls, before);
      await assert.rejects(analysis.analyseDiscovery(await account(), true, "en"), error => (error as WriteError).status === 402);
    });
    await t.test("A saved edit invalidates the analysis; stale tabs and foreign writes are rejected", async () => {
      const row = await db.meetingNote.findFirstOrThrow({ where: { userId: owner.id } });
      const payload = { id: row.id, updatedAt: row.updatedAt.toISOString(), insight: { ...row.insight as object, challenge: "focus" } };
      assert.equal((await records.PATCH(req(payload))).status, 200); assert.equal((await service.getDiscoverySnapshot(owner.id)).preview, null);
      assert.equal((await records.PATCH(req(payload))).status, 409);
      uid = stranger.id; assert.equal((await records.PATCH(req(payload))).status, 404); uid = owner.id;
    });
    await t.test("Expiry prevents edits but retains evidence; paid access continues the same journey to ten", async () => {
      await db.user.update({ where: { id: owner.id }, data: { trialEndsAt: new Date(0) } }); assert.equal((await save("After expiry")).status, 402);
      await db.user.update({ where: { id: owner.id }, data: { founderStartedAt: new Date(Date.now() - 1000), founderEndsAt: new Date(Date.now() + 365 * 86400000) } });
      for (let n = 4; n <= 10; n++) assert.equal((await save(`Paid company ${n}`)).status, 201);
      assert.equal((await service.getDiscoverySnapshot(owner.id)).total, 10); assert.equal((await save("Eleventh")).status, 409);
    });
    await t.test("Failed or stale full analysis refunds its reservation; a concurrent request cannot start another", async () => {
      failure = true; await assert.rejects(analysis.analyseDiscovery(await account(), true, "en")); failure = false; assert.equal(refunded, 1);
      mutateDuringAnalysis = true; await assert.rejects(analysis.analyseDiscovery(await account(), true, "en"), error => (error as WriteError).status === 409); mutateDuringAnalysis = false; assert.equal(refunded, 2);
      let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; }); inference = () => wait;
      const first = analysis.analyseDiscovery(await account(), true, "en");
      for (let n = 0; n < 100 && !(await db.discoveryJourney.findUniqueOrThrow({ where: { id: journey.id } })).analysisToken; n++) await new Promise(resolve => setTimeout(resolve, 5));
      await assert.rejects(analysis.analyseDiscovery(await account(), true, "en"), error => (error as WriteError).status === 409); release(); await first; inference = null;
      assert((await service.getDiscoverySnapshot(owner.id)).report); assert.equal(fullReservation, 3);
      await db.user.update({ where: { id: owner.id }, data: { founderEndsAt: new Date(0) } }); assert.equal((await service.getDiscoverySnapshot(owner.id)).report, null);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [owner.id, stranger.id] } } }); await db.$disconnect(); }
});
