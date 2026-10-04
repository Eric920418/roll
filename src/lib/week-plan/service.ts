import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveActionPlan, serializePlan } from "@/lib/action-plan/service";
import { addCalendarDays, calendarWeek, type WeekMutation, type WeekPlan } from "./schema";

export class CalendarError extends Error {
  constructor(message: string, public status = 409, public code = "calendar_conflict") { super(message); }
}
const conflict = () => new CalendarError("安排或任務已被其他分頁更新，請重新載入後重試；輸入仍保留。 / Schedule or task changed. Reload and retry; your input is preserved.");
export async function getWeekPlan(userId: string, canScheduleActions: boolean, weekStart = calendarWeek().weekStart): Promise<WeekPlan> {
  const [entries, plan] = await Promise.all([
    prisma.weekCalendarItem.findMany({ where: { userId, deletedAt: null, date: { gte: new Date(`${weekStart}T00:00:00Z`), lt: new Date(`${addCalendarDays(weekStart, 7)}T00:00:00Z`) }, ...(!canScheduleActions ? { kind: "personal" } : {}) }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    canScheduleActions ? getActiveActionPlan(userId) : null,
  ]);
  const active = new Map(plan?.actions.map(action => [action.id, action]));
  const tasks = (plan?.actions.filter(action => !action.done) || []).sort((a, b) => (a.milestonePosition ?? 0) - (b.milestonePosition ?? 0) || (a.displayNumber ?? 0) - (b.displayNumber ?? 0));
  const schedules = tasks.length ? await prisma.weekCalendarItem.findMany({ where: { userId, kind: "action", actionId: { in: tasks.map(task => task.id) } }, select: { actionId: true, date: true, revision: true, deletedAt: true } }) : [];
  const scheduled = new Map(schedules.map(item => [item.actionId, { date: item.deletedAt ? null : item.date.toISOString().slice(0, 10), revision: item.revision }]));
  return { weekStart, today: calendarWeek().today, canScheduleActions, planId: plan?.id || null, planRevision: plan?.revision ?? null,
    entries: entries.map(entry => { const action = entry.actionId ? active.get(entry.actionId) : null; return { id: entry.id, kind: entry.kind, date: entry.date.toISOString().slice(0, 10), title: action?.title || entry.title, note: entry.note, revision: entry.revision, actionId: entry.actionId, done: entry.kind === "action" ? action?.done || false : entry.done, available: entry.kind === "personal" || Boolean(action && (action.done || !action.dependency.blocked)) }; }),
    tasks: tasks.map(({ id, title, displayNumber, metric, dependency, done, milestonePosition, rank }) => ({ id, title, displayNumber, metric, dependency, done, milestonePosition, rank, scheduled: scheduled.get(id) || null })),
  };
}
export async function mutateWeekPlan(userId: string, canScheduleActions: boolean, input: WeekMutation) {
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    // Serialize calendar writes without a User → ActionPlan lock inversion with rewards/completion.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`nova-week:${userId}`}, 0))::text AS locked`;
    if (input.operation === "add") {
      const replay = await tx.weekCalendarItem.findUnique({ where: { userId_requestId: { userId, requestId: input.requestId } } });
      if (replay) {
        if (!replay.deletedAt && (replay.title !== input.title || replay.note !== input.note || replay.date.toISOString().slice(0, 10) !== input.date)) throw new CalendarError("這次請求已儲存不同內容，請重新載入確認原事項後再新增。 / This request already saved different content. Reload and review the existing item before adding another.", 409, "request_conflict");
        return replay.id;
      }
      return (await tx.weekCalendarItem.create({ data: { userId, requestId: input.requestId, date: new Date(`${input.date}T00:00:00Z`), title: input.title, note: input.note } })).id;
    }
    if (input.operation === "schedule") {
      if (!canScheduleActions) throw new CalendarError("安排 Action Plan 需有效 Pro 以上方案 / Active Pro plan required to schedule Action Plan tasks", 403, "plan_required");
      await tx.$queryRaw`SELECT "id" FROM "ActionPlan" WHERE "id" = ${input.planId} AND "userId" = ${userId} FOR UPDATE`;
      const record = await tx.actionPlan.findFirst({ where: { id: input.planId, userId, activeKey: userId, archivedAt: null }, include: { actions: { include: { dependencies: { select: { minimumCurrent: true, dependsOn: { select: { id: true, clientKey: true, title: true, done: true, metricCurrent: true, metricUnit: true } } } } } }, milestones: true } });
      if (!record) throw conflict();
      const task = serializePlan(record).actions.find(action => action.id === input.actionId);
      if (!task) throw new CalendarError("找不到你的任務 / Task not found", 404, "not_found");
      if (task.done || task.dependency.blocked) throw new CalendarError("此任務尚未解鎖或已完成，請先處理前置任務或里程碑。 / Task is locked or complete. Resolve prerequisites or milestone outcomes first.", 409, "task_locked");
      const entry = await tx.weekCalendarItem.findUnique({ where: { actionId: input.actionId } });
      if (entry && entry.userId !== userId) throw new CalendarError("找不到你的安排 / Schedule not found", 404, "not_found");
      if (entry && !entry.deletedAt && entry.date.toISOString().slice(0, 10) === input.date && entry.revision === (input.entryRevision == null ? 0 : input.entryRevision + 1)) return entry.id;
      if (record.revision !== input.planRevision || (entry && entry.revision !== input.entryRevision) || (!entry && input.entryRevision != null)) throw conflict();
      const date = new Date(`${input.date}T00:00:00Z`);
      return entry ? (await tx.weekCalendarItem.update({ where: { id: entry.id }, data: { date, deletedAt: null, revision: { increment: 1 } } })).id
        : (await tx.weekCalendarItem.create({ data: { userId, kind: "action", actionId: task.id, date, title: task.title, requestId: input.requestId } })).id;
    }
    const entry = await tx.weekCalendarItem.findFirst({ where: { id: input.id, userId, deletedAt: null, ...(!canScheduleActions ? { kind: "personal" } : {}) } });
    if (!entry) throw new CalendarError("找不到你的事項 / Item not found", 404, "not_found");
    if (entry.revision !== input.revision) throw conflict();
    if (input.operation === "remove") { await tx.weekCalendarItem.update({ where: { id: entry.id }, data: { deletedAt: new Date(), revision: { increment: 1 } } }); return entry.id; }
    if (entry.kind !== "personal") throw new CalendarError("請從任務膠囊重新安排；完成任務需前往 Next steps。 / Reschedule using the task pill; complete tasks in Next steps.", 400, "action_edit_forbidden");
    await tx.weekCalendarItem.update({ where: { id: entry.id }, data: { date: new Date(`${input.date}T00:00:00Z`), title: input.title, note: input.note, done: input.done, revision: { increment: 1 } } });
    return entry.id;
  });
}
