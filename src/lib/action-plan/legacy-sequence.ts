import { workspaceKind } from "./workspace";

type Action = { id: string; clientKey: string; title: string; source: string; milestoneId?: string | null; executionOrder?: number | null; done: boolean; commercialValidation?: unknown; metricTarget?: number | null; metricCurrent?: number | null; metricUnit?: string | null; taskWorkspace?: unknown; taskFinding?: unknown; dependencies: Array<{ minimumCurrent?: number | null; dependsOn: { id: string; done: boolean; title: string } }> };

/** Read projection only: retain the original five tasks and their stored dependency graph. */
export function legacySequence<T extends Action>(actions: T[]): T[] {
  if (actions.some(a => a.clientKey.startsWith("nova_v2_"))) return actions;
  const original = ["interview", "pilot", "positioning", "scorecard", "tiers"];
  const group = original.map((kind, i) => actions.find(a => a.clientKey === `task_${i + 1}` && a.source === "nova" && a.executionOrder == null && workspaceKind(a) === kind));
  if (group.some(a => !a) || !group[0]!.milestoneId || group.some(a => a!.milestoneId !== group[0]!.milestoneId) || actions.filter(a => a.milestoneId === group[0]!.milestoneId).length !== 5) return actions;
  const [interview, pilot, positioning, scorecard, tiers] = group as T[];
  const expected = [[], [interview.id], [interview.id, pilot.id], [positioning.id], [interview.id, scorecard.id]];
  if (group.some((a, i) => a!.dependencies.length !== expected[i].length || a!.dependencies.some(e => !expected[i].includes(e.dependsOn.id) || (e.minimumCurrent != null && (i !== 1 || e.minimumCurrent !== 10))))) return actions;
  const sequence = [interview, positioning, scorecard, tiers, pilot];
  return actions.map(a => {
    const index = sequence.findIndex(v => v.id === a.id);
    if (index < 0) return a;
    const previous = sequence[index - 1];
    const dependencies = previous ? [{ ...(a.dependencies[0] || {}), minimumCurrent: null, dependsOn: { id: previous.id, clientKey: previous.clientKey, title: previous.title, done: previous.done, commercialValidation: previous.commercialValidation, metricTarget: previous.metricTarget, metricCurrent: previous.metricCurrent, metricUnit: previous.metricUnit }, dependsOnId: previous.id }] : [];
    return { ...a, executionOrder: index, dependencyLevel: index ? 1 : 0, dependencies };
  });
}
