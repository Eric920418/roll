import "server-only";
import type { Prisma } from "@prisma/client";
import { PlanWriteError, lockActivePlan, guardActionMilestone } from "@/lib/action-plan/service";
import { dependencySatisfied } from "@/lib/action-plan/dependency";
import { interviewSummary } from "./interviews";
import { workspaceKind, interviewTarget } from "@/lib/action-plan/workspace";

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
  if (creating && (!active || workspaceKind(action) !== "interview")) throw new PlanWriteError("請使用目前的訪談任務 / Use an active interview task", 409);
  if (active) await lockActivePlan(tx, userId, action.actionPlanId);
  if (creating && action.recordingMode !== "interview") {
    const target = interviewTarget(action);
    if (!target) throw new PlanWriteError("此任務尚無訪談目標，請先編輯任務名稱加入明確訪談數量 / Edit the task title to specify an interview count first", 409);
    if (action.done) throw new PlanWriteError("請先撤銷完成再新增訪談 / Undo completion before adding interviews", 409);
    await guardActionMilestone(tx, action.actionPlanId, action.milestoneId, "edit");
    const required = await tx.actionDependency.findMany({ where: { dependsOnId: actionId }, include: { action: true } });
    const count = interviewSummary(actionId, await interviewRows(tx, userId, actionId)).total;
    if (required.some(e => e.minimumCurrent != null && (action.metricUnit !== "companies" || target < e.minimumCurrent || (e.action.done && count < e.minimumCurrent)))) throw new PlanWriteError("先調整既有數量依賴再使用訪談紀錄 / Adjust quantity dependencies before using interview records", 409);
    await tx.actionItem.update({ where: { id: actionId }, data: { recordingMode: "interview", metricTarget: target, metricUnit: "companies", metricCurrent: count } });
  }
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
