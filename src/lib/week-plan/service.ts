import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveActionPlan, serializePlan } from "@/lib/action-plan/service";
import { workspaceKind, workspaceLeads, interviewTarget } from "@/lib/action-plan/workspace";
import { companyKey, interviewSummary } from "@/lib/customer-insights/interviews";
import { addCalendarDays, calendarWeek, type WeekMutation, type WeekPlan } from "./schema";

export class CalendarError extends Error {
  constructor(message: string, public status = 409, public code = "calendar_conflict") { super(message); }
}
const conflict = () => new CalendarError("安排或任務已被其他分頁更新，請重新載入後重試；輸入仍保留。 / Schedule or task changed. Reload and retry; your input is preserved.");
function timesFor(input: Exclude<WeekMutation, { operation: "remove" }>, entry?: { date: Date; startsAt: Date | null; endsAt: Date | null } | null) {
  if (input.startsAt !== undefined) return { startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null };
  const shift = entry ? Date.parse(`${input.date}T00:00:00Z`) - entry.date.getTime() : 0;
  return { startsAt: entry?.startsAt ? new Date(entry.startsAt.getTime() + shift) : null, endsAt: entry?.endsAt ? new Date(entry.endsAt.getTime() + shift) : null };
}
export async function getWeekPlan(userId: string, canScheduleActions: boolean, weekStart = calendarWeek().weekStart): Promise<WeekPlan> {
  const [entries, plan] = await Promise.all([
    prisma.weekCalendarItem.findMany({ where: { userId, deletedAt: null, date: { gte: new Date(`${weekStart}T00:00:00Z`), lt: new Date(`${addCalendarDays(weekStart, 7)}T00:00:00Z`) }, ...(!canScheduleActions ? { kind: "personal" } : {}) }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    canScheduleActions ? getActiveActionPlan(userId) : null,
  ]);
  const active = new Map(plan?.actions.map(action => [action.id, action]));
  const tasks = (plan?.actions.filter(action => !action.done) || []).sort((a, b) => (a.milestonePosition ?? 0) - (b.milestonePosition ?? 0) || (a.displayNumber ?? 0) - (b.displayNumber ?? 0));
  const schedules = tasks.length ? await prisma.weekCalendarItem.findMany({ where: { userId, kind: "action", actionId: { in: tasks.map(task => task.id) } }, select: { actionId: true, date: true, startsAt: true, endsAt: true, revision: true, deletedAt: true } }) : [];
  const scheduled = new Map(schedules.map(item => [item.actionId, { date: item.deletedAt ? null : item.date.toISOString().slice(0, 10), startsAt: item.startsAt?.toISOString() ?? null, endsAt: item.endsAt?.toISOString() ?? null, revision: item.revision }]));
  const interviewActions = plan?.actions.filter(action => workspaceKind(action) === "interview") ?? [];
  const interview = interviewActions.find(action => !action.done && !action.dependency.blocked) ?? interviewActions.find(action => !action.done) ?? interviewActions[0];
  const pilots = plan?.actions.flatMap(action => action.taskWorkspace?.kind === "pilot" ? [action.taskWorkspace] : []) ?? [];
  const rows = interview || pilots.length ? await prisma.meetingNote.findMany({ where: { userId, OR: plan!.actions.map(action => ({ insight: { path: ["actionId"], equals: action.id } })) }, select: { id: true, updatedAt: true, insight: true } }) : [];
  const leads = new Map(workspaceLeads(rows).map(lead => [lead.id, lead]));
  const commitments = new Set(pilots.flatMap(pilot => pilot.prospects.flatMap(prospect => {
    const lead = leads.get(prospect.leadId);
    return lead && prospect.offer && prospect.response === "agreed" && prospect.reason ? [companyKey(lead.company)] : [];
  }))).size;
  return { weekStart, today: calendarWeek().today, canScheduleActions, planId: plan?.id || null, planRevision: plan?.revision ?? null,
    interviewProgress: interview ? { actionId: interview.id, current: interviewSummary(interview.id, rows).total, target: interviewTarget(interview), commitments } : null,
    entries: entries.map(entry => { const action = entry.actionId ? active.get(entry.actionId) : null; return { id: entry.id, kind: entry.kind, date: entry.date.toISOString().slice(0, 10), startsAt: entry.startsAt?.toISOString() ?? null, endsAt: entry.endsAt?.toISOString() ?? null, interview: Boolean(action && workspaceKind(action) === "interview"), title: action?.title || entry.title, note: entry.note, revision: entry.revision, actionId: entry.actionId, done: entry.kind === "action" ? action?.done || false : entry.done, available: entry.kind === "personal" || Boolean(action && (action.done || !action.dependency.blocked)) }; }),
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
        const times = timesFor(input);
        if (!replay.deletedAt && (replay.title !== input.title || replay.note !== input.note || replay.date.toISOString().slice(0, 10) !== input.date || replay.startsAt?.getTime() !== times.startsAt?.getTime() || replay.endsAt?.getTime() !== times.endsAt?.getTime())) throw new CalendarError("這次請求已儲存不同內容，請重新載入確認原事項後再新增。 / This request already saved different content. Reload and review the existing item before adding another.", 409, "request_conflict");
        return replay.id;
      }
      return (await tx.weekCalendarItem.create({ data: { userId, requestId: input.requestId, date: new Date(`${input.date}T00:00:00Z`), title: input.title, note: input.note, ...timesFor(input) } })).id;
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
      const times = timesFor(input, entry);
      if (entry && !entry.deletedAt && entry.date.toISOString().slice(0, 10) === input.date && entry.startsAt?.getTime() === times.startsAt?.getTime() && entry.endsAt?.getTime() === times.endsAt?.getTime() && entry.revision === (input.entryRevision == null ? 0 : input.entryRevision + 1)) return entry.id;
      if (record.revision !== input.planRevision || (entry && entry.revision !== input.entryRevision) || (!entry && input.entryRevision != null)) throw conflict();
      const date = new Date(`${input.date}T00:00:00Z`);
      return entry ? (await tx.weekCalendarItem.update({ where: { id: entry.id }, data: { date, ...times, deletedAt: null, revision: { increment: 1 } } })).id
        : (await tx.weekCalendarItem.create({ data: { userId, kind: "action", actionId: task.id, date, ...times, title: task.title, requestId: input.requestId } })).id;
    }
    const entry = await tx.weekCalendarItem.findFirst({ where: { id: input.id, userId, deletedAt: null, ...(!canScheduleActions ? { kind: "personal" } : {}) } });
    if (!entry) throw new CalendarError("找不到你的事項 / Item not found", 404, "not_found");
    if (entry.revision !== input.revision) throw conflict();
    if (input.operation === "remove") { await tx.weekCalendarItem.update({ where: { id: entry.id }, data: { deletedAt: new Date(), revision: { increment: 1 } } }); return entry.id; }
    if (entry.kind !== "personal") throw new CalendarError("請從任務膠囊重新安排；完成任務需前往 Next steps。 / Reschedule using the task pill; complete tasks in Next steps.", 400, "action_edit_forbidden");
    await tx.weekCalendarItem.update({ where: { id: entry.id }, data: { date: new Date(`${input.date}T00:00:00Z`), ...timesFor(input, entry), title: input.title, note: input.note, done: input.done, revision: { increment: 1 } } });
    return entry.id;
  });
}
