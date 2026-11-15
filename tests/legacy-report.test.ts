import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pdfRuntime } from "./helpers/pdf-runtime";

const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
test("Legacy report shares real partial progress, protects private sources and is revocable", { skip: !connectionString }, async t => {
  const url = new URL(connectionString!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
  const ids: string[] = [];
  let planId = "";
  try {
    const owner = await db.user.create({ data: { email: `report-${randomUUID()}@example.invalid`, passwordHash: "qa" } }); ids.push(owner.id);
    const other = await db.user.create({ data: { email: `report-${randomUUID()}@example.invalid`, passwordHash: "qa" } }); ids.push(other.id);
    const plan = await db.actionPlan.create({ data: { userId: owner.id, activeKey: owner.id, locale: "en", requestId: randomUUID(), goal: "Saved legacy goal", companyStage: "MVP", stageReason: "Saved", stageConfidence: 70, bottleneckGroup: "Sales", bottleneckCode: "no_leads", bottleneckReason: "Saved", bottleneckConfidence: 70 } }); planId = plan.id;
    const base = { actionPlanId: plan.id, impact: "High", urgencyType: "scheduled", difficulty: 2, actionTimeMinHours: 1, actionTimeMaxHours: 2, companyStage: "MVP", stageFit: 5, stageFitReason: "Saved", bottleneckGroup: "Sales", bottleneckCode: "no_leads", bottleneckFit: 5, bottleneckFitReason: "Saved", outcomeCategory: "customers", expectedOutcome: "Expected result", outcomeTimeMinDays: 1, outcomeTimeMaxDays: 7 };
    const done = await db.actionItem.create({ data: { ...base, clientKey: "legacy_done", title: "Saved completed task", executionOrder: 0, done: true, completedAt: new Date(), taskWorkspace: { quote: "PRIVATE_INTERVIEW", attachment: "PRIVATE_ATTACHMENT" }, taskFinding: { result: { cards: [0, 1, 2].map(i => ({ title: "Saved headline " + i, text: "PRIVATE_FINDING_TEXT", evidence: "PRIVATE_QUOTE" })), why: "PRIVATE_REASON" }, source: "user" } } });
    const pending = await db.actionItem.create({ data: { ...base, clientKey: "legacy_pending", title: "Still incomplete task", executionOrder: 1 } });
    const original = JSON.stringify(await db.actionItem.findMany({ where: { actionPlanId: plan.id }, orderBy: { id: "asc" } }));
    const load = pdfRuntime({ "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/rewards/service": {}, "@/lib/getting-started/service": {} });
    const flow = load<typeof import("../src/lib/action-plan/flow/service")>("src/lib/action-plan/flow/service.ts");
    const latest = () => flow.getFlow(owner.id);
    const share = async (enabled = true) => flow.mutateFlow(owner.id, { action: "share", planId: plan.id, revision: (await latest()).plan.revision!, enabled });
    const open = async () => { const result = await share(); const token = new URL(result.link!, "https://example.test").searchParams.get("token")!; return { token, result }; };
    let token = "";
    await t.test("Share does not require the new workflow and changes no completion or source fields", async () => {
      const result = await open(); token = result.token;
      assert(result.result.link?.startsWith("/task-report/" + plan.id)); assert.equal(result.result.shared, true);
      const report = await flow.reportAccess(plan.id, undefined, token);
      assert.equal(report.kind, "legacy");
      if (report.kind === "legacy") { assert.equal(report.tasks.length, 2); assert.equal(report.tasks.filter(task => task.done).length, 1); assert.deepEqual([...report.tasks[0].findings], ["Saved headline 0", "Saved headline 1", "Saved headline 2"]); }
      assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|password|userId|taskWorkspace|taskFinding/);
      assert.equal(JSON.stringify(await db.actionItem.findMany({ where: { actionPlanId: plan.id }, orderBy: { id: "asc" } })), original);
      const stored = JSON.stringify((await db.setting.findUniqueOrThrow({ where: { key: "legacy_report_share:" + plan.id } })).value);
      assert(!stored.includes(token)); assert(!stored.includes("Saved headline"));
    });
    await t.test("Owner preview works; missing, malformed or foreign tokens and foreign writes fail", async () => {
      assert.equal((await flow.reportAccess(plan.id, owner.id)).kind, "legacy");
      await assert.rejects(flow.reportAccess(plan.id), /disabled/);
      await assert.rejects(flow.reportAccess(plan.id, other.id), /disabled/);
      await assert.rejects(flow.reportAccess(plan.id, undefined, "x".repeat(43)), /disabled/);
      await assert.rejects(flow.mutateFlow(other.id, { action: "share", enabled: true, planId: plan.id, revision: (await latest()).plan.revision! }), /not found/);
    });
    await t.test("Stale sharing rolls back and a replacement link invalidates the previous token", async () => {
      const revision = (await latest()).plan.revision!;
      const replacement = await open();
      await assert.rejects(flow.mutateFlow(owner.id, { action: "share", enabled: true, planId: plan.id, revision }), /changed/);
      await assert.rejects(flow.reportAccess(plan.id, undefined, token), /disabled/);
      token = replacement.token; assert.equal((await flow.reportAccess(plan.id, undefined, token)).kind, "legacy");
    });
    await t.test("Revocation and expiry stop actual public access", async () => {
      await share(false); await assert.rejects(flow.reportAccess(plan.id, undefined, token), /disabled/);
      assert.equal((await latest()).shared, false);
      token = (await open()).token;
      const row = await db.setting.findUniqueOrThrow({ where: { key: "legacy_report_share:" + plan.id } });
      await db.setting.update({ where: { key: row.key }, data: { value: { ...(row.value as object), expires: new Date(Date.now() - 1).toISOString() } } });
      await assert.rejects(flow.reportAccess(plan.id, undefined, token), /disabled/);
    });
    await t.test("Published changes and archiving invalidate links; completed history remains intact", async () => {
      token = (await open()).token;
      await db.actionItem.update({ where: { id: pending.id }, data: { title: "Updated pending task" } });
      await assert.rejects(flow.reportAccess(plan.id, undefined, token), /disabled/);
      token = (await open()).token;
      await db.actionPlan.update({ where: { id: plan.id }, data: { archivedAt: new Date(), activeKey: null } });
      await assert.rejects(flow.reportAccess(plan.id, undefined, token), /disabled/);
      assert.equal(JSON.stringify(await db.actionItem.findUniqueOrThrow({ where: { id: done.id } })), JSON.stringify(done));
    });
  } finally {
    if (planId) await db.setting.deleteMany({ where: { key: "legacy_report_share:" + planId } });
    await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect();
  }
});
