import { z } from "zod";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import { wouldCreateCycle } from "@/lib/action-plan/ranking";
export const correctionSchema = z.object({
  kind: z.literal("stage-correction"), milestoneId: z.string().min(1),
  changes: z.array(z.object({ actionId: z.string().min(1), title: z.string().trim().min(3).max(200), expectedOutcome: z.string().trim().min(3).max(1000), whyNow: z.string().trim().min(3).max(600), reason: z.string().trim().min(3).max(1000), dependencyActionIds: z.array(z.string().min(1)).max(20) }).strict()).max(100),
}).strict();
export type StageCorrection = z.infer<typeof correctionSchema>;
export function validateCorrection(draft: StageCorrection, plan: ActionPlanDto) {
  const current = plan.roadmap?.milestones.find(m => !m.achievedAt);
  if (!current || current.id !== draft.milestoneId || !["active", "awaiting"].includes(current.status)) throw new Error("當期里程碑已變更 / Current milestone changed");
  const all = new Map(plan.actions.map(a => [a.id, a])), changed = new Set<string>();
  const graph = new Map(plan.actions.map(a => [a.id, a.dependency.actionIds]));
  for (const change of draft.changes) {
    const task = all.get(change.actionId);
    if (!task || task.done || task.milestoneId !== current.id || changed.has(task.id)) throw new Error("只能修正當期未完成任務，ID 不可重複 / Only unfinished current-stage tasks may be corrected; IDs must be unique");
    if (change.dependencyActionIds.some(id => !all.has(id) || id === task.id || (all.get(id)!.milestonePosition ?? -1) > current.position) || new Set(change.dependencyActionIds).size !== change.dependencyActionIds.length) throw new Error("依賴不存在、重複、自我依賴或指向後續階段 / Invalid dependencies");
    changed.add(task.id); graph.set(task.id, change.dependencyActionIds);
  }
  if (wouldCreateCycle(graph, "__validate__", [])) throw new Error("依賴不可形成循環 / Dependencies cannot form a cycle");
  const titles = plan.actions.map(a => (draft.changes.find(c => c.actionId === a.id)?.title || a.title).trim().toLocaleLowerCase());
  if (new Set(titles).size !== titles.length) throw new Error("修正後任務標題不可重複 / Corrected task titles must be distinct");
  return draft;
}
