import { workspaceKind } from "@/lib/action-plan/workspace";

type LegacyAction = {
  id: string;
  clientKey: string;
  title: string;
  source: string;
  milestoneId?: string | null;
  executionOrder?: number | null;
  taskWorkspace?: unknown;
  dependencies: Array<{ minimumCurrent?: number | null; dependsOn: { id: string } }>;
};

export function legacySequence<T extends LegacyAction>(actions: T[]): T[] {
  const kinds = ["interview", "pilot", "positioning", "scorecard", "tiers"];
  const group = kinds.map((kind, i) => actions.find(a =>
    a.clientKey === `task_${i + 1}` && a.source === "nova" && a.executionOrder == null && workspaceKind(a) === kind));
  const [interview, pilot, positioning, scorecard, tiers] = group;
  if (!interview?.milestoneId || !pilot || !positioning || !scorecard || !tiers ||
    group.some(a => a?.milestoneId !== interview.milestoneId) ||
    actions.filter(a => a.milestoneId === interview.milestoneId).length !== kinds.length ||
    actions.some(a => a.clientKey.startsWith("nova_v2_"))) return actions;

  const expected = [[], [interview.id], [interview.id, pilot.id], [positioning.id], [interview.id, scorecard.id]];
  if (group.some((a, i) => a!.dependencies.length !== expected[i].length ||
    expected[i].some(id => !a!.dependencies.some(e => e.dependsOn.id === id && (e.minimumCurrent == null || i === 1 && e.minimumCurrent === 10))))) return actions;

  // The original template made positioning wait for a sale. Preserve the pilot's own interview gate.
  const order = [interview.id, positioning.id, scorecard.id, tiers.id, pilot.id];
  return actions.map(a => {
    const executionOrder = order.indexOf(a.id);
    if (executionOrder < 0) return a;
    return { ...a, executionOrder, dependencies: a.id === positioning.id ? a.dependencies.filter(e => e.dependsOn.id !== pilot.id) : a.dependencies };
  });
}
