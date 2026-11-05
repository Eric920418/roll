import { personalizedActions } from "../src/lib/action-plan/personalization";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { generateBodySchema } from "../src/lib/action-plan/schemas";

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const require = createRequire(import.meta.url), loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  runInNewContext(source, { module: loaded, exports: loaded.exports, process: { env: {} }, console, Date, Error, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  return loaded.exports as T;
}
const diagnosis = { companyStage: "MVP", stageReason: "Working MVP", stageConfidence: 80, bottleneckGroup: "Sales", bottleneckCode: "no_leads", bottleneckReason: "No paying customers", bottleneckConfidence: 80 };
const body = { locale: "en", requestId: "11111111-1111-4111-8111-111111111111", candidateCount: 5, diagnosis, answers: [{ question: "Bottleneck?", answer: "Customers" }, { question: "Progress?", answer: "Working MVP" }, { question: "Goal?", answer: "Five pilots" }] };
class WriteError extends Error { constructor(message: string, public status = 409) { super(message); } }
function routeHarness() {
  const state = { uid: "owner" as string | null, allowed: true, successes: 0, attempts: 0, aiCalls: 0, replay: null as unknown, aiError: null as Error | null, writeError: null as Error | null, base: { id: "original", revision: 7 }, saved: [] as unknown[], reads: [] as Array<[string, string]> };
  const response = (data: unknown, status = 200) => Response.json(data, { status });
  const route = load<{ POST(request: unknown): Promise<Response>; GET(request: unknown): Promise<Response> }>("src/app/api/action-plans/generate/route.ts", {
    "@/lib/api": { ok: (data: unknown, status: number) => response({ data }, status), fail: (error: string, status = 400) => response({ error }, status), unauthorized: () => response({ error: "Unauthorized" }, 401), failFromError: () => response({ error: "Safe server error" }, 500) },
    "@/lib/auth/guard": { getUserSession: async () => state.uid ? { uid: state.uid } : null },
    "@/lib/billing/gate": { requirePlan: async () => state.allowed ? { profile: {} } : null },
    "@/lib/auth/account": { getCurrentAccount: async () => null },
    "@/lib/discovery/policy": { DISCOVERY_POLICY: "interviews-3-v1", discoveryTrialActive: () => false },
    "@/lib/discovery/setup": { confirmDiscoverySetup: () => { throw Error("Paid generation must not confirm trial setup"); }, discoverySetupResult: () => { throw Error("Paid recovery must not read trial setup"); } },
    "@/lib/rate-limit": { DAY_MS: 86400000, checkRateLimit: async (_key: string, limit: number) => ({ ok: ++state.attempts <= limit }) },
    "@/lib/quiz/result": { getLatestQuizResult: async () => null },
    "@/lib/action-plan/schemas": { generateBodySchema },
    "@/lib/action-plan/ai": { generateActionCandidates: async () => { state.aiCalls++; if (state.aiError) throw state.aiError; return Array(5).fill({}); } },
    "@/lib/action-plan/service": { PlanWriteError: WriteError, getPlanByRequestId: async (uid: string, requestId: string) => { state.reads.push([uid, requestId]); return state.replay; }, getActiveActionPlan: async () => state.base, assertGenerationAllowance: async () => { if (state.successes >= 3) throw new WriteError("3 successful plans", 429); }, persistGeneratedPlan: async (input: unknown) => { if (state.writeError) throw state.writeError; state.saved.push(input); state.successes++; return { id: "new" }; } },
  });
  return { state, post: (input: unknown = body) => route.POST({ url: "https://example.test/api/test", headers: new Headers({ Origin: "https://example.test", "Content-Type": "application/json" }), json: async () => input }), get: (requestId = body.requestId) => route.GET({ nextUrl: { searchParams: new URLSearchParams({ requestId }) } }) };
}

test("Generation denies anonymous, insufficient-plan and invalid requests before AI or allowance", async () => {
  const { state, post } = routeHarness(); state.uid = null; assert.equal((await post()).status, 401);
  state.uid = "owner"; state.allowed = false; assert.equal((await post()).status, 403);
  state.allowed = true;
  for (const answers of [[], body.answers.slice(0, 1), body.answers.slice(0, 2), [...body.answers, body.answers[0]]]) assert.equal((await post({ ...body, answers })).status, 400);
  assert.equal(state.attempts, 0); assert.equal(state.aiCalls, 0); assert.equal(state.saved.length, 0);
});
test("Failed catalog writes do not consume successful-plan allowance; retry retains the base revision", async () => {
  const { state, post } = routeHarness(); state.writeError = new WriteError("Invalid catalog write", 422);
  for (let i = 0; i < 3; i++) assert.equal((await post()).status, 422);
  assert.equal(state.successes, 0); assert.equal(state.saved.length, 0);
  state.writeError = null; assert.equal((await post()).status, 201);
  assert.deepEqual(JSON.parse(JSON.stringify(state.saved[0])).basePlan, { id: "original", revision: 7 });
  assert.equal(state.successes, 1);
});
test("Successful replay bypasses full allowance and does not call AI; pending conflicts and timeouts preserve plans", async () => {
  const { state, post } = routeHarness(); state.successes = 3; assert.equal((await post()).status, 429); assert.equal(state.aiCalls, 0);
  state.replay = { id: "original-result" }; const replay = await post(); assert.equal(replay.status, 200); assert.equal((await replay.json()).data.id, "original-result"); assert.equal(state.aiCalls, 0);
  state.replay = null; state.successes = 0; state.writeError = new Error("Request timed out: secret internal endpoint"); const timeout = await post(); assert.equal(timeout.status, 504); assert.doesNotMatch(JSON.stringify(await timeout.json()), /secret internal/);
  state.writeError = new WriteError("Plan changed; reload"); assert.equal((await post()).status, 409); assert.equal(state.saved.length, 0); assert.equal(state.successes, 0);
});
test("Attempt protection remains bounded independently of successful plans", async () => {
  const { state, post } = routeHarness(); state.attempts = 10; assert.equal((await post()).status, 429); assert.equal(state.aiCalls, 0);
});

function serviceHarness() {
  let active: Record<string, unknown> | null = { id: "base", revision: 2, userId: "owner", activeKey: "owner", archivedAt: null };
  let existing: Record<string, unknown> | null = null, count = 0;
  const writes: Array<Record<string, unknown>> = [];
  const plan = {
    findUnique: async () => existing,
    findFirst: async () => active,
    count: async ({ where }: { where: { userId: string; OR: unknown[]; createdAt: { gte: Date } } }) => { assert.equal(where.userId, "owner"); assert.equal(where.OR.length, 2); assert(Date.now() - where.createdAt.gte.getTime() >= 86399900); return count; },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (!active || active.activeKey !== "owner" || (where.id && active.id !== where.id) || (where.revision !== undefined && active.revision !== where.revision)) return { count: 0 };
      active = { ...active, ...(data.revision ? { revision: Number(active.revision) + 1 } : {}), ...(data.activeKey === null ? { activeKey: null, archivedAt: data.archivedAt } : {}) };
      return { count: 1 };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); existing = { ...data, id: "new", revision: 0, createdAt: new Date(), milestones: [], actions: [] }; active = existing; return existing; },
  };
  const db = { actionPlan: plan, actionDependency: { createMany: async () => {} }, $transaction: async (fn: (tx: unknown) => Promise<unknown>) => { const before = active; try { return await fn(db); } catch (e) { active = before; throw e; } } };
  const service = load<typeof import("../src/lib/action-plan/service")>("src/lib/action-plan/service.ts", {
    "./schemas": { generateBodySchema }, "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/rate-limit": { DAY_MS: 86400000 },
    "@/lib/roadmap/schema": { milestoneViews: () => [] },
    "./ranking": { rankActions: () => [], humanizeActionText: (s: string) => s, taskReference: () => "", wouldCreateCycle: () => false }, "./time": { legacyHoursForMinutes: () => ({ minHours: 1, maxHours: 2 }) },
  });
  // Persistence uses generated fields only; schema/AI validation is tested separately.
  const task = { title: "A valid task title", clientKey: "task_1", dependsOnKeys: [], actionTime: {}, stageFit: {}, bottleneckFit: {}, outcomeTime: {} };
  const input = { userId: "owner", locale: "en", requestId: body.requestId, diagnosis, answers: body.answers, actions: Array.from({ length: 5 }, (_, i) => ({ ...task, clientKey: `task_${i + 1}` })), basePlan: { id: "base", revision: 2 } } as unknown as Parameters<typeof service.persistGeneratedPlan>[0];
  return { service, input, writes, active: () => active, update: (next: Record<string, unknown> | null) => { active = next; }, count: (n: number) => { count = n; } };
}
test("Persistence refuses stale revision, replaced plan and concurrent first-plan creation without archiving anything", async () => {
  for (const changed of [{ id: "base", revision: 3 }, { id: "other", revision: 2 }]) {
    const h = serviceHarness(); h.update({ ...changed, userId: "owner", activeKey: "owner", archivedAt: null });
    await assert.rejects(h.service.persistGeneratedPlan(h.input), /計畫已更新或封存/); assert.equal(h.writes.length, 0); assert.equal(h.active()?.activeKey, "owner");
  }
  const h = serviceHarness(); await assert.rejects(h.service.persistGeneratedPlan({ ...h.input, basePlan: null }), /生成期間計畫已更新/); assert.equal(h.writes.length, 0);
});
test("Persistence checks allowance inside the transaction and successful replay never replaces a newer plan", async () => {
  const h = serviceHarness(); h.count(3); await assert.rejects(h.service.persistGeneratedPlan(h.input), /3 次成功/); assert.equal(h.writes.length, 0); assert.equal(h.active()?.revision, 2);
  h.count(0); await h.service.persistGeneratedPlan(h.input); assert.equal(h.writes.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].diagnosticAnswers)), body.answers); assert.equal((h.writes[0].actions as { create: unknown[] }).create.length, 5);
  h.update({ id: "later", revision: 1, activeKey: "owner" }); await h.service.persistGeneratedPlan(h.input); assert.equal(h.writes.length, 1); assert.equal(h.active()?.id, "later");
});


