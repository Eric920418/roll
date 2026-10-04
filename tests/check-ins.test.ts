import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { executionSequence, rankActions, humanizeActionText, taskReference, type RankableAction } from "../src/lib/action-plan/ranking";
import { taipeiWeek, weeklySummary, taskSnapshot, validateWeeklyOutput, checkInRequestSchema } from "../src/lib/check-ins/schema";
import { validateCorrection, correctionSchema } from "../src/lib/roadmap/corrections";
import { actionPatchSchema } from "../src/lib/action-plan/schemas";
import type { ActionPlanDto } from "../src/lib/action-plan/service";
const require = createRequire(import.meta.url);
function row(id: string, stage = "m1", dependencies: string[] = [], done = false): RankableAction {
  return { id, clientKey: `task_${id.slice(1)}`, milestoneId: stage, title: `Task ${id}`, impact: "High", urgencyType: "urgent", urgencyDays: null, dependencyLevel: dependencies.length ? 1 : 0, dependencyNotes: null, difficulty: 2, actionTimeMinHours: 1, actionTimeMaxHours: 1, actionTimeMinMinutes: 30, actionTimeMaxMinutes: 60, companyStage: "MVP", stageFit: 4, stageFitReason: "Fits stage", stageFitConfidence: null, bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckFit: 4, bottleneckFitReason: "Resolve no_icp bottleneck", bottleneckFitConfidence: null, outcomeCategory: "customers", expectedOutcome: "10 interviews with customer profile", outcomeTimeMinDays: 1, outcomeTimeMaxDays: 7, done, source: "nova", stageFitEditedByUser: false, bottleneckFitEditedByUser: false, createdAt: new Date("2026-10-03"), dependencies: dependencies.map(id => ({ dependsOn: { id, clientKey: `task_${id.slice(1)}`, title: `Task ${id}`, done: false } })) };
}
function plan(rows = [row("t1"), row("t2", "m1", ["t1"]), row("t3", "m1"), row("t4", "m2")]): ActionPlanDto {
  const actions = rankActions(rows, new Map([["m2", "Confirm previous outcome"]]), new Map([["m1", 0], ["m2", 1]]));
  return { id: "p1", revision: 0, locale: "en", createdAt: "2026-10-03", diagnosis: { companyStage: "MVP", stageReason: "User has MVP", stageConfidence: 60, bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckReason: "Unclear ICP", bottleneckConfidence: 60 }, actions, nextMoves: actions.filter(a => a.rank && a.rank <= 3), blockers: [], roadmap: { goal: "Find customers", startsAt: "2026-10-03", deadline: "2027-04-03", assumptions: [], milestones: [{ id: "m1", position: 0, title: "Interview ICP", expectedOutcome: "Clear segment", acceptanceCriteria: "Ten completed interviews", targetDate: "2026-11-03", achievedAt: null, outcomeNote: null, total: 3, done: 0, status: "active" }] } };
}
test("execution sequence is stable, dependency first, independent of priority and completion", () => {
  const rows = [row("t5", "m1", ["t2"]), row("t2", "m1", ["t1"]), row("t1"), row("t3")];
  rows[0].impact = "Critical";
  const before = rankActions(rows).map(a => [a.id, a.displayNumber]);
  assert.deepEqual(before, [["t1", 1], ["t2", 2], ["t3", 3], ["t5", 4]]);
  rows[2].done = true; rows[1].dependencies[0].dependsOn.done = true;
  assert.deepEqual(rankActions([...rows].reverse()).map(a => [a.id, a.displayNumber]), before);
  assert.deepEqual(rankActions(rows).filter(a => a.rank).map(a => a.id), ["t2", "t3"]);
  assert.equal(executionSequence(rows).length, 4);
});
test("each milestone restarts numbering and dependency references use the same mapping", () => {
  const rows = [row("t8", "m2", ["t2"]), row("t2", "m1"), row("t3", "m1", ["t2"])];
  const output = rankActions(rows, new Map([["m2", "Outcome"]]), new Map([["m1", 0], ["m2", 1]]));
  assert.deepEqual(output.map(a => a.displayNumber), [1, 2, 1]);
  assert.equal(taskReference(output[2].dependency.actionRefs[0]), "Milestone 1 · #1 · Task t2");
  assert.equal(output[2].rank, null);
  assert.equal(taskReference(output[1].dependency.actionRefs[0]), "#1 · Task t2");
});
test("known implementation codes never appear in human prose", () => {
  assert.equal(humanizeActionText("Fix no_icp bottleneck and icpDetails"), "Fix Unclear ICP bottleneck and customer profile");
  assert.equal(humanizeActionText("no_icp_extra"), "no_icp_extra");
  assert.equal(rankActions([row("t1")])[0].bottleneck.code, "no_icp");
});
test("Taipei Monday–Sunday week boundary is independent of server timezone", () => {
  assert.equal(taipeiWeek(new Date("2026-10-04T15:59:59Z")), "2026-09-28");
  assert.equal(taipeiWeek(new Date("2026-10-04T16:00:00Z")), "2026-10-05");
  assert.equal(taipeiWeek(new Date("2026-12-31T23:59:59Z")), "2026-12-28");
});
test("snapshot records facts, not inferred zeros or unverified weekly completions", () => {
  const p = plan([row("t1", "m1", [], true), { ...row("t2"), metricTarget: 10, metricUnit: "interviews", metricCurrent: 4 }]);
  const snapshot = taskSnapshot(p), summary = weeklySummary(snapshot, "2026-09-28", "Buyers care about trust", "No replies");
  assert.match(summary, /4\/10 interviews/); assert.match(summary, /Confirmed complete this week: 0/);
  assert.equal(snapshot[0].completedAt, null);
  p.actions[1].metric!.current = null; assert.match(weeklySummary(taskSnapshot(p), "2026-09-28", "", ""), /Not reported\/10/);
  p.actions[0].completedAt = "2026-10-03T00:00:00Z"; assert.match(weeklySummary(taskSnapshot(p), "2026-09-28", "", ""), /Confirmed complete this week: 1/);
});
test("weekly recommendations reject completed, blocked, later or imaginary task IDs", () => {
  const p = plan(), base = { nextActionIds: ["t3", "t1"], rationale: "Interview first", investorDraft: "Private proposed update", metricSuggestions: [] };
  assert.equal(validateWeeklyOutput(base, p), base);
  for (const id of ["missing", "t2", "t4"]) assert.throws(() => validateWeeklyOutput({ ...base, nextActionIds: [id] }, p));
  assert.throws(() => validateWeeklyOutput({ ...base, metricSuggestions: [{ actionId: "t4", target: 3, unit: "pilots" }] }, p));
  assert.throws(() => validateWeeklyOutput({ ...base, nextActionIds: [] }, p));
  const empty = plan([]); assert.doesNotThrow(() => validateWeeklyOutput({ ...base, nextActionIds: [] }, empty));
});
test("metrics are a separate strict mutation and quantity alone never means done", () => {
  assert(actionPatchSchema.safeParse({ metricTarget: 10, metricUnit: "interviews", metricCurrent: 4 }).success);
  assert(!actionPatchSchema.safeParse({ metricTarget: null, metricUnit: null, metricCurrent: 4 }).success);
  assert(!actionPatchSchema.safeParse({ metricTarget: 10, metricUnit: "interviews", metricCurrent: -1 }).success);
  assert(!actionPatchSchema.safeParse({ done: true, title: "Truncated edit" }).success);
});
test("stage corrections cannot affect completed/later tasks and validate entire proposed graph", () => {
  const p = plan(), draft = { kind: "stage-correction" as const, milestoneId: "m1", changes: [{ actionId: "t2", title: "Define ICP positioning", expectedOutcome: "One validated hypothesis", whyNow: "Reflect actual interviews", reason: "Reserve paid pilot for next stage", dependencyActionIds: ["t1"] }] };
  assert.equal(validateCorrection(draft, p), draft);
  for (const id of ["missing", "t4"]) assert.throws(() => validateCorrection({ ...draft, changes: [{ ...draft.changes[0], actionId: id }] }, p));
  for (const id of ["t2", "t4", "missing"]) assert.throws(() => validateCorrection({ ...draft, changes: [{ ...draft.changes[0], dependencyActionIds: [id] }] }, p));
  assert.throws(() => validateCorrection({ ...draft, changes: [...draft.changes, { ...draft.changes[0], actionId: "t1", title: "Create interview guide", dependencyActionIds: ["t2"] }] }, p), /cycle/);
  p.actions[1].done = true; assert.throws(() => validateCorrection(draft, p));
  assert(correctionSchema.safeParse({ ...draft, changes: [] }).success);
});
function load<T>(path: string, mocks: Record<string, unknown>) {
  const mod = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, require: (id: string) => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id), process: { env: {} }, Date, Set, Map, Error, console: { error() {}, warn() {} } });
  return mod.exports as T;
}
test("weekly AI gets one format repair; missing known quantities are never manufactured by fallback", async () => {
  let calls = 0; const contexts: string[] = [];
  class Client { messages = { create: async (input: { messages: Array<{ content: string }> }) => { calls++; contexts.push(input.messages[0].content); return { content: [{ type: "tool_use", input: { nextActionIds: ["missing"] } }] }; } }; }
  const ai = load<typeof import("../src/lib/check-ins/ai")>("src/lib/check-ins/ai.ts", { "@anthropic-ai/sdk": { default: Client }, "./schema": require("../src/lib/check-ins/schema") });
  await assert.rejects(ai.generateWeekly({ profile: {} } as never, plan(), { finding: "Unknown", blockers: "No customer evidence", summary: "Not reported", snapshot: [] }, "en"), /Invalid AI draft/);
  assert.equal(calls, 2); assert(contexts.every(s => s.includes("No customer evidence")));
});
test("new weekly endpoint rejects anonymous and non-Pro access before parsing", async () => {
  let session: unknown = null;
  const route = load<typeof import("../src/app/api/action-plans/check-ins/route")>("src/app/api/action-plans/check-ins/route.ts", { "@/lib/api": { unauthorized: () => ({ status: 401 }), fail: (_m: string, status: number) => ({ status }) }, "@/lib/auth/guard": { getUserSession: async () => session }, "@/lib/billing/gate": { requirePlan: async () => null }, "@/lib/roadmap/http": { roadmapFailure: () => ({ status: 500 }) }, "@/lib/check-ins/schema": require("../src/lib/check-ins/schema"), "@/lib/check-ins/service": {} });
  assert.equal((await route.POST({} as never)).status, 401); session = { uid: "owner" }; assert.equal((await route.POST({} as never)).status, 403);
  assert.equal(checkInRequestSchema.safeParse({ action: "save", planId: "p1" }).success, false);
});

