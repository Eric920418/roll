import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { missingGuideFields, gettingStartedState } from "../src/lib/getting-started/state";
import { newBuilderDraft, readBuilderDraft, builderStorageKey, draftChanged, DIAGNOSTIC_QUESTIONS } from "../src/lib/action-plan/builder-draft";
import type { ActionPlanDto } from "../src/lib/action-plan/service";
const profile = { companyName: "QA", oneLinePitch: "Understand customers", companyStage: "MVP", primaryNeed: "paying-customers" };
const base = { profile, plan: null, canGenerate: true, dismissedAt: null, completedAt: null, previouslyDone: false };
const plan = { id: "plan", actions: [], nextMoves: [], blockers: [], roadmap: null } as unknown as ActionPlanDto;
test("Guide uses actual basic fields; unknown and invalid stages are not complete", () => {
  assert.deepEqual(missingGuideFields(null), ["companyName", "oneLinePitch", "companyStage", "primaryNeed"]);
  assert.deepEqual(missingGuideFields(profile), []);
  assert.deepEqual(missingGuideFields({ ...profile, companyName: "  ", companyStage: "Made up", primaryNeed: "paying_customers" }), ["companyName", "companyStage", "primaryNeed"]);
  assert.equal(gettingStartedState({ ...base, profile: null }).currentStep, 1);
  assert.equal(gettingStartedState(base).currentStep, 2);
});
test("Existing plan advances to real work without requiring profile or ICP to be repeated", () => {
  const ready = { id: "real", title: "Interview", displayNumber: 2, done: false, dependency: { blocked: false } };
  const view = gettingStartedState({ ...base, profile: null, plan: { ...plan, nextMoves: [ready] } as ActionPlanDto });
  assert.equal(view.currentStep, 3); assert.equal(view.nextTask?.id, "real"); assert.equal(view.nextTask?.displayNumber, 2);
  assert.equal(gettingStartedState({ ...base, plan: { ...plan, nextMoves: [{ ...ready, dependency: { blocked: true } }] } as ActionPlanDto }).nextTask, null);
});
test("Dismissal and real completion hide guidance; old completed tasks count as prior experience", () => {
  assert.equal(gettingStartedState(base).visible, true);
  for (const extra of [{ dismissedAt: new Date() }, { completedAt: new Date() }, { previouslyDone: true }]) assert.equal(gettingStartedState({ ...base, ...extra }).visible, false);
});
test("Paid data and executable hints are not disclosed after access is lost", () => {
  const ready = { id: "private", title: "Private title", displayNumber: 1, done: false, dependency: { blocked: false } };
  const result = gettingStartedState({ ...base, canGenerate: false, plan: { ...plan, nextMoves: [ready], blockers: [{ id: "x", title: "Private reason", dependencies: [], missingLink: true }] } as unknown as ActionPlanDto });
  assert.equal(result.nextTask, null); assert.deepEqual(result.blockers, []); assert.equal(result.blocked, null);
});
test("Blocked guidance distinguishes missing prerequisites, outcome confirmation and next-stage generation", () => {
  const blockers = [{ id: "x", title: "Task", dependencies: ["#1"], missingLink: false }];
  assert.equal(gettingStartedState({ ...base, plan: { ...plan, blockers } }).blocked, "prerequisites");
  for (const [status, expected] of [["awaiting", "outcome"], ["unplanned", "next_stage"]]) {
    const roadmap = { milestones: [{ status, achievedAt: null }] };
    assert.equal(gettingStartedState({ ...base, plan: { ...plan, roadmap } as ActionPlanDto }).blocked, expected);
  }
});
test("Builder drafts restore unanswered text, three answers and diagnosis but reject corrupt or incomplete diagnosis", () => {
  const d = newBuilderDraft("en", "11111111-1111-4111-8111-111111111111");
  assert.equal(readBuilderDraft(JSON.stringify({ ...d, answer: "Unsent text" }))?.answer, "Unsent text");
  assert.equal(readBuilderDraft("bad JSON"), null); assert.equal(readBuilderDraft(JSON.stringify({ ...d, requestId: "invalid" })), null);
  const answers = DIAGNOSTIC_QUESTIONS.en.map(question => ({ question, answer: "I don’t know yet" }));
  const diagnosis = { companyStage: "MVP", stageReason: "Working product", stageConfidence: 60, bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckReason: "No customer evidence", bottleneckConfidence: 50 };
  const full = readBuilderDraft(JSON.stringify({ ...d, answers, diagnosis }));
  assert.equal(full?.answers.length, 3); assert.equal(full?.question, ""); assert.equal(full?.diagnosis?.companyStage, "MVP");
  assert.equal(readBuilderDraft(JSON.stringify({ ...d, diagnosis })), null);
});
test("Question index comes from saved answers; no repeat and exactly three distinct topics", () => {
  for (const locale of ["en", "zh-tw"] as const) { const d = newBuilderDraft(locale, "11111111-1111-4111-8111-111111111111");
    assert.equal(new Set(DIAGNOSTIC_QUESTIONS[locale]).size, 3);
    for (let n = 0; n <= 3; n++) { const answers = DIAGNOSTIC_QUESTIONS[locale].slice(0, n).map(question => ({ question, answer: "Unknown" })); assert.equal(readBuilderDraft(JSON.stringify({ ...d, question: "stale", answers }))?.question, DIAGNOSTIC_QUESTIONS[locale][n] || ""); }
  }
});
test("Different accounts use separate storage; stale tabs and replaced requests cannot overwrite newer answers", () => {
  assert.notEqual(builderStorageKey("a"), builderStorageKey("b"));
  const d = newBuilderDraft("en", "11111111-1111-4111-8111-111111111111");
  assert.equal(draftChanged(d, d), false); assert.equal(draftChanged(d, { ...d, revision: 1 }), true);
  assert.equal(draftChanged(d, { ...d, requestId: "22222222-2222-4222-8222-222222222222" }), true);
});
test("Chinese/English onboarding copy has matching keys", () => {
  const en = JSON.parse(readFileSync("messages/en.json", "utf8")).Dashboard.gettingStarted;
  const zh = JSON.parse(readFileSync("messages/zh-tw.json", "utf8")).Dashboard.gettingStarted;
  const keys = (v: object): string[] => Object.entries(v).flatMap(([k, value]) => typeof value === "object" ? keys(value).map(child => `${k}.${child}`) : [k]);
  assert.deepEqual(keys(en).sort(), keys(zh).sort());
});

