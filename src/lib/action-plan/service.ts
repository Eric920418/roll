import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { milestoneViews } from "@/lib/roadmap/schema";
import { prisma } from "@/lib/prisma";
import type { Diagnosis, GeneratedAction } from "./schemas";
import { rankActions, wouldCreateCycle, type ActionPlanActionDto } from "./ranking";
import { legacyHoursForMinutes } from "./time";

const actionInclude = {
  dependencies: {
    select: { dependsOn: { select: { id: true, clientKey: true, title: true, done: true } } },
  },
} as const;

export type ActionPlanDto = {
  id: string;
  locale: string;
  diagnosis: Diagnosis;
  createdAt: string;
  revision?: number;
  roadmap?: { goal: string; startsAt: string; deadline: string; assumptions: string[]; milestones: ReturnType<typeof milestoneViews> } | null;
  actions: ActionPlanActionDto[];
  nextMoves: ActionPlanActionDto[];
  blockers: Array<{ id: string; title: string; dependencies: string[]; missingLink: boolean }>;
};

type PlanWithActions = Awaited<ReturnType<typeof findActivePlanRecord>>;

async function findActivePlanRecord(userId: string) {
  return prisma.actionPlan.findFirst({
    where: { userId, activeKey: userId, archivedAt: null },
    include: { actions: { include: actionInclude }, milestones: true },
  });
}

export function serializePlan(plan: NonNullable<PlanWithActions>): ActionPlanDto {
  const milestones = milestoneViews(plan.milestones.map(m => ({ ...m, targetDate: m.targetDate.toISOString().slice(0, 10), achievedAt: m.achievedAt?.toISOString() || null })), plan.actions);
  const blocks = new Map(milestones.filter(m => m.status === "blocked").map(m => [m.id, m.title]));
  const actions = rankActions(plan.actions, blocks);
  return {
    id: plan.id,
    revision: plan.revision,
    roadmap: plan.goal && plan.goalStartsAt && plan.goalDeadline ? { goal: plan.goal, startsAt: plan.goalStartsAt.toISOString().slice(0, 10), deadline: plan.goalDeadline.toISOString().slice(0, 10), assumptions: Array.isArray(plan.goalAssumptions) ? plan.goalAssumptions.filter((v): v is string => typeof v === "string") : [], milestones } : null,
    locale: plan.locale,
    diagnosis: {
      companyStage: plan.companyStage as Diagnosis["companyStage"],
      stageReason: plan.stageReason,
      stageConfidence: plan.stageConfidence,
      bottleneckGroup: plan.bottleneckGroup as Diagnosis["bottleneckGroup"],
      bottleneckCode: plan.bottleneckCode,
      bottleneckReason: plan.bottleneckReason,
      bottleneckConfidence: plan.bottleneckConfidence,
    },
    createdAt: plan.createdAt.toISOString(),
    actions,
    nextMoves: actions.filter((action) => action.rank != null && action.rank <= 3),
    blockers: actions
      .filter((action) => !action.done && action.dependency.blocked)
      .map((action) => ({ id: action.id, title: action.title, dependencies: action.dependency.actionTitles, missingLink: action.dependency.missingLink })),
  };
}

export async function getActiveActionPlan(userId: string): Promise<ActionPlanDto | null> {
  const plan = await findActivePlanRecord(userId);
  return plan ? serializePlan(plan) : null;
}

export async function getPlanByRequestId(userId: string, requestId: string): Promise<ActionPlanDto | null> {
  const plan = await prisma.actionPlan.findUnique({
    where: { userId_requestId: { userId, requestId } },
    include: { actions: { include: actionInclude }, milestones: true },
  });
  return plan ? serializePlan(plan) : null;
}

export async function persistGeneratedPlan(input: {
  userId: string;
  locale: string;
  requestId: string;
  diagnosis: Diagnosis;
  actions: GeneratedAction[];
}): Promise<ActionPlanDto> {
  const existing = await getPlanByRequestId(input.userId, input.requestId);
  if (existing) return existing;

  const actionIds = new Map(input.actions.map((action) => [action.clientKey, randomUUID()]));
  let planId: string;
  try {
    planId = await prisma.$transaction(async (tx) => {
      const insideExisting = await tx.actionPlan.findUnique({
        where: { userId_requestId: { userId: input.userId, requestId: input.requestId } },
        select: { id: true },
      });
      if (insideExisting) return insideExisting.id;

      await tx.actionPlan.updateMany({
        where: { userId: input.userId, activeKey: input.userId, archivedAt: null },
        data: { activeKey: null, archivedAt: new Date(), revision: { increment: 1 } },
      });
      const plan = await tx.actionPlan.create({
        data: {
          userId: input.userId,
          locale: input.locale,
          ...input.diagnosis,
          requestId: input.requestId,
          activeKey: input.userId,
          actions: {
            create: input.actions.map(action => actionRecord(action, actionIds.get(action.clientKey)!)),
          },
        },
        select: { id: true },
      });
      const dependencies = input.actions.flatMap((action) =>
        action.dependsOnKeys.map((dependencyKey) => ({
          actionId: actionIds.get(action.clientKey)!,
          dependsOnId: actionIds.get(dependencyKey)!,
        })),
      );
      if (dependencies.length) await tx.actionDependency.createMany({ data: dependencies });
      return plan.id;
    });
  } catch (error) {
    // 同一 requestId 的併發重送，唯一鍵只會讓其中一筆成功；另一筆直接讀取已建立版本。
    const duplicate = error && typeof error === "object" && "code" in error && error.code === "P2002";
    if (!duplicate) throw error;
    const idempotent = await getPlanByRequestId(input.userId, input.requestId);
    if (idempotent) return idempotent;
    throw error;
  }

  const persisted = await prisma.actionPlan.findUnique({
    where: { id: planId },
    include: { actions: { include: actionInclude }, milestones: true },
  });
  if (!persisted) throw new Error("Action plan 寫入後無法讀取");
  return serializePlan(persisted);
}

