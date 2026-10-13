import { z } from "zod";
import { taipeiWeek } from "@/lib/check-ins/schema";
import { today } from "@/lib/roadmap/schema";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";

export const calendarDate = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/, "日期格式必須是 YYYY-MM-DD / Use YYYY-MM-DD")
  .refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, "日期不存在 / Invalid date");
export function addCalendarDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
export function calendarWeek(now = new Date()) { return { weekStart: taipeiWeek(now), today: today(now) }; }
export const calendarWeekStart = calendarDate.refine(value => new Date(`${value}T00:00:00Z`).getUTCDay() === 1, "週起始必須為週一 / Week must start on Monday");
const revision = z.number().int().nonnegative(), id = z.string().min(1).max(100);
const title = z.string().trim().min(1, "請輸入事項 / Enter an item").max(200), note = z.string().trim().max(2000);
const timestamp = z.string().datetime({ offset: true }).nullable().optional();
const times = { startsAt: timestamp, endsAt: timestamp, durationMinutes: z.number().int().min(1).max(1440).nullable().optional(), alertEmail: z.boolean().optional(), locale: z.enum(["en", "zh-tw"]).optional() };
export const weekMutationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("add"), requestId: z.string().uuid(), date: calendarDate, title, note, ...times }).strict(),
  z.object({ operation: z.literal("schedule"), requestId: z.string().uuid(), date: calendarDate, actionId: id, planId: id, planRevision: revision, entryRevision: revision.nullable(), ...times }).strict(),
  z.object({ operation: z.literal("edit"), id, revision, date: calendarDate, title, note, done: z.boolean(), ...times }).strict(),
  z.object({ operation: z.literal("remove"), id, revision }).strict(),
]).superRefine((input, ctx) => {
  if (input.operation === "remove") return;
  if ((input.startsAt === undefined) !== (input.endsAt === undefined) || Boolean(input.startsAt) !== Boolean(input.endsAt)) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "請同時填寫開始與結束時間，或設為全天 / Set both times or leave both empty" });
  } else if (input.startsAt && input.endsAt) {
    const start = Date.parse(input.startsAt), end = Date.parse(input.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    if (input.durationMinutes != null && end - start !== input.durationMinutes * 60000) ctx.addIssue({ code: "custom", path: ["durationMinutes"], message: "Duration 與時段不符 / Duration does not match the time range" });
    if (today(new Date(start)) !== input.date || end <= start || end - start > 86400000) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "開始時間需在所選台北日期內，結束需晚於開始且不超過 24 小時 / Start on the selected Taipei date; end later, within 24 hours" });
  }
});
export type WeekMutation = z.infer<typeof weekMutationSchema>;
export type CalendarEntry = { id: string; kind: string; date: string; startsAt: string | null; endsAt: string | null; title: string; note: string; done: boolean; revision: number; actionId: string | null; available: boolean; interview: boolean; durationMinutes: number | null; alert: { enabled: boolean; status: string | null; acceptedAt: string | null; error: string | null } };
export type CalendarTask = Pick<ActionPlanActionDto, "id" | "title" | "displayNumber" | "metric" | "dependency" | "done" | "milestonePosition" | "rank"> & { scheduled: { date: string | null; startsAt: string | null; endsAt: string | null; durationMinutes: number | null; alertEmail: boolean; revision: number } | null };
export type WeekPlan = { weekStart: string; today: string; entries: CalendarEntry[]; tasks: CalendarTask[]; planId: string | null; planRevision: number | null; canScheduleActions: boolean; emailAlertsAvailable: boolean; interviewProgress: { actionId: string; current: number; target: number | null; commitments: number } | null };

export function calendarTimes(date: string, start: string, end: string) {
  if (!start && !end) return { startsAt: null, endsAt: null };
  return { startsAt: `${date}T${start}:00+08:00`, endsAt: `${end < start ? addCalendarDays(date, 1) : date}T${end}:00+08:00` };
}
export function calendarTime(value: string | null) {
  return value ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(11, 16) : "";
}
export function interviewEnded(entry: Pick<CalendarEntry, "interview" | "endsAt" | "available" | "done">, now: number) {
  return entry.interview && entry.available && !entry.done && entry.endsAt !== null && Date.parse(entry.endsAt) <= now;
}

export function durationTimes(date: string, start: string, minutes: number) {
  if (!start) return { startsAt: null, endsAt: null };
  const time = Date.parse(`${date}T${start}:00+08:00`);
  return { startsAt: new Date(time).toISOString(), endsAt: new Date(time + minutes * 60000).toISOString() };
}
export function savedDuration(entry?: { durationMinutes?: number | null; startsAt: string | null; endsAt: string | null } | null) {
  return entry?.durationMinutes ?? (entry?.startsAt && entry.endsAt ? (Date.parse(entry.endsAt) - Date.parse(entry.startsAt)) / 60000 : 60);
}
