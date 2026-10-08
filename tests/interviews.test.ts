import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { companyKey, interviewSummary } from "../src/lib/customer-insights/interviews";
import { emptyInsight, insightSchema } from "../src/lib/customer-insights/schema";

const interview = (company: string, challenge?: "market" | "focus" | "survival" | "other") => ({ ...emptyInsight("discover"), actionId: "task", name: "Founder", company, answers: ["Actual interview evidence", "", "", ""], ...(challenge ? { challenge } : {}) });
test("Interviews deduplicate normalized companies, use latest evidence, and retain unclassified denominators", () => {
  assert.equal(companyKey("  ＡＣＭＥ　 Inc  "), "acme inc");
  const rows = [
    { id: "old", updatedAt: "2026-10-01", insight: interview("Acme Inc", "market") },
    { id: "new", updatedAt: "2026-10-02", insight: interview("ＡＣＭＥ  Inc", "focus") },
    { id: "unclassified", updatedAt: "2026-10-02", insight: interview("Beta") },
    { id: "other", updatedAt: "2026-10-02", insight: interview("Gamma", "other") },
    { id: "foreign", updatedAt: "2026-10-02", insight: { ...interview("Foreign"), actionId: "another" } },
    { id: "empty", updatedAt: "2026-10-02", insight: { ...interview("Empty"), answers: ["", "", "", ""] } },
  ];
  const summary = interviewSummary("task", rows);
  assert.equal(summary.total, 3); assert.equal(summary.counts.market, 0);
  assert.deepEqual(summary.top, [{ key: "focus", count: 1, percent: 33.3 }]);
  assert.equal(summary.counts.other, 1); assert.equal(summary.counts.unclassified, 1);
  assert.deepEqual(interviewSummary("task", []), { total: 0, top: [], counts: { market: 0, focus: 0, survival: 0, other: 0, unclassified: 0 }, companies: [] });
  assert(!insightSchema.safeParse({ ...interview(""), company: " " }).success);
  assert(insightSchema.safeParse({ ...emptyInsight("discover"), name: "Legacy" }).success);
});