export async function assertDependencies(input: {
  userId: string;
  planId: string;
  actionId: string;
  dependencyIds: string[];
  milestoneId?: string | null;
}, tx: Pick<Prisma.TransactionClient, "actionItem" | "planMilestone"> = prisma as unknown as Prisma.TransactionClient) {
  if (input.dependencyIds.includes(input.actionId)) throw new Error("Action 不可依賴自己");
  const actions = await tx.actionItem.findMany({
    where: { actionPlanId: input.planId, actionPlan: { userId: input.userId, activeKey: input.userId } },
    select: { id: true, milestoneId: true, dependencies: { select: { dependsOnId: true } } },
  });
  const valid = new Set(actions.map((action) => action.id));
  const missing = input.dependencyIds.filter((id) => !valid.has(id));
  if (missing.length) throw new Error("依賴 Action 不存在或不屬於目前計畫");
  const own = actions.find(a => a.id === input.actionId);
  const ownMilestone = own?.milestoneId || input.milestoneId;
  if (ownMilestone) {
    const stages = await tx.planMilestone.findMany({ where: { actionPlanId: input.planId }, select: { id: true, position: true } });
    const positions = new Map(stages.map(m => [m.id, m.position]));
    if (actions.some(a => input.dependencyIds.includes(a.id) && a.milestoneId && positions.get(a.milestoneId)! > positions.get(ownMilestone)!)) throw new PlanWriteError("不可依賴後續尚未解鎖階段的任務 / Cannot depend on a later milestone", 400);
  }
  const graph = new Map(actions.map((action) => [action.id, action.dependencies.map((edge) => edge.dependsOnId)]));
  if (wouldCreateCycle(graph, input.actionId, input.dependencyIds)) throw new Error("Action dependencies 不可形成循環");
}

export class PlanWriteError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
/** Updating the parent locks all task/outcome writers, including activation and stage append. */
export async function lockActivePlan(tx: Prisma.TransactionClient, userId: string, planId: string, revision?: number) {
  const changed = await tx.actionPlan.updateMany({ where: { id: planId, userId, activeKey: userId, archivedAt: null, ...(revision == null ? {} : { revision }) }, data: { revision: { increment: 1 } } });
  if (!changed.count) throw new PlanWriteError("計畫已更新或封存，請重新載入；輸入仍保留。 / Plan changed or was archived. Reload; your input is preserved.");
}
export function actionRecord(action: GeneratedAction, id: string, clientKey = action.clientKey, milestoneId?: string) {
  const legacy = legacyHoursForMinutes(action.actionTime);
  return {
    id, clientKey, title: action.title, milestoneId,
    impact: action.impact, urgencyType: action.urgencyType, urgencyDays: action.urgencyDays,
    dependencyLevel: action.dependencyLevel, dependencyNotes: action.dependencyNotes, difficulty: action.difficulty,
    actionTimeMinHours: legacy.minHours, actionTimeMaxHours: legacy.maxHours,
    actionTimeMinMinutes: action.actionTime.minMinutes, actionTimeMaxMinutes: action.actionTime.maxMinutes,
    companyStage: action.companyStage, stageFit: action.stageFit.score, stageFitReason: action.stageFit.reason, stageFitConfidence: action.stageFit.confidence,
    bottleneckGroup: action.bottleneckGroup, bottleneckCode: action.bottleneckCode,
    bottleneckFit: action.bottleneckFit.score, bottleneckFitReason: action.bottleneckFit.reason, bottleneckFitConfidence: action.bottleneckFit.confidence,
    outcomeCategory: action.outcomeCategory, expectedOutcome: action.expectedOutcome, outcomeTimeMinDays: action.outcomeTime.min, outcomeTimeMaxDays: action.outcomeTime.max, source: "nova",
  };
}

export async function guardActionMilestone(tx: Prisma.TransactionClient, planId: string, milestoneId: string | null, operation: "done" | "undo" | "edit" | "delete") {
  if (!milestoneId) return;
  const stages = await tx.planMilestone.findMany({ where: { actionPlanId: planId }, include: { actions: { select: { done: true } } }, orderBy: { position: "asc" } });
  const own = stages.find(m => m.id === milestoneId);
  if (!own || stages.some(m => m.position < own.position && !m.achievedAt)) throw new PlanWriteError("需先確認前階段成果 / Confirm previous milestone outcomes first");
  if (own.achievedAt) {
    if (operation !== "undo") throw new PlanWriteError("已確認成果的階段不可修改；請先撤銷成果確認 / Undo the confirmed outcome before modifying this stage");
    if (stages.some(m => m.position > own.position && (m.achievedAt || m.actions.some(a => a.done)))) throw new PlanWriteError("請先撤銷後續階段的完成紀錄 / Undo later stage completions first");
    await tx.planMilestone.update({ where: { id: own.id }, data: { achievedAt: null } });
  }
}
