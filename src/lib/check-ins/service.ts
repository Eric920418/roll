import { dependencySatisfied } from "@/lib/action-plan/dependency";
import { logSecurityError } from "@/lib/security/log";
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Account } from "@/lib/auth/account";
import { getActiveActionPlan, serializePlan, lockActivePlan, guardActionMilestone, PlanWriteError } from "@/lib/action-plan/service";
import { reserveAiUsage, completeAiUsage } from "@/lib/ai/allowance";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";
import { taipeiWeek, taskSnapshot, weeklySummary, weeklyOutputSchema, type CheckInRequest } from "./schema";
import { generateWeekly } from "./ai";
const json = (value: unknown) => value as Prisma.InputJsonValue;
const includes = { milestones: true, actions: { include: { dependencies: { select: { minimumCurrent: true, dependsOn: { select: { id: true, clientKey: true, title: true, done: true, metricCurrent: true, metricUnit: true } } } } } } } as const;
const conflict = () => new PlanWriteError("計畫或週記已更新，請重新載入；輸入保留。 / Plan or check-in changed. Reload; your input is preserved.");
const editable = (row: { weekStart: Date }, archived: Date | null) => {
  if (archived || row.weekStart.toISOString().slice(0, 10) !== taipeiWeek()) throw new PlanWriteError("歷史週記或封存計畫為唯讀 / Historical check-ins and archived plans are read-only");
};
async function expire(userId: string) {
  const stale = await prisma.weeklyCheckIn.findMany({ where: { userId, pendingSince: { lte: new Date(Date.now() - 180000) }, pendingRequestId: { not: null } } });
  for (const row of stale) {
    const cleared = await prisma.weeklyCheckIn.updateMany({ where: { id: row.id, userId, revision: row.revision, pendingRequestId: row.pendingRequestId }, data: { pendingRequestId: null, pendingSince: null, usageId: null, lastError: "AI 生成逾時；回報已保留，請重試 / AI generation expired; your report is saved. Retry." } });
    if (cleared.count && row.usageId) await completeAiUsage(row.usageId, false);
  }
}
export async function getCheckIns(userId: string, planId?: string | null) {
  await expire(userId);
  const plan = planId ? await prisma.actionPlan.findFirst({ where: { id: planId, userId }, select: { id: true, archivedAt: true } }) : await prisma.actionPlan.findFirst({ where: { userId, activeKey: userId, archivedAt: null }, select: { id: true, archivedAt: true } });
  if (planId && !plan) throw new PlanWriteError("找不到計畫 / Plan not found", 404);
  const history = plan ? await prisma.weeklyCheckIn.findMany({ where: { userId, actionPlanId: plan.id }, orderBy: { weekStart: "desc" }, take: 104 }) : [];
  const week = taipeiWeek();
  const rows = history.map(r => ({ id: r.id, actionPlanId: r.actionPlanId, weekStart: r.weekStart.toISOString().slice(0, 10), finding: r.finding, blockers: r.blockers, snapshot: r.snapshot, summary: r.summary, output: weeklyOutputSchema.safeParse(r.recommendations).success ? weeklyOutputSchema.parse(r.recommendations) : null, investorDraft: r.investorDraft, revision: r.revision, basePlanRevision: r.basePlanRevision, pending: Boolean(r.pendingRequestId), lastRequestId: r.lastRequestId, error: r.lastError, readOnly: Boolean(plan?.archivedAt) || r.weekStart.toISOString().slice(0, 10) !== week }));
  return { planId: plan?.id || null, weekStart: week, readOnly: Boolean(plan?.archivedAt), current: rows.find(r => r.weekStart === week) || null, history: rows, active: await getActiveActionPlan(userId) };
}
export type CheckInView = Awaited<ReturnType<typeof getCheckIns>>;
export async function saveCheckIn(userId: string, input: Extract<CheckInRequest, { action: "save" }>) {
  const week = taipeiWeek();
  if (input.weekStart !== week) throw conflict();
  const weekStart = new Date(week);
  if (new Set(input.metrics.map(m => m.actionId)).size !== input.metrics.length) throw new PlanWriteError("數量任務不可重複 / Duplicate metric tasks", 400);
  try {
    await prisma.$transaction(async raw => {
      const tx = raw as unknown as Prisma.TransactionClient;
      const existing = await tx.weeklyCheckIn.findUnique({ where: { userId_actionPlanId_weekStart: { userId, actionPlanId: input.planId, weekStart } } });
      if (existing?.lastRequestId === input.requestId) return;
      if ((existing?.revision || 0) !== input.revision || existing?.pendingRequestId) throw conflict();
      await lockActivePlan(tx, userId, input.planId, input.planRevision);
      const plan = await tx.actionPlan.findUniqueOrThrow({ where: { id: input.planId }, include: includes });
      for (const m of input.metrics) {
        const task = plan.actions.find(a => a.id === m.actionId);
        if (!task || (m.current != null && !task.metricUnit)) throw new PlanWriteError("請先確認數量目標與單位 / Confirm the metric target and unit first", 400);
        if (task.metricCurrent === m.current) continue;
        const unresolved = task.dependencies.some(edge => !dependencySatisfied({ ...edge, dependsOn: { ...edge.dependsOn, metricCurrent: input.metrics.some(change => change.actionId === edge.dependsOn.id) ? input.metrics.find(change => change.actionId === edge.dependsOn.id)!.current : edge.dependsOn.metricCurrent } }));
        if (m.current != null && m.current > (task.metricCurrent ?? -1) && (unresolved || (task.dependencyLevel > 0 && task.dependencies.length === 0))) throw new PlanWriteError("請先達成前置條件，再增加本任務進度。 / Resolve prerequisites before increasing this task’s progress.", 409);
        const invalidated = plan.actions.filter(dependent => dependent.done && dependent.dependencies.some(edge => edge.dependsOn.id === task.id && edge.minimumCurrent != null && (m.current == null || m.current < edge.minimumCurrent)));
        if (invalidated.length) throw new PlanWriteError(`請先撤銷後續任務完成 / Undo completed dependent tasks first: ${invalidated.map(a => a.title).join(", ")}`, 409);
        await guardActionMilestone(tx, plan.id, task.milestoneId, "edit");
        await tx.actionItem.update({ where: { id: m.actionId }, data: { metricCurrent: m.current } }); task.metricCurrent = m.current;
      }
      if (taipeiWeek() !== week) throw conflict();
      // Dependencies in the loaded graph must reflect metric edits in this transaction.
      for (const task of plan.actions) for (const edge of task.dependencies) { const updated = plan.actions.find(a => a.id === edge.dependsOn.id); if (updated) edge.dependsOn.metricCurrent = updated.metricCurrent; }
      const snapshot = taskSnapshot(serializePlan(plan));
      const data = { finding: input.finding, blockers: input.blockers, snapshot: json(snapshot), summary: weeklySummary(snapshot, week, input.finding, input.blockers), basePlanRevision: input.planRevision + 1, recommendations: Prisma.DbNull, investorDraft: null, lastRequestId: input.requestId, lastError: null };
      if (existing) {
        const changed = await tx.weeklyCheckIn.updateMany({ where: { id: existing.id, revision: input.revision, pendingRequestId: null }, data: { ...data, revision: { increment: 1 } } });
        if (!changed.count) throw conflict();
      } else await tx.weeklyCheckIn.create({ data: { userId, actionPlanId: input.planId, weekStart, revision: 1, ...data } });
    });
  } catch (cause) {
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "P2002") throw conflict();
    throw cause;
  }
  return getCheckIns(userId, input.planId);
}
export async function generateCheckIn(account: Account, input: Extract<CheckInRequest, { action: "generate" }>) {
  await expire(account.id);
  const row = await prisma.weeklyCheckIn.findFirst({ where: { id: input.id, userId: account.id }, include: { actionPlan: { select: { archivedAt: true } } } });
  if (!row) throw new PlanWriteError("找不到週記 / Check-in not found", 404);
  if (row.lastRequestId === input.requestId) return getCheckIns(account.id, row.actionPlanId);
  editable(row, row.actionPlan.archivedAt);
  const plan = await getActiveActionPlan(account.id);
  if (!plan || plan.id !== row.actionPlanId || plan.revision !== input.planRevision || row.basePlanRevision !== input.planRevision) throw conflict();
  const claim = await prisma.weeklyCheckIn.updateMany({ where: { id: row.id, userId: account.id, revision: input.revision, pendingRequestId: null }, data: { pendingRequestId: input.requestId, pendingSince: new Date(), revision: { increment: 1 }, lastError: null } });
  if (!claim.count) throw conflict();
  let usageId: string | null = null, success = false;
  try {
    if (!(await checkRateLimit(`check-in:${account.id}`, 10, DAY_MS, false)).ok) throw new PlanWriteError("已達每日 10 次生成上限 / Daily generation limit reached (10)", 429);
    usageId = await reserveAiUsage(account);
    if (!usageId) throw new PlanWriteError("AI 額度不足；回報已保存，可稍後重試 / AI allowance exhausted; your report is saved. Retry later.", 429);
    const attach = await prisma.weeklyCheckIn.updateMany({ where: { id: row.id, pendingRequestId: input.requestId, revision: input.revision + 1 }, data: { usageId } });
    if (!attach.count) throw conflict();
    const output = await generateWeekly(account, plan, row, input.locale);
    await prisma.$transaction(async raw => {
      const tx = raw as unknown as Prisma.TransactionClient;
      // Lock without changing the plan: generation must never reorder or archive tasks.
      const lock = await tx.actionPlan.updateMany({ where: { id: plan.id, userId: account.id, activeKey: account.id, archivedAt: null, revision: input.planRevision }, data: { revision: input.planRevision } });
      if (!lock.count) throw conflict();
      editable(row, null);
      const saved = await tx.weeklyCheckIn.updateMany({ where: { id: row.id, userId: account.id, revision: input.revision + 1, pendingRequestId: input.requestId }, data: { recommendations: json(output), investorDraft: output.investorDraft, pendingRequestId: null, pendingSince: null, usageId: null, lastRequestId: input.requestId, lastError: null } });
      if (!saved.count) throw conflict();
    });
    success = true;
    return await getCheckIns(account.id, row.actionPlanId);
  } catch (cause) {
    const timeout = cause instanceof Error && /timeout|timed out/i.test(cause.name + cause.message);
    const error = cause instanceof PlanWriteError ? cause : new PlanWriteError(timeout ? "AI 逾時；回報及原排序已保留，請重試 / AI timed out; report and order are saved. Retry." : "AI 未產生有效週報；回報及原排序已保留，請重試 / Invalid AI weekly draft; report and order are saved. Retry.", timeout ? 504 : 422);
    if (!(cause instanceof PlanWriteError)) logSecurityError("[check-in] generation", cause);
    await prisma.weeklyCheckIn.updateMany({ where: { id: row.id, pendingRequestId: input.requestId, revision: input.revision + 1 }, data: { pendingRequestId: null, pendingSince: null, usageId: null, lastError: error.message } });
    throw error;
  } finally { if (usageId) await completeAiUsage(usageId, success); }
}
export async function patchCheckIn(userId: string, input: Extract<CheckInRequest, { action: "edit" | "apply" }>) {
  let planId = "";
  await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    const row = await tx.weeklyCheckIn.findFirst({ where: { id: input.id, userId }, include: { actionPlan: { select: { archivedAt: true } } } });
    if (!row) throw new PlanWriteError("找不到週記 / Check-in not found", 404);
    planId = row.actionPlanId;
    if (row.lastRequestId === input.requestId) return;
    editable(row, row.actionPlan.archivedAt);
    if (row.revision !== input.revision || row.pendingRequestId) throw conflict();
    if (input.action === "apply") {
      if (row.basePlanRevision !== input.planRevision) throw conflict();
      await lockActivePlan(tx, userId, planId, input.planRevision);
      const record = await tx.actionPlan.findUniqueOrThrow({ where: { id: planId }, include: includes });
      const plan = serializePlan(record), output = weeklyOutputSchema.safeParse(row.recommendations);
      if (!output.success || !output.data.nextActionIds.length) throw new PlanWriteError("沒有可套用的建議 / No recommendations to apply", 400);
      const ready = new Set(plan.nextMoves.concat(plan.actions.filter(a => !a.done && !a.dependency.blocked)).map(a => a.id));
      if (output.data.nextActionIds.some(id => !ready.has(id))) throw conflict();
      const map = new Map(plan.actions.map(a => [a.id, a])), ids: string[] = [], seen = new Set<string>();
      const visit = (id: string) => { if (seen.has(id)) return; seen.add(id); for (const dep of map.get(id)!.dependency.actionIds) visit(dep); ids.push(id); };
      for (const id of output.data.nextActionIds) visit(id);
      for (const a of plan.actions) visit(a.id);
      for (const [order, id] of ids.entries()) await tx.actionItem.update({ where: { id }, data: { executionOrder: order } });
    }
    const changed = await tx.weeklyCheckIn.updateMany({ where: { id: row.id, userId, revision: input.revision, pendingRequestId: null }, data: { revision: { increment: 1 }, lastRequestId: input.requestId, ...(input.action === "edit" ? { investorDraft: input.investorDraft } : { basePlanRevision: input.planRevision + 1 }) } });
    if (!changed.count) throw conflict();
  });
  return getCheckIns(userId, planId);
}