function weeklyHarness() {
  const active = plan();
  const state: Record<string, unknown> = { id: "weekly-1", userId: "owner", actionPlanId: active.id, weekStart: new Date(`${taipeiWeek()}T00:00:00Z`), finding: "Actual finding", blockers: "Unknown revenue", snapshot: [], summary: "Saved facts", basePlanRevision: 0, revision: 1, pendingRequestId: null, pendingSince: null, lastRequestId: null, usageId: null, recommendations: null, investorDraft: null };
  let model: () => Promise<unknown> = async () => ({ nextActionIds: ["t1"], rationale: "Interview first", investorDraft: "Private reviewed facts", metricSuggestions: [] }), quota = true, calls = 0;
  const billed: boolean[] = [];
  const weekly = { findMany: async (arg: { where: { pendingSince?: unknown } }) => arg.where.pendingSince ? [] : [state], findFirst: async (arg: { where: { userId: string } }) => arg.where.userId === "owner" ? { ...state, actionPlan: { archivedAt: null } } : null, updateMany: async (arg: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    for (const [key, value] of Object.entries(arg.where)) if (state[key] !== value) return { count: 0 };
    for (const [key, value] of Object.entries(arg.data)) state[key] = value && typeof value === "object" && "increment" in value ? Number(state[key]) + Number(value.increment) : value;
    return { count: 1 };
  } };
  const actionPlan = { findFirst: async () => ({ id: active.id, archivedAt: null }), updateMany: async (arg: { where: { revision: number } }) => ({ count: active.revision === arg.where.revision ? 1 : 0 }) };
  const tx = { actionPlan, weeklyCheckIn: weekly };
  const api = load<typeof import("../src/lib/check-ins/service")>("src/lib/check-ins/service.ts", {
    "@/lib/prisma": { prisma: { ...tx, $transaction: async (work: (value: typeof tx) => unknown) => work(tx) } },
    "@/lib/action-plan/service": { PlanWriteError: class extends Error { constructor(message: string, public status = 409) { super(message); } }, getActiveActionPlan: async () => active },
    "@/lib/ai/allowance": { reserveAiUsage: async () => quota ? "usage-1" : null, completeAiUsage: async (_id: string, success: boolean) => billed.push(success) },
    "@/lib/rate-limit": { DAY_MS: 86400000, checkRateLimit: async () => ({ ok: true }) },
    "./schema": require("../src/lib/check-ins/schema"), "./ai": { generateWeekly: async () => { calls++; return model(); } },
  });
  return { api, state, active, billed, get calls() { return calls; }, set model(value: () => Promise<unknown>) { model = value; }, set quota(value: boolean) { quota = value; } };
}
const weeklyRequest = { action: "generate" as const, id: "weekly-1", revision: 1, planRevision: 0, requestId: "3efcf291-5f45-49a7-aabb-4168cfcb5655", locale: "en" as const };
const owner = { id: "owner" } as Parameters<typeof import("../src/lib/check-ins/service").generateCheckIn>[0];
test("weekly success replay never regenerates or bills twice; another account cannot read drafts", async () => {
  const h = weeklyHarness(); await h.api.generateCheckIn(owner, weeklyRequest); await h.api.generateCheckIn(owner, weeklyRequest);
  assert.equal(h.calls, 1); assert.deepEqual(h.billed, [true]);
  await assert.rejects(h.api.generateCheckIn({ ...owner, id: "other" }, weeklyRequest), /not found/);
});
test("weekly invalid AI and timeout preserve saved facts, clear pending state and refund", async () => {
  for (const message of ["Malformed draft", "Request timed out"]) {
    const h = weeklyHarness(); h.model = async () => { throw Error(message); };
    await assert.rejects(h.api.generateCheckIn(owner, weeklyRequest), /saved/);
    assert.equal(h.state.finding, "Actual finding"); assert.equal(h.state.summary, "Saved facts"); assert.equal(h.state.pendingRequestId, null); assert.equal(h.state.recommendations, null); assert.deepEqual(h.billed, [false]);
  }
});
test("weekly quota exhaustion retains the report without calling AI", async () => {
  const h = weeklyHarness(); h.quota = false;
  await assert.rejects(h.api.generateCheckIn(owner, weeklyRequest), /allowance exhausted/);
  assert.equal(h.calls, 0); assert.deepEqual(h.billed, []); assert.equal(h.state.finding, "Actual finding"); assert.equal(h.state.pendingRequestId, null);
});
test("weekly simultaneous generation locks; changed plans reject late AI without altering the report", async () => {
  const h = weeklyHarness(); let release: (value: unknown) => void = () => {};
  h.model = () => new Promise(resolve => { release = resolve; });
  const pending = h.api.generateCheckIn(owner, weeklyRequest);
  for (let i = 0; i < 20 && !h.calls; i++) await Promise.resolve();
  await assert.rejects(h.api.generateCheckIn(owner, weeklyRequest), /changed/);
  h.active.revision = 1; release({ nextActionIds: ["t1"], rationale: "Old proposal", investorDraft: "Old private draft", metricSuggestions: [] });
  await assert.rejects(pending, /changed/); assert.equal(h.state.recommendations, null); assert.equal(h.state.finding, "Actual finding"); assert.deepEqual(h.billed, [false]);
});

