import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as workspace from "../src/lib/action-plan/workspace";
import { emptyInsight } from "../src/lib/customer-insights/schema";

test("Task workspaces infer six families, retain other tasks and require an explicit interview target", () => {
  for (const [title, kind] of [["Define and document your ideal customer profile", "icp"], ["Interview 10 startups on ICP pain and willingness to pay", "interview"], ["Run paid pilot offer with 3 prospects", "pilot"], ["Draft and validate one-sentence ICP positioning statement", "positioning"], ["Build ICP scorecard", "scorecard"], ["Score and tier interview leads into ICP segments", "tiers"], ["訪談 10 間公司", "interview"], ["建立 ICP 評分卡", "scorecard"]]) assert.equal(workspace.workspaceKind({ title: title! }), kind);
  assert.equal(workspace.workspaceKind({ title: "Publish a landing page" }), null);
  assert.equal(workspace.interviewTarget({ title: "Interview 10 startups" }), 10);
  assert.equal(workspace.interviewTarget({ title: "Interview 10 startups", metricTarget: 20 }), 20);
  assert.equal(workspace.interviewTarget({ title: "Interview founders" }), null);
  assert.equal(workspace.interviewTarget({ title: "Interview 0 founders" }), null);
});
test("Each workspace has its own evidence completion rule and empty forms never complete", () => {
  for (const kind of ["icp", "pilot", "positioning", "scorecard", "tiers"] as const) assert.equal(workspace.workspaceComplete(workspace.emptyWorkspace(kind)), false);
  const icp = { kind: "icp" as const, candidates: [{ name: "Clinic owners", industry: "healthcare", size: "1–10", role: "owner", pain: "Manual reporting", trigger: "New branch" }] };
  assert(workspace.workspaceComplete(icp)); assert.equal(workspace.workspaceProgress(icp).current, 1);
  assert.equal(workspace.workspaceComplete({ ...icp, candidates: [{ ...icp.candidates[0]!, trigger: "" }] }), false);
  assert.equal(workspace.workspaceComplete({ kind: "pilot", prospects: [{ leadId: "lead", offer: "$100", response: "thinking", reason: "Review budget" }] }), false);
  assert(workspace.workspaceComplete({ kind: "pilot", prospects: [{ leadId: "lead", offer: "$100", response: "agreed", reason: "Save reporting time" }] }));
  assert.equal(workspace.workspaceComplete({ kind: "positioning", who: "owners", pain: "reporting", outcome: "save time", how: "automation", tested: 0, reaction: "" }), false);
  assert.equal(workspace.workspaceSchema.safeParse({ kind: "scorecard", criteria: [{ id: "a", criterion: "Pain", weight: 6, fit: "Yes" }] }).success, false);
});
test("Lead score sums unique confirmed conditions; absent evidence is not a fabricated score", () => {
  const criteria = [{ id: "a", criterion: "Pays for tool", weight: 5, fit: "Current invoice" }, { id: "b", criterion: "Urgent pain", weight: 2, fit: "Weekly pain" }, { id: "c", criterion: "", weight: 3, fit: "" }];
  assert.deepEqual(workspace.leadScore(["a", "a", "unknown", "c"], criteria), { score: 5, max: 7 });
  assert.deepEqual(workspace.leadScore([], []), { score: 0, max: 0 });
});
test("Interview lead list deduplicates people/companies, retains newest valid evidence and excludes investor/internal notes", () => {
  const insight = { ...emptyInsight("discover"), name: " Vivian ", company: "ACME", answers: ["Pain", "", "", ""] };
  const rows = [{ id: "old", updatedAt: "2026-10-01", insight }, { id: "new", updatedAt: "2026-10-02", insight: { ...insight, company: "ＡＣＭＥ", name: "vivian", answers: ["Updated pain", "", "", ""] } }, { id: "internal", updatedAt: "2026-10-03", insight: { ...insight, type: "Internal" } }];
  assert.equal(workspace.workspaceLeads(rows).length, 1);
  assert.equal(workspace.workspaceLeads(rows)[0]!.id, "new");
});
test("AI findings reject invented evidence and accept exact saved quotes", () => {
  const finding = { cards: Array.from({ length: 3 }, () => ({ title: "Pain", text: "Reporting takes time", evidence: "Eight hours weekly" })), why: "Start with reporting." };
  assert(workspace.groundedFinding(finding, ["Eight hours weekly"]));
  assert.throws(() => workspace.groundedFinding(finding, ["No saved quote"]));
  assert.throws(() => workspace.groundedFinding({ ...finding, cards: finding.cards.slice(0, 2) }, ["Eight hours weekly"]));
  assert(workspace.findingDraftSchema.safeParse({ ...finding, why: "", cards: finding.cards.map(c => ({ ...c, title: "" })) }).success);
  assert.equal(workspace.findingSchema.safeParse({ ...finding, why: "" }).success, false);
});

