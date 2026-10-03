import { browserMutationGuard } from "@/lib/security/http";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { prisma } from "@/lib/prisma";
import { actionInputSchema, planRevisionSchema } from "@/lib/action-plan/schemas";
import { assertDependencies, getActiveActionPlan, lockActivePlan, PlanWriteError } from "@/lib/action-plan/service";
import { legacyHoursForMinutes } from "@/lib/action-plan/time";

export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);
    const body = await req.json();
    const { revision } = planRevisionSchema.parse(body);
    const parsed = actionInputSchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.issues.map((issue) => `${issue.path.join(".") || "欄位"}：${issue.message}`).join("；"), 400);
    }
    const plan = await prisma.actionPlan.findFirst({
      where: { userId: session.uid, activeKey: session.uid, archivedAt: null },
      select: { id: true, _count: { select: { actions: true } } },
    });
    if (!plan) return fail("尚未建立 Active Action Plan，請先由 NOVA 生成計畫。", 409);
    if (plan._count.actions >= 100) return fail("每份 Action Plan 最多 100 項。", 409);
    const id = randomUUID();
    const action = parsed.data;
    const legacyActionTime = legacyHoursForMinutes(action.actionTime);
    await prisma.$transaction(async raw => {
      const tx = raw as unknown as Prisma.TransactionClient;
      await lockActivePlan(tx, session.uid, plan.id, revision);
      if (await tx.actionItem.count({ where: { actionPlanId: plan.id } }) >= 100) throw new PlanWriteError("每份計畫最多 100 項 / Maximum 100 tasks");
      const stages = await tx.planMilestone.findMany({ where: { actionPlanId: plan.id }, orderBy: { position: "asc" }, include: { _count: { select: { actions: true } } } });
      const stage = stages.find(m => !m.achievedAt);
      if (stages.length && (!stage || !stage._count.actions)) throw new PlanWriteError("請先生成當期任務或建立新目標 / Generate this stage's tasks first, or create a new goal");
      await assertDependencies({ userId: session.uid, planId: plan.id, actionId: id, dependencyIds: action.dependencyActionIds, milestoneId: stage?.id }, tx);
      await tx.actionItem.create({
        data: {
          id,
          actionPlanId: plan.id,
          milestoneId: stage?.id,
          clientKey: randomUUID(),
          title: action.title,
          impact: action.impact,
          urgencyType: action.urgencyType,
          urgencyDays: action.urgencyDays,
          dependencyLevel: action.dependencyLevel,
          dependencyNotes: action.dependencyNotes,
          difficulty: action.difficulty,
          actionTimeMinHours: legacyActionTime.minHours,
          actionTimeMaxHours: legacyActionTime.maxHours,
          actionTimeMinMinutes: action.actionTime.minMinutes,
          actionTimeMaxMinutes: action.actionTime.maxMinutes,
          companyStage: action.companyStage,
          stageFit: action.stageFit.score,
          stageFitReason: action.stageFit.reason,
          stageFitConfidence: null,
          bottleneckGroup: action.bottleneckGroup,
          bottleneckCode: action.bottleneckCode,
          bottleneckFit: action.bottleneckFit.score,
          bottleneckFitReason: action.bottleneckFit.reason,
          bottleneckFitConfidence: null,
          outcomeCategory: action.outcomeCategory,
          expectedOutcome: action.expectedOutcome,
          outcomeTimeMinDays: action.outcomeTime.min,
          outcomeTimeMaxDays: action.outcomeTime.max,
          source: "user",
          stageFitEditedByUser: true,
          bottleneckFitEditedByUser: true,
        },
      });
      if (action.dependencyActionIds.length) {
        await tx.actionDependency.createMany({
          data: action.dependencyActionIds.map((dependsOnId) => ({ actionId: id, dependsOnId })),
        });
      }
    });
    return ok(await getActiveActionPlan(session.uid), 201);
  } catch (error) {
    if (error instanceof PlanWriteError) return fail(error.message, error.status);
    if (error instanceof Error && /依賴|循環|自己/.test(error.message)) return fail(error.message, 400);
    if (error instanceof SyntaxError) return fail("無效 JSON / Invalid JSON", 400);
    if (error instanceof Error && error.name === "ZodError") return fail(error.message, 400);
    return failFromError(error);
  }
}
