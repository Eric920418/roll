import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Diagnosis, GeneratedAction } from "./schemas";
import { rankActions, wouldCreateCycle, type ActionPlanActionDto } from "./ranking";
import { legacyHoursForMinutes } from "./time";

const actionInclude = {
  dependencies: {
    select: { dependsOn: { select: { id: true, title: true, done: true } } },
  },
} as const;

export type ActionPlanDto = {
  id: string;
  locale: string;
  diagnosis: Diagnosis;
  createdAt: string;
  actions: ActionPlanActionDto[];
  nextMoves: ActionPlanActionDto[];
  blockers: Array<{ id: string; title: string; dependencies: string[] }>;
};

type PlanWithActions = Awaited<ReturnType<typeof findActivePlanRecord>>;

async function findActivePlanRecord(userId: string) {
  return prisma.actionPlan.findFirst({
    where: { userId, activeKey: userId, archivedAt: null },
    include: { actions: { include: actionInclude } },
  });
}

export function serializePlan(plan: NonNullable<PlanWithActions>): ActionPlanDto {
  const actions = rankActions(plan.actions);
  return {
    id: plan.id,
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
      .map((action) => ({ id: action.id, title: action.title, dependencies: action.dependency.actionTitles })),
  };
}

export async function getActiveActionPlan(userId: string): Promise<ActionPlanDto | null> {
  const plan = await findActivePlanRecord(userId);
  return plan ? serializePlan(plan) : null;
}

export async function getPlanByRequestId(userId: string, requestId: string): Promise<ActionPlanDto | null> {
  const plan = await prisma.actionPlan.findUnique({
    where: { userId_requestId: { userId, requestId } },
    include: { actions: { include: actionInclude } },
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
        data: { activeKey: null, archivedAt: new Date() },
      });
      const plan = await tx.actionPlan.create({
        data: {
          userId: input.userId,
          locale: input.locale,
          ...input.diagnosis,
          requestId: input.requestId,
          activeKey: input.userId,
          actions: {
            create: input.actions.map((action) => {
              const legacy = legacyHoursForMinutes(action.actionTime);
              return {
                id: actionIds.get(action.clientKey),
                clientKey: action.clientKey,
                title: action.title,
                impact: action.impact,
                urgencyType: action.urgencyType,
                urgencyDays: action.urgencyDays,
                dependencyLevel: action.dependencyLevel,
                dependencyNotes: action.dependencyNotes,
                difficulty: action.difficulty,
                actionTimeMinHours: legacy.minHours,
                actionTimeMaxHours: legacy.maxHours,
                actionTimeMinMinutes: action.actionTime.minMinutes,
                actionTimeMaxMinutes: action.actionTime.maxMinutes,
                companyStage: action.companyStage,
                stageFit: action.stageFit.score,
                stageFitReason: action.stageFit.reason,
                stageFitConfidence: action.stageFit.confidence,
                bottleneckGroup: action.bottleneckGroup,
                bottleneckCode: action.bottleneckCode,
                bottleneckFit: action.bottleneckFit.score,
                bottleneckFitReason: action.bottleneckFit.reason,
                bottleneckFitConfidence: action.bottleneckFit.confidence,
                outcomeCategory: action.outcomeCategory,
                expectedOutcome: action.expectedOutcome,
                outcomeTimeMinDays: action.outcomeTime.min,
                outcomeTimeMaxDays: action.outcomeTime.max,
                source: "nova",
              };
            }),
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
    include: { actions: { include: actionInclude } },
  });
  if (!persisted) throw new Error("Action plan 寫入後無法讀取");
  return serializePlan(persisted);
}

export async function assertDependencies(input: {
  userId: string;
  planId: string;
  actionId: string;
  dependencyIds: string[];
}) {
  if (input.dependencyIds.includes(input.actionId)) throw new Error("Action 不可依賴自己");
  const actions = await prisma.actionItem.findMany({
    where: { actionPlanId: input.planId, actionPlan: { userId: input.userId, activeKey: input.userId } },
    select: { id: true, dependencies: { select: { dependsOnId: true } } },
  });
  const valid = new Set(actions.map((action) => action.id));
  const missing = input.dependencyIds.filter((id) => !valid.has(id));
  if (missing.length) throw new Error("依賴 Action 不存在或不屬於目前計畫");
  const graph = new Map(actions.map((action) => [action.id, action.dependencies.map((edge) => edge.dependsOnId)]));
  if (wouldCreateCycle(graph, input.actionId, input.dependencyIds)) throw new Error("Action dependencies 不可形成循環");
}
