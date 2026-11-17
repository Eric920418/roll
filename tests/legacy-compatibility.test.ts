import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { emptyFlowData } from "../src/lib/action-plan/flow/catalog";
import { emptyInsight } from "../src/lib/customer-insights/schema";
import { pdfRuntime } from "./helpers/pdf-runtime";
import { evaluateStep } from "../src/lib/action-plan/flow/evaluate";
import type { OrganizeData } from "../src/lib/action-plan/legacy-organize";

const titles = ["Interview 10 startups on ICP pain and willingness to pay", "Run paid pilot offer with 3 prospects to test willingness to pay", "Draft and validate one-sentence ICP positioning statement", "Build ICP scorecard to qualify and rank future leads", "Score and tier interview leads into ICP segments"];
function fixture(prefix: string) {
  const rows = titles.map((title, i) => ({ id: prefix + i, clientKey: `task_${i + 1}`, title, source: "nova", milestoneId: prefix + "m", executionOrder: null as number | null, done: i === 0, dependencies: [] as Array<{ minimumCurrent: number | null; dependsOn: { id: string; title: string; done: boolean } }> }));
  [[], [0], [0, 1], [2], [0, 3]].forEach((deps, i) => { rows[i].dependencies = deps.map(d => ({ minimumCurrent: i === 1 ? 10 : null, dependsOn: { id: rows[d].id, title: rows[d].title, done: rows[d].done } })); });
  return rows;
}
test("One hundred active legacy plans keep their paid pilot next and preserve stored order, gates and completed records", () => {
  const service = pdfRuntime({ "server-only": {}, "@/lib/prisma": { prisma: {} } })<typeof import("../src/lib/action-plan/service")>("src/lib/action-plan/service.ts");
  for (let i = 0; i < 100; i++) {
    const rows = fixture(`account-${i}-`);
    const actions = rows.map(row => ({ ...row, createdAt: new Date("2026-10-02"), completedAt: row.done ? new Date("2026-10-31") : null, metricCurrent: row.done ? 10 : 0, metricTarget: row.clientKey === "task_1" ? 10 : 1, metricUnit: "companies", dependencyLevel: row.dependencies.length ? 1 : 0, impact: "High", urgencyType: "scheduled", difficulty: 2, actionTimeMinHours: 1, actionTimeMaxHours: 2, stageFit: 4, stageFitReason: "Saved", bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckFit: 4, bottleneckFitReason: "Saved", expectedOutcome: "Original result", outcomeTimeMinDays: 1, outcomeTimeMaxDays: 7, dependencies: row.dependencies.map(edge => ({ ...edge, dependsOn: { ...edge.dependsOn, clientKey: rows.find(a => a.id === edge.dependsOn.id)!.clientKey, metricCurrent: edge.dependsOn.done ? 10 : 0 } })) }));
    const plan = { id: `plan-${i}`, revision: 164, createdAt: new Date("2026-10-02"), locale: i % 2 ? "en" : "zh-tw", companyStage: "MVP", stageReason: "Saved", bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckReason: "Saved", actions, milestones: [] } as unknown as Parameters<typeof service.serializePlan>[0];
    const before = JSON.stringify(plan), projected = service.serializePlan(plan);
    assert.equal(projected.nextMoves[0].id, rows[1].id, "The in-progress paid pilot must not jump back to ICP positioning");
    assert.deepEqual(Array.from(projected.actions, a => a.clientKey), ["task_1", "task_2", "task_3", "task_4", "task_5"]);
    for (const [index, row] of rows.entries()) {
      const dto = projected.actions.find(a => a.id === row.id)!;
      assert.deepEqual(Array.from(dto.dependency.actionIds), row.dependencies.map(edge => edge.dependsOn.id));
      assert.equal(dto.displayNumber, index + 1); assert.equal(dto.done, row.done);
    }
    assert.equal(projected.actions[1].dependency.actionRefs[0].minimumCurrent, 10);
    assert.equal(projected.actions[2].dependency.blocked, true);
    assert.equal(projected.actions[0].completedAt, "2026-10-31T00:00:00.000Z");
    assert.equal(JSON.stringify(plan), before);
    actions[2].dependencies.push({ minimumCurrent: null, dependsOn: { id: "custom", clientKey: "custom", title: "User prerequisite", done: false, metricCurrent: 0 } });
    assert(service.serializePlan(plan).actions[2].dependency.actionIds.includes("custom"));
  }
  const empty = emptyFlowData("organize") as OrganizeData, context = { actions: [], proofs: [], locale: "en" };
  assert.equal(evaluateStep(context, "01-3", empty).target, 4);
  const partial = evaluateStep(context, "01-3", { ...empty, criteria: [{ id: "one", label: "One criterion", weight: 30, sources: [], confirmed: true }] });
  assert.equal(partial.current, 1); assert.equal(partial.target, 4); assert.equal(partial.ready, false);
});

