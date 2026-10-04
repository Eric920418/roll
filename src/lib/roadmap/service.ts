import { logSecurityError } from "@/lib/security/log";
import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Account } from "@/lib/auth/account";
import { reserveAiUsage, completeAiUsage } from "@/lib/ai/allowance";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";
import { getActiveActionPlan, serializePlan, lockActivePlan, actionRecord, PlanWriteError } from "@/lib/action-plan/service";
import { structuredDraft } from "@/lib/check-ins/ai";
import { correctionSchema, validateCorrection } from "./corrections";
import { generateRoadmap } from "./ai";
import { roadmapDraftSchema, dateSchema, today, goalDeadline, type RoadmapDraft, type roadmapPostSchema, type roadmapPatchSchema, type outcomePatchSchema } from "./schema";
import { z } from "zod";

export const LOCK_MS = 360_000;
const asJson = (value: unknown) => value as Prisma.InputJsonValue;
const conflict = () => new PlanWriteError("草稿已被另一分頁更新，請重新載入；你的輸入仍保留。 / Draft changed in another tab. Reload; your input is preserved.");
const includes = { milestones: true, actions: { include: { dependencies: { select: { minimumCurrent: true, dependsOn: { select: { id: true, clientKey: true, title: true, done: true, metricCurrent: true, metricUnit: true } } } } } } } as const;

export async function getRoadmapHistory(userId: string, historyId: string) {
  const plan = await prisma.actionPlan.findFirst({ where: { id: historyId, userId }, include: includes });
  if (!plan) throw new PlanWriteError("找不到計畫 / Plan not found", 404);
  return { plan: serializePlan(plan), archived: Boolean(plan.archivedAt) };
}
export async function getRoadmap(userId: string) {
  const [workspace, active, history] = await Promise.all([
    prisma.roadmapWorkspace.findUnique({ where: { userId } }), getActiveActionPlan(userId),
    prisma.actionPlan.findMany({ where: { userId, archivedAt: { not: null } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, goal: true, createdAt: true, archivedAt: true } }),
  ]);
  const parsed = roadmapDraftSchema.safeParse(workspace?.draft);
  return { revision: workspace?.revision || 0, input: workspace?.input || null, draft: parsed.success ? parsed.data : null, correction: correctionSchema.safeParse(workspace?.draft).success ? correctionSchema.parse(workspace?.draft) : null, active, history: history.map(p => ({ ...p, createdAt: p.createdAt.toISOString(), archivedAt: p.archivedAt!.toISOString() })), pending: Boolean(workspace?.pendingSince && workspace.pendingRequestId && Date.now() - workspace.pendingSince.getTime() < LOCK_MS), error: workspace?.lastError || null, lastRequestId: workspace?.lastRequestId || null };
}
export type RoadmapView = Awaited<ReturnType<typeof getRoadmap>>;