import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
function loadGuide<T>(file: string, mocks: Record<string, unknown>): T {
  const require = createRequire(import.meta.url), loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { module: loaded, exports: loaded.exports, Date, Error, SyntaxError, console, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  return loaded.exports as T;
}
test("Guide API rejects unauthenticated, forged completion and foreign-owner input; preferences always target session owner", async () => {
  let uid: string | null = null; const writes: unknown[] = [], reads: string[] = [];
  const response = (body: unknown, status = 200) => Response.json(body, { status });
  const api = loadGuide<{ GET(): Promise<Response>; PATCH(r: unknown): Promise<Response> }>("src/app/api/account/getting-started/route.ts", {
    "@/lib/auth/guard": { getUserSession: async () => uid ? { uid } : null },
    "@/lib/prisma": { prisma: { user: { update: async (value: unknown) => writes.push(value) } } },
    "@/lib/getting-started/service": { getGettingStarted: async (owner: string) => { reads.push(owner); return { owner }; } },
    "@/lib/getting-started/state": { GUIDE_VERSION: 1 },
    "@/lib/api": { ok: (data: unknown) => response({ data }), unauthorized: () => response({}, 401), fail: (error: string, status: number) => response({ error }, status), failFromError: () => response({}, 500) },
  });
  const patch = (body: unknown) => api.PATCH({ url: "https://example.test/api/test", headers: new Headers({ Origin: "https://example.test", "Content-Type": "application/json" }), json: async () => body });
  assert.equal((await api.GET()).status, 401); assert.equal((await patch({ action: "dismiss" })).status, 401);
  uid = "owner";
  for (const body of [{ action: "complete" }, { action: "dismiss", uid: "victim" }, { action: "dismiss", gettingStartedCompletedAt: "today" }]) assert.equal((await patch(body)).status, 400);
  assert.equal(writes.length, 0);
  assert.equal((await patch({ action: "dismiss" })).status, 200); assert.equal((await patch({ action: "reopen" })).status, 200);
  const saved = JSON.parse(JSON.stringify(writes)); assert.equal(saved[0].where.id, "owner"); assert.equal(saved[1].data.gettingStartedDismissedAt, null);
  assert.deepEqual(reads, ["owner", "owner"]);
});
test("First task completion is recorded at most once in the task transaction; undo is not a completion event", async () => {
  const service = loadGuide<{ completeGettingStarted(tx: unknown, uid: string): Promise<void> }>("src/lib/getting-started/service.ts", {
    "server-only": {}, react: { cache: (fn: unknown) => fn }, "@/lib/prisma": {}, "@/lib/auth/account": {},
    "@/lib/billing/gate": {}, "@/lib/billing/plans": {}, "@/lib/action-plan/service": {}, "./state": { GUIDE_VERSION: 1 },
  });
  let first: Date | null = null, changed = 0;
  const tx = { user: { updateMany: async ({ where, data }: { where: Record<string, unknown>; data: { gettingStartedCompletedAt: Date } }) => {
    assert.equal(where.id, "owner"); assert.equal(where.gettingStartedCompletedAt, null);
    if (!first) { first = data.gettingStartedCompletedAt; changed++; }
  } } };
  await service.completeGettingStarted(tx, "owner"); const stamp = first;
  await service.completeGettingStarted(tx, "owner"); assert.equal(first, stamp); assert.equal(changed, 1);
});