test("Actual legacy five-task PostgreSQL path: ordering, records, links, replies, conflicts, rewards and next task", { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async () => {
  const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL!, url = new URL(connectionString);
  assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const owner = await db.user.create({ data: { email: randomUUID() + "@legacy.invalid", plan: "business" } });
  const other = await db.user.create({ data: { email: randomUUID() + "@legacy.invalid", plan: "business" } });
  let uid = owner.id, failReward = false;
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/prisma": { prisma: db },
    "@/lib/auth/guard": { getUserSession: async () => ({ uid }) }, "@/lib/auth/account": { getCurrentAccount: async () => null },
    "@/lib/billing/gate": { requirePlan: async () => ({ plan: "business" }), getEffectivePlan: () => "business" },
    "@/lib/security/log": { logSecurityError() {} }, "@/lib/rate-limit": { checkRateLimit: async () => ({ ok: true }), DAY_MS: 86400000 },
    "@/lib/credits/authority": { creditsEnabledFor: async () => false, memberCreditsEnabled: async () => false },
    "@/lib/getting-started/service": { completeGettingStarted: async () => {} },
    "@/lib/playbook/quiz": { fortnightIndex: () => 0, periodEnd: () => new Date() },
    "@/lib/api": { ok: (data: unknown) => Response.json({ data }), fail: (error: string, status = 400) => Response.json({ error }, { status }), unauthorized: () => Response.json({}, { status: 401 }), failFromError: () => Response.json({ error: "Safe failure" }, { status: 500 }) },
  };
  const load = pdfRuntime(mocks), rewards = load<typeof import("../src/lib/rewards/service")>("src/lib/rewards/service.ts");
  mocks["@/lib/rewards/service"] = { ...rewards, awardReward: async (...args: Parameters<typeof rewards.awardReward>) => { const result = await rewards.awardReward(...args); if (failReward) throw new Error("Reward transaction failure"); return result; } };
  const service = load<typeof import("../src/lib/action-plan/service")>("src/lib/action-plan/service.ts"), legacy = load<typeof import("../src/lib/action-plan/legacy-organize")>("src/lib/action-plan/legacy-organize.ts"), flow = load<typeof import("../src/lib/action-plan/flow/service")>("src/lib/action-plan/flow/service.ts"), api = load<typeof import("../src/app/api/action-plans/actions/[id]/route")>("src/app/api/action-plans/actions/[id]/route.ts");
  try {
    const plan = await db.actionPlan.create({ data: { userId: owner.id, activeKey: owner.id, requestId: randomUUID(), locale: "en", companyStage: "MVP", stageReason: "Saved", stageConfidence: 80, bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckReason: "Saved", bottleneckConfidence: 80 } });
    const milestone = await db.planMilestone.create({ data: { actionPlanId: plan.id, position: 0, title: "Original milestone", expectedOutcome: "Original outcome", acceptanceCriteria: "Original standard", targetDate: new Date("2027-01-01") } });
    const original = fixture(randomUUID()), tasks: Prisma.ActionItemGetPayload<object>[] = [];
    const old = { kind: "positioning", who: "Original founder", pain: "Original pain", how: "Original approach", outcome: "Original outcome", tested: 2, reaction: "Original feedback" };
    for (const [i, row] of original.entries()) tasks.push(await db.actionItem.create({ data: { id: row.id, actionPlanId: plan.id, clientKey: row.clientKey, title: row.title, source: row.source, milestoneId: milestone.id, done: row.done, completedAt: row.done ? new Date() : null, recordingMode: i === 0 ? "interview" : null, metricTarget: i === 0 ? 10 : null, metricCurrent: i === 0 ? 10 : null, metricUnit: i === 0 ? "companies" : null, taskWorkspace: i === 2 ? old : Prisma.DbNull, dependencyLevel: i ? 1 : 0, impact: "High", urgencyType: "scheduled", difficulty: 2, actionTimeMinHours: 1, actionTimeMaxHours: 2, companyStage: "MVP", stageFit: 4, stageFitReason: "Saved", bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckFit: 4, bottleneckFitReason: "Saved", outcomeCategory: "customers", expectedOutcome: "Saved result", outcomeTimeMinDays: 1, outcomeTimeMaxDays: 7 } }));
    for (const row of original) for (const edge of row.dependencies) await db.actionDependency.create({ data: { actionId: row.id, dependsOnId: edge.dependsOn.id, minimumCurrent: edge.minimumCurrent } });
    const notes = [];
    for (let i = 0; i < 10; i++) notes.push(await db.meetingNote.create({ data: { userId: owner.id, title: "Conversation " + i, insight: { ...emptyInsight("discover"), actionId: tasks[0].id, company: "Company " + i, name: "Person " + i, notes: "Saved source " + i, commercial: { willingness: "willing" } } } }));
    const snapshot = JSON.stringify(await db.actionItem.findMany({ where: { actionPlanId: plan.id }, include: { dependencies: true }, orderBy: { id: "asc" } }));
    let active = (await service.getActiveActionPlan(owner.id))!;
    assert.equal(active.nextMoves[0].id, tasks[1].id); assert.equal(active.actions.find(a => a.id === tasks[2].id)?.displayNumber, 3);
    assert.equal(snapshot, JSON.stringify(await db.actionItem.findMany({ where: { actionPlanId: plan.id }, include: { dependencies: true }, orderBy: { id: "asc" } })), "Reading does not modify member data");
    const req = (body: unknown) => ({ url: "https://example.test/api/action", headers: new Headers({ Origin: "https://example.test", "Content-Type": "application/json" }), nextUrl: new URL("https://example.test/api/action"), json: async () => body }) as never;
    const patch = async (taskId: string, body: object, rev?: number) => api.PATCH(req({ revision: rev ?? (await db.actionPlan.findUniqueOrThrow({ where: { id: plan.id } })).revision, ...body }), { params: Promise.resolve({ id: taskId }) });
    const data = { ...emptyFlowData("organize"), values: { positioning: "We help founders validate demand." }, confirmed: ["positioning"], selections: notes.slice(0, 5).map(n => n.id) } as OrganizeData;
    uid = other.id; assert.equal((await patch(tasks[2].id, { organizeData: data })).status, 404); uid = owner.id;
    assert.equal((await patch(tasks[2].id, { organizeData: data })).status, 409, "Positioning cannot bypass the original paid-pilot prerequisite");
    assert.equal((await patch(tasks[1].id, { done: true })).status, 409, "The restored paid task still requires actual proof");
    await db.deal.create({ data: { userId: owner.id, title: "Synthetic paid pilot", validation: { scope: { planId: plan.id }, company: "Synthetic buyer", name: "Test contact", version: 1, status: "paid", events: [], proofs: [{ id: randomUUID(), kind: "paid", amount: "125.50", currency: "USD", date: "2026-11-17", pathname: `commercial-evidence/${owner.id}/synthetic.pdf`, filename: "synthetic.pdf", confirmed: true }] } } });
    assert.equal((await patch(tasks[1].id, { done: true })).status, 200);
    assert.equal((await patch(tasks[1].id, { done: true })).status, 200);
    assert.equal(await db.rewardEntry.count({ where: { userId: owner.id, eventKey: "action:" + tasks[1].id } }), 1);
    assert.equal((await service.getActiveActionPlan(owner.id))!.nextMoves[0].id, tasks[2].id);
    assert.equal((await patch(tasks[3].id, { organizeData: emptyFlowData("organize") })).status, 409, "Scorecard stays gated");
    await db.actionItem.update({ where: { id: tasks[2].id }, data: { taskFinding: { result: null, pending: { requestId: randomUUID(), since: new Date().toISOString() } } } });
    assert.equal((await patch(tasks[2].id, { organizeData: data })).status, 409, "An old in-flight analysis cannot overwrite the new form");
    await db.actionItem.update({ where: { id: tasks[2].id }, data: { taskFinding: Prisma.DbNull } });
    assert.equal((await patch(tasks[2].id, { organizeData: data, confirmationRecipients: [...data.selections, "foreign"] })).status, 409);
    const response = await patch(tasks[2].id, { organizeData: data, confirmationRecipients: data.selections }); assert.equal(response.status, 200, await response.clone().text());
    const saved = (await response.json()).data;
    assert.equal((await patch(tasks[2].id, { organizeData: data }, 0)).status, 409);
    assert.equal((await patch(tasks[2].id, { done: true })).status, 409, "Owner cannot assert five yes votes");
    assert.deepEqual((await db.actionItem.findUniqueOrThrow({ where: { id: tasks[2].id } })).taskWorkspace, old);
    for (const entry of saved.confirmationLinks) { const link = new URL(entry.href, "https://example.test"); await flow.confirmation(tasks[2].id, link.searchParams.get("token")!, "yes", "Actual response"); }
    active = (await service.getActiveActionPlan(owner.id))!; assert.equal(active.actions.find(a => a.id === tasks[2].id)?.metric?.current, 5);
    const changed = { ...data, values: { positioning: "We help founders test demand through conversations." } };
    const changedResponse = await patch(tasks[2].id, { organizeData: changed, confirmationRecipients: data.selections }); assert.equal(changedResponse.status, 200);
    const replaced = (await changedResponse.json()).data;
    const expired = new URL(saved.confirmationLinks[0].href, "https://example.test"); await assert.rejects(flow.confirmation(tasks[2].id, expired.searchParams.get("token")!), /expired|失效/);
    assert.equal((await service.getActiveActionPlan(owner.id))!.actions.find(a => a.id === tasks[2].id)?.metric?.current, 0);
    for (const entry of replaced.confirmationLinks) { const link = new URL(entry.href, "https://example.test"); await flow.confirmation(tasks[2].id, link.searchParams.get("token")!, "yes", "Actual revised response"); }
    failReward = true; assert.equal((await patch(tasks[2].id, { done: true })).status, 500); assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: tasks[2].id } })).done, false); failReward = false;
    assert.equal((await patch(tasks[2].id, { done: true })).status, 200); assert.equal((await patch(tasks[2].id, { done: true })).status, 200);
    assert.equal(await db.rewardEntry.count({ where: { userId: owner.id, eventKey: "action:" + tasks[2].id } }), 1);
    const completedPositioning = await db.actionItem.findUniqueOrThrow({ where: { id: tasks[2].id } });
    assert.equal(completedPositioning.metricCurrent, 5, "Completion persists the verified count instead of relying on future read-time recalculation");
    assert.equal((await service.getActiveActionPlan(owner.id))!.actions.find(a => a.id === tasks[2].id)?.metric?.current, 5);
    active = (await service.getActiveActionPlan(owner.id))!; assert.equal(active.nextMoves[0].id, tasks[3].id);
    const criteria = { ...emptyFlowData("organize"), criteria: Array.from({ length: 4 }, (_, i) => ({ id: "c" + i, label: "Public criterion " + i, weight: 25, sources: data.selections.slice(0, 3), confirmed: true })) } as OrganizeData;
    assert.equal((await patch(tasks[3].id, { organizeData: criteria })).status, 200); assert.equal((await patch(tasks[3].id, { done: true })).status, 200);
    const evidence = await load<typeof import("../src/lib/action-plan/workspace-service")>("src/lib/action-plan/workspace-service.ts").planWorkspaceEvidence(db as never, owner.id, plan.id);
    assert.equal(evidence.leads.length, 10); assert.equal(evidence.scorecards[0].criteria.length, 4); assert.equal(evidence.scorecards[0].criteria[0].weight, 25);
    assert.equal((await patch(tasks[2].id, { done: false })).status, 409, "A completed dependent still prevents undo");
    assert.equal((await service.getActiveActionPlan(owner.id))!.nextMoves[0].id, tasks[4].id);
    assert.equal(await db.meetingNote.count({ where: { userId: owner.id } }), 10); assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: tasks[0].id } })).done, true);
    assert.equal((await legacy.getLegacyOrganize(db as never, owner.id, plan.id, tasks[2].id)).positioningReplies.filter(r => r.answer === "yes").length, 5);
  } finally { await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } }); await db.$disconnect(); }
});