test("Task workspace APIs in isolated PostgreSQL: versioning, ownership, evidence and atomic completion", { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async t => {
  const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL!, url = new URL(connectionString);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
  const owner = await db.user.create({ data: { email: `${randomUUID()}@workspace.invalid`, plan: "pro" } }), other = await db.user.create({ data: { email: `${randomUUID()}@workspace.invalid` } });
  let releaseAi: (() => void) | null = null, holdAi = false;
  let uid: string | null = owner.id, allowed = true, failAward = false, aiCalls = 0, reserveCalls = 0, successCalls = 0, failureCalls = 0, aiFail = false;
  const mocks: Record<string, unknown> = { "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/action-plan/workspace": workspace,
    "@/lib/auth/guard": { getUserSession: async () => uid ? { uid } : null }, "@/lib/auth/account": { getCurrentAccount: async () => null },
    "@/lib/billing/gate": { requirePlan: async () => allowed ? { id: uid, plan: "pro" } : null, getEffectivePlan: () => "pro" },
    "@/lib/ai/allowance": { reserveAiUsage: async () => { reserveCalls++; return "qa-usage"; }, completeAiUsage: async (_id: string, success: boolean) => { if (success) successCalls++; else failureCalls++; } },
    "@/lib/rate-limit": { checkRateLimit: async () => ({ ok: true }), DAY_MS: 86400000 }, "@/lib/security/log": { logSecurityError() {} },
    "@anthropic-ai/sdk": { __esModule: true, default: class { messages = { create: async () => { aiCalls++; if (holdAi) await new Promise<void>(resolve => { releaseAi = resolve; }); if (aiFail) throw new Error("Simulated AI failure"); return { content: [{ type: "tool_use", name: "task_findings", input: { cards: Array.from({ length: 3 }, () => ({ title: "Pain", text: "Reporting is a saved pain", evidence: "Manual reporting" })), why: "Use customer wording." } }] }; } }; } },
    "@/lib/playbook/quiz": { fortnightIndex: () => 0, periodEnd: () => new Date() }, "@/lib/getting-started/service": { completeGettingStarted: async () => {} },
    "@/lib/api": { ok: (data: unknown, status = 200) => Response.json({ data }, { status }), fail: (error: string, status = 400) => Response.json({ error }, { status }), unauthorized: () => Response.json({ error: "Unauthorized" }, { status: 401 }), failFromError: () => Response.json({ error: "Safe server error" }, { status: 500 }) },
  };
  function load<T>(file: string): T {
    const require = createRequire(resolve(file)), loaded = { exports: {} };
    runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, Date, Error, console, process, Response, URL, Headers, Buffer, setTimeout, require: (id: string) => id in mocks ? mocks[id] : require(id) });
    return loaded.exports as T;
  }
  const plans = load<typeof import("../src/lib/action-plan/service")>("src/lib/action-plan/service.ts"); mocks["@/lib/action-plan/service"] = plans; mocks["./service"] = plans;
  mocks["@/lib/action-plan/workspace-service"] = load("src/lib/action-plan/workspace-service.ts");
  mocks["@/lib/customer-insights/service"] = load("src/lib/customer-insights/service.ts");
  const rewards = load<typeof import("../src/lib/rewards/service")>("src/lib/rewards/service.ts"); mocks["@/lib/rewards/service"] = { ...rewards, awardReward: async (...args: Parameters<typeof rewards.awardReward>) => { if (failAward) throw new Error("Injected reward failure"); return rewards.awardReward(...args); } };
  const api = load<typeof import("../src/app/api/action-plans/actions/[id]/route")>("src/app/api/action-plans/actions/[id]/route.ts"), notes = load<typeof import("../src/app/api/customer-insights/route")>("src/app/api/customer-insights/route.ts");
  const plan = await db.actionPlan.create({ data: { userId: owner.id, activeKey: owner.id, locale: "en", requestId: randomUUID(), companyStage: "MVP", stageReason: "QA", stageConfidence: 80, bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckReason: "QA", bottleneckConfidence: 80 } });
  const base = { actionPlanId: plan.id, impact: "High", urgencyType: "immediate", difficulty: 1, actionTimeMinHours: 1, actionTimeMaxHours: 1, companyStage: "MVP", bottleneckGroup: "Sales", bottleneckCode: "no_icp", stageFit: 4, stageFitReason: "QA", bottleneckFit: 4, bottleneckFitReason: "QA", outcomeCategory: "customers", expectedOutcome: "Actual records", outcomeTimeMinDays: 1, outcomeTimeMaxDays: 7 };
  const task = await db.actionItem.create({ data: { ...base, clientKey: "task_1", title: "Define and document your ideal customer profile" } });
  const req = (body: unknown, path = "https://example.test/api/test") => ({ url: path, headers: new Headers({ Origin: "https://example.test", "Content-Type": "application/json" }), nextUrl: new URL(path), json: async () => body }) as never;
  const revision = async () => (await db.actionPlan.findUniqueOrThrow({ where: { id: plan.id } })).revision;
  const patch = async (body: object, id = task.id, version?: number) => api.PATCH(req({ revision: version ?? await revision(), ...body }), { params: Promise.resolve({ id }) });
  const form = { kind: "icp", candidates: [{ name: "Clinic owner", industry: "healthcare", size: "1–10", role: "Owner", pain: "Manual reporting", trigger: "New branch" }] };
  try {
    await t.test("Login, plan and ownership rejected; incomplete or mismatched forms never complete", async () => {
      uid = null; assert.equal((await patch({ done: true })).status, 401); uid = owner.id;
      allowed = false; assert.equal((await patch({ taskWorkspace: form })).status, 403); allowed = true;
      uid = other.id; assert.equal((await patch({ taskWorkspace: form })).status, 404); uid = owner.id;
      assert.equal((await patch({ done: true })).status, 409);
      assert.equal((await patch({ taskWorkspace: workspace.emptyWorkspace("scorecard") })).status, 400);
    });
    await t.test("Stale multi-tab saves retain originals; repeated completion issues one reward and failures roll back", async () => {
      const version = await revision(); assert.equal((await patch({ taskWorkspace: form })).status, 200);
      assert.equal((await patch({ metricTarget: 5, metricCurrent: 5, metricUnit: "candidates" })).status, 409);
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).metricCurrent, 1);
      assert.equal((await patch({ taskWorkspace: { ...form, candidates: [{ ...form.candidates[0], pain: "Overwritten" }] } }, task.id, version)).status, 409);
      assert.equal(workspace.workspaceSchema.parse((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).taskWorkspace).kind, "icp");
      failAward = true; assert.equal((await patch({ done: true })).status, 500); failAward = false;
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).done, false);
      assert.equal((await patch({ done: true })).status, 200); assert.equal((await patch({ done: true })).status, 200);
      assert.equal(await db.rewardEntry.count({ where: { userId: owner.id, kind: "action", points: { gt: 0 } } }), 1);
    });
    await t.test("AI failures refund; replay of successful findings uses no additional request; manual edit does not invoke AI", async () => {
      const post = async () => api.POST(req({ revision: await revision(), requestId: randomUUID(), locale: "en" }), { params: Promise.resolve({ id: task.id }) });
      aiFail = true; assert.equal((await post()).status, 502); aiFail = false;
      assert.equal(failureCalls, 1); assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).done, true);
      assert.equal((await post()).status, 200); assert.equal(successCalls, 1); assert.equal((await post()).status, 200);
      assert.equal(aiCalls, 2); assert.equal(reserveCalls, 2);
      const saved = workspace.storedFindingSchema.parse((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).taskFinding).result!;
      assert.equal((await patch({ finding: { ...saved, why: "My edited next step" } })).status, 200);
      assert.equal(workspace.storedFindingSchema.parse((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).taskFinding).source, "user"); assert.equal(aiCalls, 2);
    });
    await t.test("Overlapping AI requests share one processing lock and one charge", async () => {
      await db.actionItem.update({ where: { id: task.id }, data: { taskFinding: Prisma.DbNull } });
      holdAi = true;
      const before = reserveCalls, version = await revision();
      const pending = api.POST(req({ revision: version, requestId: randomUUID(), locale: "en" }), { params: Promise.resolve({ id: task.id }) });
      const deadline = Date.now() + 5000;
      while (!releaseAi && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
      assert(releaseAi, "AI stub must acquire the lock within five seconds");
      const repeated = await api.POST(req({ revision: version, requestId: randomUUID(), locale: "en" }), { params: Promise.resolve({ id: task.id }) });
      assert.equal(repeated.status, 409); assert.equal(reserveCalls, before + 1);
      holdAi = false; (releaseAi as () => void)(); releaseAi = null; assert.equal((await pending).status, 200);
    });
    await t.test("First saved interview atomically configures explicit target; manual totals cannot complete it", async () => {
      const interviewTask = await db.actionItem.create({ data: { ...base, clientKey: "task_2", title: "Interview 2 startups", metricTarget: 2, metricUnit: "1", metricCurrent: 2 } });
      assert.equal((await patch({ done: true }, interviewTask.id)).status, 409);
      const insight = { ...emptyInsight("discover"), actionId: interviewTask.id, name: "Founder", company: "Acme", answers: ["Manual reporting", "", "", ""] };
      const id = randomUUID(), body = { requestId: id, insight };
      assert.equal((await notes.POST(req(body))).status, 201); assert.equal((await notes.POST(req(body))).status, 201);
      const saved = await db.actionItem.findUniqueOrThrow({ where: { id: interviewTask.id } });
      assert.equal(saved.recordingMode, "interview"); assert.equal(saved.metricUnit, "companies"); assert.equal(saved.metricCurrent, 1);
      assert.equal((await patch({ done: true }, interviewTask.id)).status, 409);
      assert.equal(await db.meetingNote.count({ where: { userId: owner.id } }), 1);
      const otherPlan = await db.actionPlan.create({ data: { userId: other.id, activeKey: other.id, locale: "en", requestId: randomUUID(), companyStage: "MVP", stageReason: "QA", stageConfidence: 80, bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckReason: "QA", bottleneckConfidence: 80 } });
      const foreign = await db.actionItem.create({ data: { ...base, actionPlanId: otherPlan.id, clientKey: "foreign", title: "Interview 2 founders" } });
      assert.equal((await notes.GET(req({}, `https://example.test/api/customer-insights?actionId=${foreign.id}&scope=plan`))).status, 404);
      const response = await notes.GET(req({}, `https://example.test/api/customer-insights?actionId=${interviewTask.id}&scope=plan`)); assert.equal(response.status, 200); assert.equal((await response.json()).data.leads.length, 1);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } }); await db.$disconnect(); }
});
