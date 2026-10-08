import "server-only";
import type { Prisma } from "@prisma/client";
import { PlanWriteError, lockActivePlan, guardActionMilestone } from "@/lib/action-plan/service";
import { dependencySatisfied } from "@/lib/action-plan/dependency";
import { interviewSummary } from "./interviews";

export async function interviewRows(tx: Pick<Prisma.TransactionClient, "meetingNote">, userId: string, actionId: string) {
  return tx.meetingNote.findMany({ where: { userId, insight: { path: ["actionId"], equals: actionId } }, select: { id: true, updatedAt: true, insight: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
}

export async function lockInterviewAction(tx: Prisma.TransactionClient, userId: string, actionId: string, creating = false) {
  const action = await tx.actionItem.findFirst({ where: { id: actionId, actionPlan: { userId } }, include: { actionPlan: { select: { activeKey: true, archivedAt: true } } } });
  if (!action) {
    if (creating || await tx.actionItem.count({ where: { id: actionId } })) throw new PlanWriteError("找不到訪談任務 / Interview task not found", 404);
    return; // Deleted tasks retain their owned conversations.
  }
  const active = action.actionPlan.activeKey === userId && !action.actionPlan.archivedAt;
  if (creating && (!active || action.recordingMode !== "interview")) throw new PlanWriteError("請先啟用目前任務的訪談紀錄 / Enable interviews on an active task first", 409);
  if (active) await lockActivePlan(tx, userId, action.actionPlanId);
}

export async function refreshInterviewProgress(tx: Prisma.TransactionClient, userId: string, actionId: string) {
  const action = await tx.actionItem.findFirst({ where: { id: actionId, recordingMode: "interview", actionPlan: { userId, activeKey: userId, archivedAt: null } }, include: {
    dependencies: { include: { dependsOn: true } }, requiredBy: { include: { action: true } },
  } });
  if (!action) return;
  const count = interviewSummary(actionId, await interviewRows(tx, userId, actionId)).total;
  if (action.done && count < (action.metricTarget ?? Infinity)) throw new PlanWriteError("修改會使已完成訪談未達目標，請先撤銷完成 / Undo completion before reducing interviews below the target", 409);
  if (count === action.metricCurrent) return;
  await guardActionMilestone(tx, action.actionPlanId, action.milestoneId, "edit");
  if (count > (action.metricCurrent ?? 0) && ((action.dependencyLevel > 0 && !action.dependencies.length) || action.dependencies.some(e => !dependencySatisfied(e)))) throw new PlanWriteError("請先達成前置條件再增加訪談 / Resolve prerequisites before adding interviews", 409);
  if (action.requiredBy.some(e => e.action.done && e.minimumCurrent != null && count < e.minimumCurrent)) throw new PlanWriteError("請先撤銷後續任務完成，修改會使訪談依賴門檻未達成 / Undo dependent task completions before reducing interview evidence", 409);
  await tx.actionItem.update({ where: { id: actionId }, data: { metricCurrent: count } });
}

export async function assertInterviewComplete(tx: Prisma.TransactionClient, userId: string, action: { id: string; recordingMode: string | null; metricTarget: number | null }) {
  if (action.recordingMode !== "interview") return;
  const count = interviewSummary(action.id, await interviewRows(tx, userId, action.id)).total;
  if (!action.metricTarget || count < action.metricTarget) throw new PlanWriteError(`訪談尚未達標：${count}/${action.metricTarget ?? "?"} 間公司 / Interview target not met`, 409);
  await tx.actionItem.update({ where: { id: action.id }, data: { metricCurrent: count } });
}