async function ensureWorkspace(userId: string) {
  let workspace = await prisma.roadmapWorkspace.upsert({ where: { userId }, create: { userId }, update: {} });
  if (workspace.pendingRequestId && workspace.pendingSince && Date.now() - workspace.pendingSince.getTime() >= LOCK_MS) {
    const expired = await prisma.roadmapWorkspace.updateMany({ where: { userId, revision: workspace.revision, pendingRequestId: workspace.pendingRequestId }, data: { pendingRequestId: null, pendingSince: null, usageId: null } });
    if (expired.count && workspace.usageId) await completeAiUsage(workspace.usageId, false);
    workspace = await prisma.roadmapWorkspace.findUniqueOrThrow({ where: { userId } });
  }
  return workspace;
}
export async function runRoadmap(account: Account, input: z.infer<typeof roadmapPostSchema>) {
  if (input.action === "review") return runCorrection(account, input);
  const userId = account.id, workspace = await ensureWorkspace(userId);
  if (workspace.lastRequestId === input.requestId) return getRoadmap(userId);
  if (workspace.pendingRequestId) throw new PlanWriteError("正在生成，請稍候再載入。 / Generation is in progress. Reload shortly.");
  if (workspace.revision !== input.revision) throw conflict();
  const active = await getActiveActionPlan(userId);
  let goal: string, startsAt: string, deadline: string, milestoneId: string | undefined;
  if (input.action === "next") {
    if (!active?.roadmap || active.id !== input.planId || active.revision !== input.planRevision) throw new PlanWriteError("計畫已更新，請重新載入。 / Plan changed; reload.");
    const milestone = active.roadmap.milestones.find(m => m.id === input.milestoneId);
    if (!milestone || milestone.status !== "unplanned") throw new PlanWriteError("需先確認前階段成果，且此階段尚未建立任務。 / Confirm the previous outcome first; this stage must have no tasks.");
    ({ goal, startsAt, deadline } = active.roadmap); milestoneId = milestone.id;
  } else {
    goal = input.goal; startsAt = today(); deadline = goalDeadline(goal, input.deadline, startsAt);
    if (!dateSchema.safeParse(deadline).success) throw new PlanWriteError("目標文字中的日期無效，請選擇有效期限 / Invalid date in the goal; choose a valid deadline", 400);
    if (deadline <= startsAt) throw new PlanWriteError("期限必須在今天之後 / Deadline must be after today", 400);
  }
  const claimed = await prisma.roadmapWorkspace.updateMany({ where: { userId, revision: input.revision, pendingRequestId: null }, data: { input: asJson(input), basePlanId: active?.id || null, basePlanRevision: active?.revision ?? null, revision: { increment: 1 }, pendingRequestId: input.requestId, pendingSince: new Date(), lastError: null } });
  if (!claimed.count) throw conflict();
  let usageId: string | null = null, success = false;
  try {
    const limit = await checkRateLimit(`roadmap:${userId}`, 10, DAY_MS, false);
    if (!limit.ok) throw new PlanWriteError("已達每日 10 次規劃上限，請明天再試。 / Daily roadmap limit reached (10).", 429);
    usageId = await reserveAiUsage(account);
    if (!usageId) throw new PlanWriteError("本月 AI 額度不足，輸入已保留。 / AI allowance exhausted; your input is saved.", 429);
    const attached = await prisma.roadmapWorkspace.updateMany({ where: { userId, pendingRequestId: input.requestId, revision: input.revision + 1 }, data: { usageId } });
    if (!attached.count) throw conflict();
    const draft = roadmapDraftSchema.parse(await generateRoadmap({ account, current: active, goal, startsAt, deadline, locale: input.locale, milestoneId }));
    const saved = await prisma.roadmapWorkspace.updateMany({ where: { userId, pendingRequestId: input.requestId, revision: input.revision + 1 }, data: { draft: asJson(draft), lastRequestId: input.requestId, pendingRequestId: null, pendingSince: null, usageId: null, lastError: null } });
    if (!saved.count) throw conflict();
    success = true;
    return await getRoadmap(userId);
  } catch (cause) {
    const timeout = cause instanceof Error && /timeout|timed out/i.test(cause.name + cause.message);
    const error = cause instanceof PlanWriteError ? cause : new PlanWriteError(timeout ? "AI 規劃逾時，輸入與原草稿已保留，請重試。 / AI timed out; your input and previous draft are saved. Retry." : "AI 未能完成有效規劃，輸入與原草稿已保留，請重試。 / AI could not complete a valid roadmap. Your input and previous draft are saved; retry.", timeout ? 504 : 422);
    if (!(cause instanceof PlanWriteError)) logSecurityError("[roadmap] generation failed", cause);
    await prisma.roadmapWorkspace.updateMany({ where: { userId, pendingRequestId: input.requestId, revision: input.revision + 1 }, data: { pendingRequestId: null, pendingSince: null, usageId: null, lastError: error.message } });
    throw error;
  } finally { if (usageId) await completeAiUsage(usageId, success); }
}

