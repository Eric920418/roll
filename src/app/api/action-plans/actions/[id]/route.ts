import { completeGettingStarted } from "@/lib/getting-started/service";
import { Prisma } from "@prisma/client";
import { type NextRequest } from "next/server";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { prisma } from "@/lib/prisma";
import { actionPatchSchema, planRevisionSchema } from "@/lib/action-plan/schemas";
import { assertDependencies, getActiveActionPlan, lockActivePlan, guardActionMilestone, PlanWriteError } from "@/lib/action-plan/service";
import { legacyHoursForMinutes } from "@/lib/action-plan/time";

import { awardReward, prepareActionReward } from "@/lib/rewards/service";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);
    const { id } = await params;
    const body = await req.json();
    const { revision } = planRevisionSchema.parse(body);
    const fields = { ...body }; delete fields.revision;
    const parsed = actionPatchSchema.safeParse(fields);
    if (!parsed.success) {
      return fail(parsed.error.issues.map((issue) => `${issue.path.join(".") || "欄位"}：${issue.message}`).join("；"), 400);
    }
    const found = await prisma.actionItem.findFirst({ where: { id, actionPlan: { userId: session.uid, activeKey: session.uid, archivedAt: null } }, select: { actionPlanId: true } });
    if (!found) return fail("找不到 Action。", 404);
    await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    await lockActivePlan(tx, session.uid, found.actionPlanId, revision);
    const current = await tx.actionItem.findFirst({
      where: { id, actionPlan: { userId: session.uid, activeKey: session.uid, archivedAt: null } },
      select: {
        id: true,
        actionPlanId: true,
        done: true,
        milestoneId: true,
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
    if (!current) throw new PlanWriteError("找不到 Action。", 404);
    await prepareActionReward(tx, session.uid, id, current.done);

    if ("metricTarget" in parsed.data) {
      await guardActionMilestone(tx, current.actionPlanId, current.milestoneId, "edit");
      await tx.actionItem.update({ where: { id }, data: parsed.data });
      return;
    }

    if (Object.keys(parsed.data).length === 1 && "done" in parsed.data) {
      await guardActionMilestone(tx, current.actionPlanId, current.milestoneId, parsed.data.done ? "done" : "undo");
      if (parsed.data.done) {
        if (current.dependencyLevel > 0 && current.dependencies.length === 0) {
          throw new PlanWriteError("此任務尚未連結前置任務 ID，請先編輯依賴。");
        }
        const unmet = current.dependencies.filter((edge) => !edge.dependsOn.done).map((edge) => edge.dependsOn.title);
        if (unmet.length) throw new PlanWriteError(`請先完成前置任務：${unmet.join("、")}`);
      } else {
        const completed = current.requiredBy.filter((edge) => edge.action.done).map((edge) => edge.action.title);
        if (completed.length) throw new PlanWriteError(`請先取消後續任務的完成狀態：${completed.join("、")}`);
      }
      await tx.actionItem.update({ where: { id }, data: { done: parsed.data.done, completedAt: parsed.data.done ? (current.done ? undefined : new Date()) : null } });
      if (!current.done && parsed.data.done) await completeGettingStarted(tx, session.uid);
      if (!current.done && parsed.data.done) await awardReward(tx, session.uid, "action", id);
      return;
    }

    const action = parsed.data;
    if (!("dependencyActionIds" in action)) throw new PlanWriteError("Action 編輯資料不完整。", 400);
    await guardActionMilestone(tx, current.actionPlanId, current.milestoneId, current.done && action.done === false ? "undo" : "edit");
    if (current.done && action.done === false && current.requiredBy.some(edge => edge.action.done)) throw new PlanWriteError("請先取消後續任務的完成狀態 / Undo dependent tasks first");
    const legacyActionTime = legacyHoursForMinutes(action.actionTime);
    const stageFitChanged = action.stageFit.score !== current.stageFit || action.stageFit.reason !== current.stageFitReason;
    const bottleneckFitChanged = action.bottleneckFit.score !== current.bottleneckFit || action.bottleneckFit.reason !== current.bottleneckFitReason;
    await assertDependencies({ userId: session.uid, planId: current.actionPlanId, actionId: id, dependencyIds: action.dependencyActionIds }, tx);
    if (current.done || action.done) {
      const unmet = await tx.actionItem.findMany({
        where: { id: { in: action.dependencyActionIds }, actionPlanId: current.actionPlanId, done: false },
        select: { title: true },
      });
      if (unmet.length) throw new PlanWriteError(`請先完成前置任務：${unmet.map((item) => item.title).join("、")}`);
    }
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
          ...(action.done == null ? {} : { done: action.done, completedAt: action.done ? (current.done ? undefined : new Date()) : null }),
        },
      });
      if (!current.done && action.done) await completeGettingStarted(tx, session.uid);
      if (!current.done && action.done) await awardReward(tx, session.uid, "action", id);
      await tx.actionDependency.deleteMany({ where: { actionId: id } });
      if (action.dependencyActionIds.length) {
        await tx.actionDependency.createMany({
          data: action.dependencyActionIds.map((dependsOnId) => ({ actionId: id, dependsOnId })),
        });
      }
    });
    return ok(await getActiveActionPlan(session.uid));
  } catch (error) {
    if (error instanceof PlanWriteError) return fail(error.message, error.status);
    if (error instanceof Error && /依賴|循環|自己/.test(error.message)) return fail(error.message, 400);
    if (error instanceof SyntaxError) return fail("無效 JSON / Invalid JSON", 400);
    if (error instanceof Error && error.name === "ZodError") return fail(error.message, 400);
    return failFromError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);
    const { id } = await params;
    const { revision } = planRevisionSchema.parse(await req.json());
    const found = await prisma.actionItem.findFirst({ where: { id, actionPlan: { userId: session.uid, activeKey: session.uid, archivedAt: null } }, select: { actionPlanId: true } });
    if (!found) return fail("找不到 Action。", 404);
    await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    await lockActivePlan(tx, session.uid, found.actionPlanId, revision);
    const current = await tx.actionItem.findFirst({
      where: { id, actionPlan: { userId: session.uid, activeKey: session.uid, archivedAt: null } },
      select: {
        id: true,
        milestoneId: true,
        requiredBy: { select: { action: { select: { id: true, title: true } } } },
      },
    });
    if (!current) throw new PlanWriteError("找不到 Action。", 404);
    await guardActionMilestone(tx, found.actionPlanId, current.milestoneId, "delete");
    if (current.requiredBy.length) {
      const blockers = current.requiredBy.map((edge) => edge.action.title).join("\n• ");
      throw new PlanWriteError(`無法刪除此 Action，以下項目仍依賴它：\n• ${blockers}\n請先編輯上述 Action 並解除依賴。`);
    }
    await tx.actionItem.delete({ where: { id } });
    });
    return ok(await getActiveActionPlan(session.uid));
  } catch (error) {
    if (error instanceof PlanWriteError) return fail(error.message, error.status);
    if (error instanceof SyntaxError) return fail("無效 JSON / Invalid JSON", 400);
    if (error instanceof Error && error.name === "ZodError") return fail(error.message, 400);
    return failFromError(error);
  }
}