test("Generation recovery reads only the signed-in owner and never invokes AI, allowance or persistence", async () => {
  const { state, get } = routeHarness(); state.uid = null; assert.equal((await get()).status, 401);
  state.uid = "other-account"; state.allowed = false; assert.equal((await get()).status, 403);
  state.allowed = true; assert.equal((await get("invalid")).status, 400);
  const pending = await get(); assert.equal(pending.status, 200); assert.equal((await pending.json()).data.planId, null);
  assert.deepEqual(state.reads, [["other-account", body.requestId]]);
  state.replay = { id: "owned-result" }; assert.equal((await (await get()).json()).data.planId, "owned-result");
  assert.equal(state.aiCalls, 0); assert.equal(state.attempts, 0); assert.equal(state.successes, 0); assert.equal(state.saved.length, 0);
});

test("Five-choice generation builds tasks without another AI call, retains opening answers, and leaves plan checks in place", async () => {
  const { state, post } = routeHarness();
  const personalization = { payingCustomers: "6-20", interviews: "6-15", channel: "events", weeklyTime: "under3", goal: "fundraising" } as const;
  const response = await post({ ...body, personalization }); assert.equal(response.status, 201);
  assert.equal(state.aiCalls, 0);
  const saved = state.saved[0] as { personalization: unknown; answers: unknown; actions: unknown[] };
  assert.deepEqual(saved.personalization, personalization); assert.deepEqual(saved.answers, body.answers);
  assert.equal(saved.actions.length, 16);
  state.allowed = false; assert.equal((await post({ ...body, personalization })).status, 403);
  const store = serviceHarness();
  await store.service.persistGeneratedPlan({ ...store.input, personalization: { ...personalization, payingCustomers: "none", interviews: "none" }, actions: personalizedActions({ ...personalization, payingCustomers: "none", interviews: "none" }, "en", body.diagnosis as never) });
  const record = store.writes[0] as { personalization: unknown; diagnosticAnswers: unknown; actions: { create: Array<{ recordingMode?: string; metricTarget?: number; metricCurrent?: number }> } };
  assert.deepEqual(record.diagnosticAnswers, body.answers);
  assert.equal(record.actions.create[0]?.recordingMode, "interview"); assert.equal(record.actions.create[0]?.metricTarget, 3); assert.equal(record.actions.create[0]?.metricCurrent, 0);
  assert(record.actions.create.slice(1).every(a => a.recordingMode === undefined));
});
