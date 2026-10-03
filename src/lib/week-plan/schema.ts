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
export const weekMutationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("add"), requestId: z.string().uuid(), date: calendarDate, title, note }).strict(),
  z.object({ operation: z.literal("schedule"), requestId: z.string().uuid(), date: calendarDate, actionId: id, planId: id, planRevision: revision, entryRevision: revision.nullable() }).strict(),
  z.object({ operation: z.literal("edit"), id, revision, date: calendarDate, title, note, done: z.boolean() }).strict(),
  z.object({ operation: z.literal("remove"), id, revision }).strict(),
]);
export type WeekMutation = z.infer<typeof weekMutationSchema>;
export type CalendarEntry = { id: string; kind: string; date: string; title: string; note: string; done: boolean; revision: number; actionId: string | null; available: boolean };
export type CalendarTask = Pick<ActionPlanActionDto, "id" | "title" | "displayNumber" | "metric" | "dependency" | "done" | "milestonePosition" | "rank"> & { scheduled: { date: string | null; revision: number } | null };
export type WeekPlan = { weekStart: string; today: string; entries: CalendarEntry[]; tasks: CalendarTask[]; planId: string | null; planRevision: number | null; canScheduleActions: boolean };