async function insertActions(tx: Prisma.TransactionClient, planId: string, milestoneId: string, draft: RoadmapDraft, offset: number) {
  const ids = new Map(draft.actions.map(a => [a.clientKey, randomUUID()]));
  await tx.actionItem.createMany({ data: draft.actions.map((a, i) => ({ ...actionRecord(a, ids.get(a.clientKey)!, `task_${offset + i + 1}`, milestoneId), actionPlanId: planId })) });
  const edges = draft.actions.flatMap(a => a.dependsOnKeys.map(key => ({ actionId: ids.get(a.clientKey)!, dependsOnId: ids.get(key)! })));
  if (edges.length) await tx.actionDependency.createMany({ data: edges });
}
export async function patchRoadmap(userId: string, input: z.infer<typeof roadmapPatchSchema>) {
  if ("correction" in input) return patchCorrection(userId, input);
  await ensureWorkspace(userId);
  await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    const workspace = await tx.roadmapWorkspace.findUniqueOrThrow({ where: { userId } });
    if (workspace.lastRequestId === input.requestId) return;
    const parsed = roadmapDraftSchema.safeParse(workspace.draft);
    if (!parsed.success) throw new PlanWriteError("請先生成草稿 / Generate a draft first", 400);
    // Stage identity is server-owned: editing cannot turn an append into a replacement or choose another stage.
    if (parsed.data.mode !== input.draft.mode || parsed.data.milestoneId !== input.draft.milestoneId) throw new PlanWriteError("不可修改草稿階段 / Draft stage cannot be changed", 400);
    const claimed = await tx.roadmapWorkspace.updateMany({ where: { userId, revision: input.revision, pendingRequestId: null }, data: { revision: { increment: 1 }, draft: asJson(input.draft), lastRequestId: input.requestId, lastError: null } });
    if (!claimed.count) throw conflict();
    if (input.action === "edit") return;
    const draft = input.draft;
    const active = await tx.actionPlan.findFirst({ where: { userId, activeKey: userId, archivedAt: null }, include: { milestones: true, actions: true } });
    if ((active?.id || null) !== workspace.basePlanId || (active?.revision ?? null) !== workspace.basePlanRevision) throw new PlanWriteError("目前計畫已變更，請重新生成草稿再確認；編輯已保留。 / Current plan changed. Regenerate before activation; your edits are preserved.");
    if (active) await lockActivePlan(tx, userId, active.id, workspace.basePlanRevision!);
    if (draft.mode === "next") {
      if (!active?.goal || active.goal !== draft.goal || active.goalStartsAt?.toISOString().slice(0, 10) !== draft.startsAt || active.goalDeadline?.toISOString().slice(0, 10) !== draft.deadline) throw new PlanWriteError("下一階段不可更換目標或期限 / The next stage cannot change the goal or horizon", 400);
      const stage = active.milestones.find(m => m.id === draft.milestoneId);
      if (!stage || stage.achievedAt || active.actions.some(a => a.milestoneId === stage.id) || active.milestones.some(m => m.position < stage.position && !m.achievedAt)) throw new PlanWriteError("階段已更新或尚未解鎖 / Stage changed or is not unlocked");
      if (active.actions.length + draft.actions.length > 100) throw new PlanWriteError("每份計畫最多 100 項任務 / Maximum 100 tasks per plan");
      if (draft.actions.some(a => active.actions.some(old => old.title.trim().toLocaleLowerCase() === a.title.trim().toLocaleLowerCase()))) throw new PlanWriteError("任務與先前階段重複，請修改或重新生成 / A task repeats an earlier stage; edit or regenerate", 400);
      if (active.actions.some(a => a.impact === "Critical") && draft.actions.some(a => a.impact === "Critical")) throw new PlanWriteError("每份計畫最多一項 Critical，請調整任務 / Maximum one Critical impact per plan; adjust the tasks", 400);
      const offset = Math.max(0, ...active.actions.map(a => Number(/^task_(\d+)$/.exec(a.clientKey)?.[1]) || 0));
      await insertActions(tx, active.id, stage.id, draft, offset);
    } else {
      if (draft.deadline <= today()) throw new PlanWriteError("目標期限已過，請調整日期 / The deadline has passed; adjust the dates", 400);
      if (active) await tx.actionPlan.update({ where: { id: active.id }, data: { activeKey: null, archivedAt: new Date() } });
      const plan = await tx.actionPlan.create({ data: { userId, locale: input.locale, requestId: input.requestId, activeKey: userId, ...draft.diagnosis, goal: draft.goal, goalStartsAt: new Date(draft.startsAt), goalDeadline: new Date(draft.deadline), goalAssumptions: asJson(draft.assumptions), milestones: { create: draft.milestones.map((m, position) => ({ ...m, position, targetDate: new Date(m.targetDate) })) } }, include: { milestones: { orderBy: { position: "asc" } } } });
      await insertActions(tx, plan.id, plan.milestones[0].id, draft, 0);
    }
    await tx.roadmapWorkspace.update({ where: { userId }, data: { draft: Prisma.DbNull } });
  });
  return getRoadmap(userId);
}
export async function confirmMilestone(userId: string, id: string, input: z.infer<typeof outcomePatchSchema>) {
  const found = await prisma.planMilestone.findFirst({ where: { id, actionPlan: { userId, activeKey: userId, archivedAt: null } }, select: { actionPlanId: true } });
  if (!found) throw new PlanWriteError("找不到里程碑 / Milestone not found", 404);
  await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    await lockActivePlan(tx, userId, found.actionPlanId, input.revision);
    const stages = await tx.planMilestone.findMany({ where: { actionPlanId: found.actionPlanId }, include: { actions: true }, orderBy: { position: "asc" } });
    const stage = stages.find(m => m.id === id)!;
    if (input.achieved) {
      if (!input.outcomeNote) throw new PlanWriteError("請填寫實際成果說明 / Describe the actual result", 400);
      if (stages.some(m => m.position < stage.position && !m.achievedAt) || !stage.actions.length || stage.actions.some(a => !a.done)) throw new PlanWriteError("請先完成前階段成果確認與本階段任務 / Confirm previous milestones and complete this stage's tasks first");
    } else if (stages.some(m => m.position > stage.position && (m.achievedAt || m.actions.some(a => a.done)))) throw new PlanWriteError("請先撤銷後續階段的完成紀錄 / Undo later stage completions first");
    await tx.planMilestone.update({ where: { id }, data: { achievedAt: input.achieved ? new Date() : null, outcomeNote: input.achieved ? input.outcomeNote : null } });
  });
  return getRoadmap(userId);
}

