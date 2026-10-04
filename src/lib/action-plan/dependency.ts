export type DependencyProgress = { minimumCurrent?: number | null; dependsOn: { done: boolean; metricCurrent?: number | null } };
/** Quantity gates never imply task completion or bypass milestone outcome confirmation. */
export function dependencySatisfied(edge: DependencyProgress): boolean {
  return edge.minimumCurrent == null ? edge.dependsOn.done : edge.dependsOn.metricCurrent != null && edge.dependsOn.metricCurrent >= edge.minimumCurrent;
}
