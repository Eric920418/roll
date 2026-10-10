import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as roadmap from "../src/lib/roadmap/schema";
import * as ranking from "../src/lib/action-plan/ranking";
import * as time from "../src/lib/action-plan/time";
import * as schema from "../src/lib/week-plan/schema";

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const require = createRequire(import.meta.url), loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  runInNewContext(source, { module: loaded, exports: loaded.exports, console, process, Date, Error, Buffer, Response, URL, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  return loaded.exports as T;
}
const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
test("This week integration in isolated PostgreSQL", { skip: !connectionString }, async t => {
  const url = new URL(connectionString!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const ids: string[] = [];
  const mocks = { "./schemas": createRequire(import.meta.url)("../src/lib/action-plan/schemas"), "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/roadmap/schema": roadmap, "./ranking": ranking, "./time": time };
  const plans = load<typeof import("../src/lib/action-plan/service")>("src/lib/action-plan/service.ts", mocks);
  const service = load<typeof import("../src/lib/week-plan/service")>("src/lib/week-plan/service.ts", { ...mocks, "@/lib/action-plan/service": plans, "./schema": schema });
  const createUser = async () => { const user = await db.user.create({ data: { email: `${randomUUID()}@week.invalid` } }); ids.push(user.id); return user; };
  try {
    const user = await createUser(), other = await createUser();
    const plan = await db.actionPlan.create({ data: { userId: user.id, locale: "en", companyStage: "MVP", stageReason: "QA", stageConfidence: 80, bottleneckGroup: "Sales", bottleneckCode: "no_leads", bottleneckReason: "QA", bottleneckConfidence: 80, requestId: randomUUID(), activeKey: user.id } });
    const taskData = { actionPlanId: plan.id, impact: "revenue", urgencyType: "immediate", difficulty: 1, actionTimeMinHours: 1, actionTimeMaxHours: 1, companyStage: "MVP", stageFit: 1, stageFitReason: "QA", bottleneckGroup: "Sales", bottleneckCode: "no_leads", bottleneckFit: 1, bottleneckFitReason: "QA", outcomeCategory: "customers", expectedOutcome: "QA", outcomeTimeMinDays: 1, outcomeTimeMaxDays: 1 };
    const first = await db.actionItem.create({ data: { ...taskData, clientKey: "task_1", title: "Interview 10 buyers", executionOrder: 0, metricTarget: 10, metricCurrent: 3, metricUnit: "buyers" } });
    const second = await db.actionItem.create({ data: { ...taskData, clientKey: "task_2", title: "Confirm demand", executionOrder: 1, dependencies: { create: { dependsOnId: first.id } } } });
    const schedule = (actionId = first.id, date = "2026-10-03", entryRevision: number | null = null, planRevision = 0): schema.WeekMutation => ({ operation: "schedule", requestId: randomUUID(), actionId, planId: plan.id, planRevision, date, entryRevision });
    let personalId = "", scheduledId = "";
    await t.test("Concurrent additions and late retries after removal never duplicate or resurrect personal items", async () => {
      const input = schema.weekMutationSchema.parse({ operation: "add", requestId: randomUUID(), date: "2026-10-03", title: "Personal appointment", note: "Keep details here" });
      const created = await Promise.all(Array.from({ length: 4 }, () => service.mutateWeekPlan(user.id, false, input)));
      assert.equal(new Set(created).size, 1); personalId = created[0];
      await assert.rejects(service.mutateWeekPlan(user.id, false, { ...input, title: "Changed after an uncertain response" } as schema.WeekMutation), /different content/);
      assert.equal(await db.weekCalendarItem.count({ where: { userId: user.id } }), 1);
      const removed = await service.mutateWeekPlan(user.id, false, { operation: "remove", id: personalId, revision: 0 });
      assert.equal(await service.mutateWeekPlan(user.id, false, input), removed);
      assert.equal((await service.getWeekPlan(user.id, false, "2026-09-28")).entries.length, 0);
      personalId = await service.mutateWeekPlan(user.id, false, { ...input, requestId: randomUUID() } as schema.WeekMutation);
    });
    await t.test("Tenant isolation, stale edits and personal completion do not modify tasks or rewards", async () => {
      const edit = { operation: "edit" as const, id: personalId, revision: 0, date: "2026-10-04", title: "Updated personal", note: "", done: true };
      await assert.rejects(service.mutateWeekPlan(other.id, true, edit), /not found/);
      await assert.rejects(service.mutateWeekPlan(other.id, true, { operation: "remove", id: personalId, revision: 0 }), /not found/);
      await service.mutateWeekPlan(user.id, false, edit);
      await assert.rejects(service.mutateWeekPlan(user.id, false, { ...edit, title: "Stale overwrite" }), /changed/);
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: first.id } })).done, false);
      assert.equal(await db.rewardEntry.count({ where: { userId: user.id } }), 0);
    });
    await t.test("Paid entitlement and actual prerequisites are enforced; manual interview totals are not evidence and waiting references are real", async () => {
      await assert.rejects(service.mutateWeekPlan(user.id, false, schedule()), /Pro/);
      await assert.rejects(service.mutateWeekPlan(other.id, true, schedule()), /changed/);
      await assert.rejects(service.mutateWeekPlan(user.id, true, schedule(second.id)), /locked/);
      const view = await service.getWeekPlan(user.id, true, "2026-09-28");
      assert.deepEqual(JSON.parse(JSON.stringify(view.tasks[0].metric)), { target: 10, unit: "companies", current: 0 });
      assert.equal(view.tasks[1].dependency.blocked, true); assert.equal(view.tasks[1].dependency.actionRefs[0].displayNumber, 1);
    });
    await t.test("Parallel scheduling has one winner, drag replay is safe, moves require current revision", async () => {
      const same = schedule(); scheduledId = await service.mutateWeekPlan(user.id, true, same);
      assert.equal(await service.mutateWeekPlan(user.id, true, same), scheduledId);
      const results = await Promise.allSettled([service.mutateWeekPlan(user.id, true, schedule(first.id, "2026-10-01", 0)), service.mutateWeekPlan(user.id, true, schedule(first.id, "2026-10-02", 0))]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(await db.weekCalendarItem.count({ where: { actionId: first.id } }), 1);
      await assert.rejects(service.mutateWeekPlan(user.id, true, schedule(first.id, "2026-10-05", 0)), /changed/);
      assert.equal((await db.actionPlan.findUniqueOrThrow({ where: { id: plan.id } })).revision, 0);
    });
    await t.test("Removing an arrangement preserves task data and can be scheduled again", async () => {
      await service.mutateWeekPlan(user.id, true, { operation: "remove", id: scheduledId, revision: 1 });
      const task = (await service.getWeekPlan(user.id, true, "2026-09-28")).tasks[0];
      assert.equal(task.scheduled?.date, null); assert.equal(task.scheduled?.revision, 2);
      await service.mutateWeekPlan(user.id, true, schedule(first.id, "2026-10-03", 2));
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: first.id } })).metricCurrent, 3);
      await assert.rejects(service.mutateWeekPlan(user.id, true, { operation: "edit", id: scheduledId, revision: 3, title: "Fake completion", note: "", date: "2026-10-03", done: true }), /Next steps/);
    });
    await t.test("Completion under a plan lock is checked again before accepting a queued schedule", async () => {
      let locked!: () => void, release!: () => void;
      const acquired = new Promise<void>(resolve => { locked = resolve; }), proceed = new Promise<void>(resolve => { release = resolve; });
      const completion = db.$transaction(async tx => { await tx.$queryRaw`SELECT "id" FROM "ActionPlan" WHERE "id" = ${plan.id} FOR UPDATE`; locked(); await proceed; await tx.actionItem.update({ where: { id: first.id }, data: { done: true } }); await tx.actionPlan.update({ where: { id: plan.id }, data: { revision: { increment: 1 } } }); });
      await acquired; const queued = assert.rejects(service.mutateWeekPlan(user.id, true, schedule(first.id, "2026-10-04", 3)), /locked/); release(); await completion;
      await queued;
      assert.equal((await db.weekCalendarItem.findUniqueOrThrow({ where: { id: scheduledId } })).date.toISOString().slice(0, 10), "2026-10-03");
      assert.equal((await service.getWeekPlan(user.id, true, "2026-09-28")).tasks.find(task => task.id === second.id)?.dependency.blocked, false);
    });
    await t.test("Deleted/archived tasks remain identifiable and never leak to free members", async () => {
      await db.actionItem.delete({ where: { id: first.id } });
      const retained = await db.weekCalendarItem.findUniqueOrThrow({ where: { id: scheduledId } }); assert.equal(retained.actionId, null); assert.equal(retained.kind, "action");
      const paid = await service.getWeekPlan(user.id, true, "2026-09-28"); assert.equal(paid.entries.find(entry => entry.id === scheduledId)?.available, false);
      const free = await service.getWeekPlan(user.id, false, "2026-09-28"); assert.equal(free.tasks.length, 0); assert(free.entries.every(entry => entry.kind === "personal"));
      assert.equal((await service.getWeekPlan(other.id, true, "2026-09-28")).entries.length, 0);
      await db.actionPlan.update({ where: { id: plan.id }, data: { activeKey: null, archivedAt: new Date() } });
      await assert.rejects(service.mutateWeekPlan(user.id, true, schedule(second.id, "2026-10-03", null, 1)), /changed/);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); }
});