function load<T>(file: string, mocks: Record<string, unknown>): T {
  const require = createRequire(resolve(file)), loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  runInNewContext(code, { module: loaded, exports: loaded.exports, Date, Error, console, process, Response, URL, Headers, Buffer, setTimeout, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  return loaded.exports as T;
}

const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
test("Interview transactions and completion in isolated PostgreSQL", { skip: !connectionString }, async t => {
  const url = new URL(connectionString!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"), "Only use isolated loopback QA databases");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 8 }) });
  const owner = await db.user.create({ data: { email: `${randomUUID()}@interviews.invalid`, plan: "pro" } });
  const stranger = await db.user.create({ data: { email: `${randomUUID()}@interviews.invalid` } });
  let uid: string | null = owner.id, allowed = true, failAward = false;
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/prisma": { prisma: db },
    "@/lib/auth/guard": { getUserSession: async () => uid ? { uid } : null },
    "@/lib/billing/gate": { requirePlan: async () => allowed ? { id: uid, plan: "pro" } : null, getEffectivePlan: () => "pro" },
    "@/lib/auth/account": { getCurrentAccount: async () => null },
    "@/lib/playbook/quiz": { fortnightIndex: () => 0, periodEnd: () => new Date() },
    "@/lib/getting-started/service": { completeGettingStarted: async () => {} },
    "@/lib/api": { ok: (data: unknown, status = 200) => Response.json({ data }, { status }), fail: (error: string, status = 400) => Response.json({ error }, { status }), unauthorized: () => Response.json({ error: "Unauthorized" }, { status: 401 }), failFromError: (error: unknown) => { console.error(error); return Response.json({ error: "Safe error" }, { status: 500 }); } },
  };
  const plans = load<typeof import("../src/lib/action-plan/service")>("src/lib/action-plan/service.ts", mocks);
  mocks["@/lib/action-plan/service"] = plans;
  const evidence = load<typeof import("../src/lib/customer-insights/service")>("src/lib/customer-insights/service.ts", mocks);
  mocks["@/lib/customer-insights/service"] = evidence;
  const rewards = load<typeof import("../src/lib/rewards/service")>("src/lib/rewards/service.ts", mocks);
  mocks["@/lib/rewards/service"] = { ...rewards, awardReward: async (...args: Parameters<typeof rewards.awardReward>) => { if (failAward) throw new Error("Injected transaction failure"); return rewards.awardReward(...args); } };
  const records = load<typeof import("../src/app/api/customer-insights/route")>("src/app/api/customer-insights/route.ts", mocks);
  const tasks = load<typeof import("../src/app/api/action-plans/actions/[id]/route")>("src/app/api/action-plans/actions/[id]/route.ts", mocks);
  const notes = load<typeof import("../src/app/api/notes/[id]/route")>("src/app/api/notes/[id]/route.ts", mocks);
  const req = (body: unknown = {}, url = "https://example.test/api/test") => ({ url, headers: new Headers({ Origin: "https://example.test", "Content-Type": "application/json" }), json: async () => body }) as never;
  const remove = async (id: string, version?: string) => notes.DELETE(req({}, `https://example.test/api/notes/${id}?updatedAt=${encodeURIComponent(version ?? (await db.meetingNote.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString())}`), { params: Promise.resolve({ id }) });
  const diagnosis = { companyStage: "MVP", stageReason: "Real profile", stageConfidence: 80, bottleneckGroup: "Sales", bottleneckCode: "no_leads", bottleneckReason: "Real bottleneck", bottleneckConfidence: 80 };
  const plan = await db.actionPlan.create({ data: { userId: owner.id, activeKey: owner.id, locale: "en", requestId: randomUUID(), ...diagnosis } });
  const task = await db.actionItem.create({ data: { actionPlanId: plan.id, clientKey: "task_1", title: "Interview companies", impact: "High", urgencyType: "immediate", difficulty: 1, actionTimeMinHours: 1, actionTimeMaxHours: 1, companyStage: diagnosis.companyStage, bottleneckGroup: diagnosis.bottleneckGroup, bottleneckCode: diagnosis.bottleneckCode, stageFit: 4, stageFitReason: "Fit", bottleneckFit: 4, bottleneckFitReason: "Fit", outcomeCategory: "customers", expectedOutcome: "Real feedback", outcomeTimeMinDays: 1, outcomeTimeMaxDays: 7 } });
  const context = { params: Promise.resolve({ id: task.id }) };
  const patch = async (fields: object) => tasks.PATCH(req({ revision: (await db.actionPlan.findUniqueOrThrow({ where: { id: plan.id } })).revision, ...fields }), context);
  const save = (company: string, requestId = randomUUID()) => records.POST(req({ requestId, insight: { ...interview(company, "market"), actionId: task.id } }));
  try {
    await t.test("Ownership, permission, validation and stale versions fail before writes", async () => {
      uid = null; assert.equal((await save("Acme")).status, 401);
      uid = owner.id; allowed = false; assert.equal((await save("Acme")).status, 403); allowed = true;
      uid = stranger.id; assert.equal((await save("Acme")).status, 404); uid = owner.id;
      assert.equal((await save("")).status, 400);
      assert.equal((await patch({ recordingMode: "interview", metricTarget: 2 })).status, 200);
      assert.equal((await tasks.PATCH(req({ revision: 0, done: true }), context)).status, 409);
      assert.equal((await patch({ metricTarget: 2, metricUnit: "companies", metricCurrent: 100 })).status, 409);
      assert.equal((await patch({ done: true })).status, 409);
    });
    let noteId = "";
    await t.test("Concurrent replays and company duplicates cannot inflate totals", async () => {
      const requestId = randomUUID(); noteId = `insight_${requestId}`;
      const results = await Promise.all([save("Acme", requestId), save("Acme", requestId), save("ＡＣＭＥ")]);
      assert(results.every(r => r.status === 201));
      assert.equal(await db.meetingNote.count({ where: { userId: owner.id } }), 2);
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).metricCurrent, 1);
      assert.equal((await patch({ done: true })).status, 409);
      const different = await save("Different", requestId); assert.equal(different.status, 409);
      assert.equal((await save("Beta")).status, 201);
    });
    await t.test("Completion and rewards roll back together; repeat completion awards once", async () => {
      failAward = true; assert.equal((await patch({ done: true })).status, 500); failAward = false;
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).done, false);
      assert.equal(await db.rewardEntry.count({ where: { userId: owner.id, kind: "action" } }), 0);
      assert.equal((await patch({ done: true })).status, 200);
      assert.equal((await patch({ done: true })).status, 200);
      assert.equal((await db.rewardAccount.findUniqueOrThrow({ where: { userId: owner.id } })).balance, 30);
      assert.equal(await db.rewardEntry.count({ where: { userId: owner.id, kind: "action", points: { gt: 0 } } }), 1);
    });
    await t.test("Edits preserve task links; removal cannot invalidate completed evidence", async () => {
      const beta = await db.meetingNote.findFirstOrThrow({ where: { userId: owner.id, title: "Founder", insight: { path: ["company"], equals: "Beta" } } });
      const parsed = insightSchema.parse(beta.insight);
      assert.equal((await records.PATCH(req({ id: beta.id, updatedAt: beta.updatedAt.toISOString(), insight: { ...parsed, actionId: "another" } }))).status, 409);
      assert.equal((await records.PATCH(req({ id: beta.id, updatedAt: beta.updatedAt.toISOString(), insight: { ...parsed, challenge: "focus" } }))).status, 200);
      assert.equal((await records.PATCH(req({ id: beta.id, updatedAt: beta.updatedAt.toISOString(), insight: { ...parsed, challenge: "survival" } }))).status, 409);
      assert.equal((await remove(beta.id)).status, 409);
      assert(await db.meetingNote.findUnique({ where: { id: beta.id } }));
      assert.equal((await patch({ done: false })).status, 200);
      assert.equal((await remove(beta.id, beta.updatedAt.toISOString())).status, 409);
      assert.equal((await notes.DELETE(req(), { params: Promise.resolve({ id: beta.id }) })).status, 409);
      assert.equal((await remove(beta.id)).status, 200);
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).metricCurrent, 1);
      assert(await db.meetingNote.findUnique({ where: { id: noteId } }));
    });
    await t.test("Concurrent distinct companies count exactly; completed dependents protect thresholds; task deletion keeps interviews", async () => {
      assert((await Promise.all([save("Gamma"), save("Delta")])).every(r => r.status === 201));
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).metricCurrent, 3);
      const next = await db.actionItem.create({ data: { ...(await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })), id: randomUUID(), clientKey: "task_2", recordingMode: null, done: true, metricTarget: null, metricUnit: null, metricCurrent: null } });
      await db.actionDependency.create({ data: { actionId: next.id, dependsOnId: task.id, minimumCurrent: 3 } });
      const gamma = await db.meetingNote.findFirstOrThrow({ where: { userId: owner.id, insight: { path: ["company"], equals: "Gamma" } } });
      assert.equal((await remove(gamma.id)).status, 409);
      await db.actionItem.delete({ where: { id: next.id } });
      assert.equal((await tasks.DELETE(req({ revision: (await db.actionPlan.findUniqueOrThrow({ where: { id: plan.id } })).revision }), context)).status, 200);
      assert.equal(await db.meetingNote.count({ where: { userId: owner.id } }), 4);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: [owner.id, stranger.id] } } }); await db.$disconnect();
  }
});
