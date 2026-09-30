import { type NextRequest } from "next/server";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { prisma } from "@/lib/prisma";
import { actionPatchSchema } from "@/lib/action-plan/schemas";
import { assertDependencies, getActiveActionPlan } from "@/lib/action-plan/service";
import { legacyHoursForMinutes } from "@/lib/action-plan/time";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);
    const { id } = await params;
    const parsed = actionPatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues.map((issue) => `${issue.path.join(".") || "欄位"}：${issue.message}`).join("；"), 400);
    }
    const current = await prisma.actionItem.findFirst({
      where: { id, actionPlan: { userId: session.uid, activeKey: session.uid, archivedAt: null } },
      select: {
        id: true,
        actionPlanId: true,
        done: true,
        dependencyLevel: true,
        dependencies: { select: { dependsOn: { select: { title: true, done: true } } } },
        requiredBy: { select: { action: { select: { title: true, done: true } } } },
        stageFit: true,
        stageFitReason: true,
        stageFitConfidence: true,
        stageFitEditedByUser: true,
        bottleneckFit: true,
        bottleneckFitReason: true,
        bottleneckFitConfidence: true,
        bottleneckFitEditedByUser: true,
      },
    });
    if (!current) return fail("找不到 Action。", 404);

    if (Object.keys(parsed.data).length === 1 && "done" in parsed.data) {
      if (parsed.data.done) {
        if (current.dependencyLevel > 0 && current.dependencies.length === 0) {
          return fail("此任務尚未連結前置任務 ID，請先編輯依賴。", 409);
        }
        const unmet = current.dependencies.filter((edge) => !edge.dependsOn.done).map((edge) => edge.dependsOn.title);
        if (unmet.length) return fail(`請先完成前置任務：${unmet.join("、")}`, 409);
      } else {
        const completed = current.requiredBy.filter((edge) => edge.action.done).map((edge) => edge.action.title);
        if (completed.length) return fail(`請先取消後續任務的完成狀態：${completed.join("、")}`, 409);
      }
      await prisma.actionItem.update({ where: { id }, data: { done: parsed.data.done } });
      return ok(await getActiveActionPlan(session.uid));
    }

    const action = parsed.data;
    if (!("dependencyActionIds" in action)) return fail("Action 編輯資料不完整。", 400);
    const legacyActionTime = legacyHoursForMinutes(action.actionTime);
    const stageFitChanged = action.stageFit.score !== current.stageFit || action.stageFit.reason !== current.stageFitReason;
    const bottleneckFitChanged = action.bottleneckFit.score !== current.bottleneckFit || action.bottleneckFit.reason !== current.bottleneckFitReason;
    await assertDependencies({ userId: session.uid, planId: current.actionPlanId, actionId: id, dependencyIds: action.dependencyActionIds });
    if (current.done || action.done) {
      const unmet = await prisma.actionItem.findMany({
        where: { id: { in: action.dependencyActionIds }, actionPlanId: current.actionPlanId, done: false },
        select: { title: true },
      });
      if (unmet.length) return fail(`請先完成前置任務：${unmet.map((item) => item.title).join("、")}`, 409);
    }
    await prisma.$transaction(async (tx) => {
      await tx.actionItem.update({
        where: { id },
        data: {
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
          stageFitConfidence: stageFitChanged ? null : current.stageFitConfidence,
          bottleneckGroup: action.bottleneckGroup,
          bottleneckCode: action.bottleneckCode,
          bottleneckFit: action.bottleneckFit.score,
          bottleneckFitReason: action.bottleneckFit.reason,
          bottleneckFitConfidence: bottleneckFitChanged ? null : current.bottleneckFitConfidence,
          outcomeCategory: action.outcomeCategory,
          expectedOutcome: action.expectedOutcome,
          outcomeTimeMinDays: action.outcomeTime.min,
          outcomeTimeMaxDays: action.outcomeTime.max,
          stageFitEditedByUser: current.stageFitEditedByUser || stageFitChanged,
          bottleneckFitEditedByUser: current.bottleneckFitEditedByUser || bottleneckFitChanged,
          ...(action.done == null ? {} : { done: action.done }),
        },
      });
      await tx.actionDependency.deleteMany({ where: { actionId: id } });
      if (action.dependencyActionIds.length) {
        await tx.actionDependency.createMany({
          data: action.dependencyActionIds.map((dependsOnId) => ({ actionId: id, dependsOnId })),
        });
      }
    });
    return ok(await getActiveActionPlan(session.uid));
  } catch (error) {
    if (error instanceof Error && /依賴|循環|自己/.test(error.message)) return fail(error.message, 400);
    return failFromError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);
    const { id } = await params;
    const current = await prisma.actionItem.findFirst({
      where: { id, actionPlan: { userId: session.uid, activeKey: session.uid, archivedAt: null } },
      select: {
        id: true,
        requiredBy: { select: { action: { select: { id: true, title: true } } } },
      },
    });
    if (!current) return fail("找不到 Action。", 404);
    if (current.requiredBy.length) {
      const blockers = current.requiredBy.map((edge) => edge.action.title).join("\n• ");
      return fail(`無法刪除此 Action，以下項目仍依賴它：\n• ${blockers}\n請先編輯上述 Action 並解除依賴。`, 409);
    }
    await prisma.actionItem.delete({ where: { id } });
    return ok(await getActiveActionPlan(session.uid));
  } catch (error) {
    return failFromError(error);
  }
}