test("weekly quantity edits cannot invalidate completed quantity-dependent tasks", async () => {
  let writes = 0;
  const rawPlan = { id: "p1", actions: [
    { id: "t1", metricCurrent: 5, metricUnit: "interviews", milestoneId: "m1", done: false, dependencies: [] },
    { id: "t2", done: true, dependencies: [{ minimumCurrent: 5, dependsOn: { id: "t1", metricCurrent: 5 } }] },
  ] };
  const tx = { weeklyCheckIn: { findUnique: async () => null }, actionPlan: { findUniqueOrThrow: async () => rawPlan }, actionItem: { update: async () => { writes++; } } };
  const api = load<typeof import("../src/lib/check-ins/service")>("src/lib/check-ins/service.ts", {
    "@/lib/prisma": { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } },
    "@/lib/action-plan/service": { PlanWriteError: class extends Error { status = 409; }, lockActivePlan: async () => {}, guardActionMilestone: async () => {} },
    "@/lib/ai/allowance": {}, "@/lib/rate-limit": {}, "./schema": require("../src/lib/check-ins/schema"), "./ai": {},
  });
  await assert.rejects(api.saveCheckIn("owner", { action: "save", requestId: "e7e8a3fe-0d86-49be-b731-25b52bd9e3f9", planId: "p1", planRevision: 0, revision: 0, weekStart: taipeiWeek(), finding: "Actual finding", blockers: "", metrics: [{ actionId: "t1", current: 4 }] }), /Undo completed dependent tasks/);
  assert.equal(writes, 0);
});
test("quantity unlocks are shared by ranking but never bypass a locked milestone", () => {
  const first = { ...row("t1"), metricTarget: 10, metricCurrent: 5, metricUnit: "interviews" };
  const next = row("t2", "m1", ["t1"]);
  next.dependencies[0] = { ...next.dependencies[0], minimumCurrent: 5, dependsOn: { ...next.dependencies[0].dependsOn, metricCurrent: 5 } };
  const ranked = rankActions([first, next]);
  assert.equal(ranked[1].dependency.blocked, false); assert.equal(ranked[1].dependency.actionRefs[0].resolved, true);
  assert.equal(first.done, false);
  next.milestoneId = "m2";
  assert.equal(rankActions([first, next], new Map([["m2", "Confirm previous outcome"]]))[1].dependency.blocked, true);
  assert.equal(actionPatchSchema.safeParse({ dependencyThresholds: { t1: 0 } }).success, false);
  assert.equal(actionPatchSchema.safeParse({ dependencyThresholds: { t1: 1.5 } }).success, false);
});