async function runCorrection(account: Account, input: Extract<z.infer<typeof roadmapPostSchema>, { action: "review" }>) {
  const userId = account.id, active = await getActiveActionPlan(userId);
  if (!active || active.id !== input.planId) throw new PlanWriteError("找不到本人計畫 / Plan not found", 404);
  const workspace = await ensureWorkspace(userId);
  if (workspace.lastRequestId === input.requestId) return getRoadmap(userId);
  if (workspace.revision !== input.revision || workspace.pendingRequestId) throw conflict();
  const current = active.roadmap?.milestones.find(m => !m.achievedAt);
  if (!active || active.id !== input.planId || active.revision !== input.planRevision || !current || !active.actions.some(a => a.milestoneId === current.id && !a.done)) throw new PlanWriteError("請先建立當期未完成任務，或重新載入計畫 / Create current-stage unfinished tasks or reload the plan");
  const claim = await prisma.roadmapWorkspace.updateMany({ where: { userId, revision: input.revision, pendingRequestId: null }, data: { input: asJson(input), basePlanId: active.id, basePlanRevision: active.revision, revision: { increment: 1 }, pendingRequestId: input.requestId, pendingSince: new Date(), lastError: null } });
  if (!claim.count) throw conflict();
  let usageId: string | null = null, success = false;
  try {
    if (!(await checkRateLimit(`roadmap:${userId}`, 10, DAY_MS, false)).ok) throw new PlanWriteError("已達每日規劃上限 / Daily roadmap limit reached", 429);
    usageId = await reserveAiUsage(account);
    if (!usageId) throw new PlanWriteError("AI 額度不足；原任務保留 / AI allowance exhausted; existing tasks are preserved", 429);
    const attach = await prisma.roadmapWorkspace.updateMany({ where: { userId, revision: input.revision + 1, pendingRequestId: input.requestId }, data: { usageId } });
    if (!attach.count) throw conflict();
    const eligibleIds = active.actions.filter(a => a.milestoneId === current.id && !a.done).map(a => a.id);
    const dependencyIds = active.actions.filter(a => (a.milestonePosition ?? -1) <= current.position).map(a => a.id);
    const constrained = correctionSchema.extend({ milestoneId: z.literal(current.id), changes: z.array(correctionSchema.shape.changes.element.extend({ actionId: z.enum(eligibleIds as [string, ...string[]]), dependencyActionIds: z.array(z.enum(dependencyIds as [string, ...string[]])).max(20) })).max(eligibleIds.length) });
    const draft = validateCorrection(await structuredDraft(constrained, "review_stage", `You are POLARIS. Write in ${input.locale}. Review scope against ALL milestones. Correct ONLY unfinished tasks in the supplied current milestone, retaining their actual actionId. Do not delete, move or change completed tasks or later milestones. Identify overlapping work reserved for later stages: customer discovery should focus on ICP interviews, leaving paid pilot experiments for a later paid-validation milestone when present. Propose genuinely distinct actionable replacements, titles/outcomes/whyNow/dependencies and a clear reason for each change. No changes needed: return an empty changes array. Dependency IDs must be actual existing tasks from this or earlier stages, acyclic. Numeric targets are suggestions, not existing achievements.`, { profile: account.profile, currentMilestoneId: current.id, plan: active }, candidate => validateCorrection(candidate, active)), active);
    await prisma.$transaction(async raw => {
      const tx = raw as unknown as Prisma.TransactionClient;
      if (!(await tx.actionPlan.updateMany({ where: { id: active.id, userId, activeKey: userId, archivedAt: null, revision: input.planRevision }, data: { revision: input.planRevision } })).count) throw conflict();
      const saved = await tx.roadmapWorkspace.updateMany({ where: { userId, revision: input.revision + 1, pendingRequestId: input.requestId }, data: { draft: asJson(draft), lastRequestId: input.requestId, pendingRequestId: null, pendingSince: null, usageId: null, lastError: null } });
      if (!saved.count) throw conflict();
    });
    success = true; return await getRoadmap(userId);
  } catch (cause) {
    const timeout = cause instanceof Error && /timeout|timed out/i.test(cause.name + cause.message);
    const error = cause instanceof PlanWriteError ? cause : new PlanWriteError(timeout ? "AI 檢查逾時；原任務保留，請重試 / Review timed out; tasks preserved. Retry." : "AI 未產生有效修正；原任務保留，請重試 / Invalid correction; tasks preserved. Retry.", timeout ? 504 : 422);
    if (!(cause instanceof PlanWriteError)) logSecurityError("[roadmap correction]", cause);
    await prisma.roadmapWorkspace.updateMany({ where: { userId, revision: input.revision + 1, pendingRequestId: input.requestId }, data: { pendingRequestId: null, pendingSince: null, usageId: null, lastError: error.message } });
    throw error;
  } finally { if (usageId) await completeAiUsage(usageId, success); }
}
async function patchCorrection(userId: string, input: Extract<z.infer<typeof roadmapPatchSchema>, { correction: unknown }>) {
  await ensureWorkspace(userId);
  await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    const workspace = await tx.roadmapWorkspace.findUniqueOrThrow({ where: { userId } });
    if (workspace.lastRequestId === input.requestId) return;
    const original = correctionSchema.safeParse(workspace.draft);
    if (!original.success || original.data.milestoneId !== input.correction.milestoneId) throw new PlanWriteError("請先產生當期修正草稿 / Generate a stage correction draft first", 400);
    if (input.correction.changes.some(c => !original.data.changes.some(o => o.actionId === c.actionId))) throw new PlanWriteError("不可新增非草稿修正目標 / Cannot add correction targets", 400);
    const claimed = await tx.roadmapWorkspace.updateMany({ where: { userId, revision: input.revision, pendingRequestId: null }, data: { revision: { increment: 1 }, lastRequestId: input.requestId, draft: asJson(input.correction), lastError: null } });
    if (!claimed.count) throw conflict();
    if (input.action === "editCorrection") return;
    const record = await tx.actionPlan.findFirst({ where: { id: workspace.basePlanId || "", userId, activeKey: userId, archivedAt: null }, include: includes });
    if (!record || record.revision !== workspace.basePlanRevision) throw conflict();
    try { validateCorrection(input.correction, serializePlan(record)); } catch (cause) { throw new PlanWriteError(cause instanceof Error ? cause.message : "無效修正 / Invalid correction", 400); }
    await lockActivePlan(tx, userId, record.id, workspace.basePlanRevision!);
    // Validate the complete proposed graph before applying any edge changes.
    for (const change of input.correction.changes) {
      await tx.actionItem.update({ where: { id: change.actionId }, data: { title: change.title, expectedOutcome: change.expectedOutcome, bottleneckFitReason: change.whyNow, bottleneckFitEditedByUser: true, bottleneckFitConfidence: null, dependencyLevel: change.dependencyActionIds.length ? 1 : 0 } });
      const thresholds = await tx.actionDependency.findMany({ where: { actionId: change.actionId }, select: { dependsOnId: true, minimumCurrent: true } });
      await tx.actionDependency.deleteMany({ where: { actionId: change.actionId } });
      if (change.dependencyActionIds.length) await tx.actionDependency.createMany({ data: change.dependencyActionIds.map(dependsOnId => ({ actionId: change.actionId, dependsOnId, minimumCurrent: thresholds.find(e => e.dependsOnId === dependsOnId)?.minimumCurrent ?? null })) });
    }
    await tx.roadmapWorkspace.update({ where: { userId }, data: { draft: Prisma.DbNull } });
  });
  return getRoadmap(userId);
}
