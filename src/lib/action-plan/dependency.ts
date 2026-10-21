export type DependencyProgress = { minimumCurrent?: number | null; dependsOn: { commercialValidation?: unknown; done: boolean; metricCurrent?: number | null } };
/** Quantity gates never imply task completion or bypass milestone outcome confirmation. */
export function dependencySatisfied(edge: DependencyProgress): boolean {
  const state = edge.dependsOn.commercialValidation;
  if (state && typeof state === "object" && "requiresConfirmation" in state && state.requiresConfirmation === true) return false;
  return edge.minimumCurrent == null ? edge.dependsOn.done : edge.dependsOn.metricCurrent != null && edge.dependsOn.metricCurrent >= edge.minimumCurrent;
}
