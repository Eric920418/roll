import { z } from "zod";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import { taskReference } from "@/lib/action-plan/ranking";
import { today } from "@/lib/roadmap/schema";

export function taipeiWeek(now = new Date()): string {
  const date = new Date(`${today(now)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
const version = z.number().int().nonnegative();
const metricValue = z.number().int().nonnegative().max(1000000000).nullable();
export const weeklyOutputSchema = z.object({
  nextActionIds: z.array(z.string().min(1)).max(3),
  rationale: z.string().trim().min(3).max(2000),
  investorDraft: z.string().trim().min(3).max(6000),
  metricSuggestions: z.array(z.object({ actionId: z.string().min(1), target: z.number().int().positive().max(1000000000), unit: z.string().trim().min(1).max(80) }).strict()).max(20),
}).strict().refine(v => new Set(v.nextActionIds).size === v.nextActionIds.length, "建議任務不可重複 / Duplicate recommended tasks");
export type WeeklyOutput = z.infer<typeof weeklyOutputSchema>;
export const checkInRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), planId: z.string().min(1), planRevision: version, weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), revision: version, requestId: z.string().uuid(), finding: z.string().trim().max(4000), blockers: z.string().trim().max(4000), metrics: z.array(z.object({ actionId: z.string().min(1), current: metricValue }).strict()).max(100) }).strict(),
  z.object({ action: z.literal("generate"), id: z.string().min(1), revision: version, planRevision: version, requestId: z.string().uuid(), locale: z.enum(["en", "zh-tw"]).default("en") }).strict(),
  z.object({ action: z.literal("apply"), id: z.string().min(1), revision: version, planRevision: version, requestId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("edit"), id: z.string().min(1), revision: version, requestId: z.string().uuid(), investorDraft: z.string().trim().min(1).max(6000) }).strict(),
]);
export type CheckInRequest = z.infer<typeof checkInRequestSchema>;
export type TaskSnapshot = { id: string; reference: string; title: string; done: boolean; completedAt: string | null; metric: { target: number | null; unit: string | null; current: number | null }; blocked: boolean };
export function taskSnapshot(plan: ActionPlanDto): TaskSnapshot[] {
  return plan.actions.map(a => ({ id: a.id, reference: `${a.milestonePosition == null ? "" : `Milestone ${a.milestonePosition + 1} · `}${taskReference(a)}`, title: a.title, done: a.done, completedAt: a.completedAt || null, metric: a.metric || { target: null, unit: null, current: null }, blocked: a.dependency.blocked }));
}
export function weeklySummary(snapshot: TaskSnapshot[], weekStart: string, finding: string, blockers: string): string {
  const since = new Date(`${weekStart}T00:00:00+08:00`).getTime(), until = since + 7 * 86400000;
  const completedThisWeek = snapshot.filter(a => a.done && a.completedAt && new Date(a.completedAt).getTime() >= since && new Date(a.completedAt).getTime() < until);
  return [`本週確認完成 / Confirmed complete this week: ${completedThisWeek.length}`, `目前總進度 / Overall: ${snapshot.filter(a => a.done).length}/${snapshot.length}`,
    ...snapshot.filter(a => a.metric.target != null || a.metric.current != null).map(a => `${a.reference}: ${a.metric.current ?? "尚未回報 / Not reported"}/${a.metric.target ?? "—"} ${a.metric.unit || ""}`),
    `發現或決定 / Finding or decision: ${finding || "尚未回報 / Not reported"}`, `目前阻礙 / Current blocker: ${blockers || "尚未回報 / Not reported"}`].join("\n");
}
export function validateWeeklyOutput(output: WeeklyOutput, plan: ActionPlanDto) {
  const ready = new Set(plan.actions.filter(a => !a.done && !a.dependency.blocked).map(a => a.id));
  if (output.nextActionIds.some(id => !ready.has(id))) throw new Error("AI 建議包含不可執行的任務 / AI suggested unavailable tasks");
  if (ready.size && !output.nextActionIds.length) throw new Error("AI 未提供可執行任務 / AI omitted available tasks");
  const eligible = new Set(plan.actions.filter(a => !a.done && !a.dependency.milestoneTitle && a.metric?.target == null).map(a => a.id));
  if (output.metricSuggestions.some(m => !eligible.has(m.actionId)) || new Set(output.metricSuggestions.map(m => m.actionId)).size !== output.metricSuggestions.length) throw new Error("無效數量建議 / Invalid metric suggestions");
  return output;
}
