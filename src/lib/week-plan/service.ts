import "server-only";
import { randomUUID } from "node:crypto";
import { rewardEmailConfigured } from "@/lib/rewards/reminders";
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
function timesFor(input: Exclude<WeekMutation, { operation: "remove" }>, entry?: { date: Date; startsAt: Date | null; endsAt: Date | null; durationMinutes: number | null } | null) {
  const shift = entry ? Date.parse(`${input.date}T00:00:00Z`) - entry.date.getTime() : 0;
  const startsAt = input.startsAt !== undefined ? input.startsAt ? new Date(input.startsAt) : null : entry?.startsAt ? new Date(entry.startsAt.getTime() + shift) : null;
  let endsAt = input.endsAt !== undefined ? input.endsAt ? new Date(input.endsAt) : null : entry?.endsAt ? new Date(entry.endsAt.getTime() + shift) : null;
  if (startsAt && input.durationMinutes != null && input.endsAt === undefined) endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60000);
  const durationMinutes = input.durationMinutes !== undefined ? input.durationMinutes : input.startsAt ? null : entry?.durationMinutes ?? null;
  return { startsAt, endsAt, durationMinutes };

}
function alertData(input: Exclude<WeekMutation, { operation: "remove" }>, times: ReturnType<typeof timesFor>, previous?: { alertAt: Date | null; alertVersion: string | null; alertLocale: string | null } | null) {
  const enabled = input.alertEmail ?? Boolean(previous?.alertAt);
  if (!enabled) return { alertAt: null, alertVersion: null, alertLocale: previous?.alertLocale ?? input.locale ?? "en" };
  if (input.alertEmail === true && !rewardEmailConfigured()) throw new CalendarError("Email 提醒目前無法啟用 / Email reminders are unavailable", 503, "email_unavailable");
  if (!times.startsAt) throw new CalendarError("Email 提醒需要開始時間 / Set a start time for the email alert", 400, "alert_time_required");
  const alertAt = new Date(times.startsAt.getTime() - 30 * 60000);
  const unchanged = previous?.alertAt?.getTime() === alertAt.getTime();
  if (!unchanged && alertAt.getTime() <= Date.now()) throw new CalendarError("提醒需排在未來，請選擇至少 30 分鐘後的開始時間 / Choose a start time more than 30 minutes from now", 400, "alert_time_past");
  return { alertAt, alertVersion: unchanged ? previous!.alertVersion : randomUUID(), alertLocale: unchanged ? previous?.alertLocale ?? input.locale ?? "en" : input.locale ?? previous?.alertLocale ?? "en" };
}
async function cancelOldAlerts(tx: Prisma.TransactionClient, id: string, version: string | null) {
  await tx.calendarTaskAlert.updateMany({ where: { calendarItemId: id, status: { in: ["pending", "processing"] }, ...(version ? { NOT: { version } } : {}) }, data: { status: "cancelled", leaseToken: null, leaseUntil: null } });
}
async function enqueueAlert(tx: Prisma.TransactionClient, id: string, userId: string, alert: { alertAt: Date | null; alertVersion: string | null }) {
  if (alert.alertAt && alert.alertVersion) await tx.calendarTaskAlert.createMany({ data: [{ userId, calendarItemId: id, version: alert.alertVersion, scheduledAt: alert.alertAt, nextAttemptAt: alert.alertAt }], skipDuplicates: true });
}
export async function getWeekPlan(userId: string, canScheduleActions: boolean, weekStart = calendarWeek().weekStart): Promise<WeekPlan> {
  const [entries, plan] = await Promise.all([
    prisma.weekCalendarItem.findMany({ where: { userId, deletedAt: null, date: { gte: new Date(`${weekStart}T00:00:00Z`), lt: new Date(`${addCalendarDays(weekStart, 7)}T00:00:00Z`) }, ...(!canScheduleActions ? { kind: "personal" } : {}) }, include: { alerts: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: [{ date: "asc" }, { startsAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] }),
    canScheduleActions ? getActiveActionPlan(userId) : null,
  ]);
  const active = new Map(plan?.actions.map(action => [action.id, action]));
  const tasks = (plan?.actions.filter(action => !action.done) || []).sort((a, b) => (a.milestonePosition ?? 0) - (b.milestonePosition ?? 0) || (a.displayNumber ?? 0) - (b.displayNumber ?? 0));
  const schedules = tasks.length ? await prisma.weekCalendarItem.findMany({ where: { userId, kind: "action", actionId: { in: tasks.map(task => task.id) } }, select: { actionId: true, date: true, startsAt: true, endsAt: true, durationMinutes: true, alertAt: true, revision: true, deletedAt: true } }) : [];
  const scheduled = new Map(schedules.map(item => [item.actionId, { date: item.deletedAt ? null : item.date.toISOString().slice(0, 10), startsAt: item.startsAt?.toISOString() ?? null, endsAt: item.endsAt?.toISOString() ?? null, durationMinutes: item.durationMinutes, alertEmail: Boolean(item.alertAt), revision: item.revision }]));
  const interviewActions = plan?.actions.filter(action => workspaceKind(action) === "interview") ?? [];
  const interview = interviewActions.find(action => !action.done && !action.dependency.blocked) ?? interviewActions.find(action => !action.done) ?? interviewActions[0];
  const pilots = plan?.actions.flatMap(action => action.taskWorkspace?.kind === "pilot" ? [action.taskWorkspace] : []) ?? [];
  const rows = interview || pilots.length ? await prisma.meetingNote.findMany({ where: { userId, OR: plan!.actions.map(action => ({ insight: { path: ["actionId"], equals: action.id } })) }, select: { id: true, updatedAt: true, insight: true } }) : [];
  const leads = new Map(workspaceLeads(rows).map(lead => [lead.id, lead]));
  const commitments = new Set(pilots.flatMap(pilot => pilot.prospects.flatMap(prospect => {
    const lead = leads.get(prospect.leadId);
    return lead && prospect.offer && prospect.response === "agreed" && prospect.reason ? [companyKey(lead.company)] : [];
  }))).size;
  return { weekStart, today: calendarWeek().today, canScheduleActions, emailAlertsAvailable: rewardEmailConfigured(), planId: plan?.id || null, planRevision: plan?.revision ?? null,
    interviewProgress: interview ? { actionId: interview.id, current: interviewSummary(interview.id, rows).total, target: interviewTarget(interview), commitments } : null,
    entries: entries.map(entry => { const action = entry.actionId ? active.get(entry.actionId) : null; return { id: entry.id, kind: entry.kind, date: entry.date.toISOString().slice(0, 10), startsAt: entry.startsAt?.toISOString() ?? null, endsAt: entry.endsAt?.toISOString() ?? null, durationMinutes: entry.durationMinutes, alert: { enabled: Boolean(entry.alertAt) && !entry.done && !(entry.kind === "action" && (!action || action.done || action.dependency.blocked)), status: entry.alerts[0]?.version === entry.alertVersion ? entry.alerts[0].status : null, acceptedAt: entry.alerts[0]?.version === entry.alertVersion ? entry.alerts[0].acceptedAt?.toISOString() ?? null : null, error: entry.alerts[0]?.version === entry.alertVersion ? entry.alerts[0].lastError : null }, interview: Boolean(action && workspaceKind(action) === "interview"), title: action?.title || entry.title, note: entry.note, revision: entry.revision, actionId: entry.actionId, done: entry.kind === "action" ? action?.done || false : entry.done, available: entry.kind === "personal" || Boolean(action && (action.done || !action.dependency.blocked)) }; }),
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
        if (!replay.deletedAt && (replay.title !== input.title || replay.note !== input.note || replay.date.toISOString().slice(0, 10) !== input.date || replay.startsAt?.getTime() !== times.startsAt?.getTime() || replay.endsAt?.getTime() !== times.endsAt?.getTime() || replay.durationMinutes !== times.durationMinutes || (input.alertEmail !== undefined && Boolean(replay.alertAt) !== input.alertEmail))) throw new CalendarError("這次請求已儲存不同內容，請重新載入確認原事項後再新增。 / This request already saved different content. Reload and review the existing item before adding another.", 409, "request_conflict");
        return replay.id;
      }
      const times = timesFor(input), alert = alertData(input, times);
      const entry = await tx.weekCalendarItem.create({ data: { userId, requestId: input.requestId, date: new Date(`${input.date}T00:00:00Z`), title: input.title, note: input.note, ...times, ...alert } });
      await enqueueAlert(tx, entry.id, userId, alert); return entry.id;
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
      const alert = alertData(input, times, entry);
      if (entry && !entry.deletedAt && entry.date.toISOString().slice(0, 10) === input.date && entry.startsAt?.getTime() === times.startsAt?.getTime() && entry.endsAt?.getTime() === times.endsAt?.getTime() && entry.durationMinutes === times.durationMinutes && entry.alertAt?.getTime() === alert.alertAt?.getTime() && entry.revision === (input.entryRevision == null ? 0 : input.entryRevision + 1)) return entry.id;
      if (record.revision !== input.planRevision || (entry && entry.revision !== input.entryRevision) || (!entry && input.entryRevision != null)) throw conflict();
      const date = new Date(`${input.date}T00:00:00Z`);
      if (entry) await cancelOldAlerts(tx, entry.id, alert.alertVersion);
      const saved = entry ? (await tx.weekCalendarItem.update({ where: { id: entry.id }, data: { date, ...times, ...alert, deletedAt: null, revision: { increment: 1 } } }))
        : (await tx.weekCalendarItem.create({ data: { userId, kind: "action", actionId: task.id, date, ...times, ...alert, title: task.title, requestId: input.requestId } }));
      await enqueueAlert(tx, saved.id, userId, alert); return saved.id;
    }
    const entry = await tx.weekCalendarItem.findFirst({ where: { id: input.id, userId, deletedAt: null, ...(!canScheduleActions ? { kind: "personal" } : {}) } });
    if (!entry) throw new CalendarError("找不到你的事項 / Item not found", 404, "not_found");
    if (entry.revision !== input.revision) throw conflict();
    if (input.operation === "remove") { await cancelOldAlerts(tx, entry.id, null); await tx.weekCalendarItem.update({ where: { id: entry.id }, data: { deletedAt: new Date(), alertAt: null, alertVersion: null, revision: { increment: 1 } } }); return entry.id; }
    if (entry.kind !== "personal") throw new CalendarError("請從任務膠囊重新安排；完成任務需前往 Next steps。 / Reschedule using the task pill; complete tasks in Next steps.", 400, "action_edit_forbidden");
    const times = timesFor(input, entry), alert = input.done ? { alertAt: null, alertVersion: null, alertLocale: entry.alertLocale } : alertData(input, timesFor(input, entry), entry);
    await cancelOldAlerts(tx, entry.id, alert.alertVersion);
    await tx.weekCalendarItem.update({ where: { id: entry.id }, data: { date: new Date(`${input.date}T00:00:00Z`), ...times, ...alert, title: input.title, note: input.note, done: input.done, revision: { increment: 1 } } });
    await enqueueAlert(tx, entry.id, userId, alert);
    return entry.id;
  });
}
