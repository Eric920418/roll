import { BOTTLENECKS, IMPACT_WEIGHTS, bottleneckLabel, urgencyWeight } from "./constants";

export type RankableAction = {
  id: string;
  clientKey: string;
  milestoneId?: string | null;
  executionOrder?: number | null;
  completedAt?: Date | string | null;
  metricTarget?: number | null;
  metricUnit?: string | null;
  metricCurrent?: number | null;
  title: string;
  impact: string;
  urgencyType: string;
  urgencyDays: number | null;
  dependencyLevel: number;
  dependencyNotes: string | null;
  difficulty: number;
  actionTimeMinHours: number;
  actionTimeMaxHours: number;
  actionTimeMinMinutes: number | null;
  actionTimeMaxMinutes: number | null;
  companyStage: string;
  stageFit: number;
  stageFitReason: string;
  stageFitConfidence: number | null;
  bottleneckGroup: string;
  bottleneckCode: string;
  bottleneckFit: number;
  bottleneckFitReason: string;
  bottleneckFitConfidence: number | null;
  outcomeCategory: string;
  expectedOutcome: string;
  outcomeTimeMinDays: number;
  outcomeTimeMaxDays: number;
  done: boolean;
  source: string;
  stageFitEditedByUser: boolean;
  bottleneckFitEditedByUser: boolean;
  createdAt: Date | string;
  dependencies: Array<{
    dependsOn: { id: string; clientKey: string; title: string; done: boolean };
  }>;
};

export type ActionPlanActionDto = {
  id: string;
  clientKey: string;
  milestoneId?: string | null;
  displayNumber?: number;
  milestonePosition?: number | null;
  completedAt?: string | null;
  metric?: { target: number | null; unit: string | null; current: number | null };
  title: string;
  impact: { label: string; weight: number };
  urgency: {
    type: "immediate" | "urgent" | "scheduled";
    days?: number;
    weight: number;
  };
  dependency: {
    level: 0 | 1 | 2 | 3;
    notes: string | null;
    actionIds: string[];
    actionTitles: string[];
    actionRefs: Array<{ id?: string; clientKey: string; title: string; done: boolean; displayNumber?: number; milestonePosition?: number | null; crossMilestone?: boolean }>;
    missingLink: boolean;
    resolved: boolean;
    blocked: boolean;
    milestoneTitle?: string;
  };
  difficulty: {
    level: 1 | 2 | 3 | 4 | 5;
    actionTime: {
      minMinutes: number;
      maxMinutes: number;
      minHours: number;
      maxHours: number;
    };
  };
  companyStage: string;
  stageFit: { score: number; reason: string; confidence: number | null; adjustedByUser: boolean };
  bottleneck: { group: string; code: string; label: string };
  bottleneckFit: { score: number; reason: string; confidence: number | null; adjustedByUser: boolean };
  expectedOutcome: {
    category: "revenue" | "customers" | "product" | "fundraising" | "expansion" | "custom";
    text: string;
    estimatedTime: { minDays: number; maxDays: number };
  };
  priorityScore: number;
  rank: number | null;
  done: boolean;
  source: string;
};

export function priorityScore(action: Pick<RankableAction, "impact" | "urgencyType" | "urgencyDays" | "stageFit" | "bottleneckFit" | "difficulty">): number {
  const impact = IMPACT_WEIGHTS[action.impact as keyof typeof IMPACT_WEIGHTS] ?? 0;
  const urgency = urgencyWeight(action.urgencyType, action.urgencyDays);
  const raw = (impact * urgency * action.stageFit * action.bottleneckFit) / action.difficulty;
  return Math.round(raw * 100) / 100;
}

// 對外只顯示可理解的層級；精確分數仍供伺服器排序與同分決勝使用。
export function priorityTier(score: number): "Critical" | "High" | "Medium" | "Low" {
  if (score >= 200) return "Critical";
  if (score >= 100) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

export function humanizeActionText(text: string): string {
  for (const [code, label] of Object.values(BOTTLENECKS).flat()) {
    text = text.replace(new RegExp(`\\b${code}\\b`, "g"), code === "no_icp" ? "Unclear ICP" : label);
  }
  return text.replace(/\bicpDetails\b/g, "customer profile");
}
export function taskReference(task: { clientKey: string; title: string; displayNumber?: number; milestonePosition?: number | null; crossMilestone?: boolean }): string {
  const number = task.displayNumber ?? Number(/^task_(\d+)$/.exec(task.clientKey)?.[1]);
  const prefix = task.crossMilestone && task.milestonePosition != null ? `Milestone ${task.milestonePosition + 1} · ` : "";
  return `${prefix}${number ? `#${number} · ` : ""}${humanizeActionText(task.title)}`;
}
/** Stable topological order: completion and priority labels never renumber tasks. */
export function executionSequence<T extends Pick<RankableAction, "id" | "clientKey" | "milestoneId" | "executionOrder" | "createdAt" | "dependencies">>(actions: T[], positions = new Map<string, number>()): T[] {
  const order = [...actions].sort((a, b) => (positions.get(a.milestoneId || "") ?? -1) - (positions.get(b.milestoneId || "") ?? -1)
    || (a.executionOrder ?? Number.MAX_SAFE_INTEGER) - (b.executionOrder ?? Number.MAX_SAFE_INTEGER)
    || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    || a.clientKey.localeCompare(b.clientKey, "en", { numeric: true }) || a.id.localeCompare(b.id));
  const available = new Set(actions.map(a => a.id)), emitted = new Set<string>(), result: T[] = [];
  while (result.length < order.length) {
    const next = order.find(a => !emitted.has(a.id) && a.dependencies.every(e => !available.has(e.dependsOn.id) || emitted.has(e.dependsOn.id)));
    // Invalid legacy cycles remain visible and blocked; writers reject new cycles.
    const row = next || order.find(a => !emitted.has(a.id))!;
    emitted.add(row.id); result.push(row);
  }
  return result;
}

export function rankActions(actions: RankableAction[], milestoneBlocks = new Map<string, string>(), positions = new Map<string, number>()): ActionPlanActionDto[] {
  const ordered = executionSequence(actions, positions);
  const counters = new Map<string, number>();
  const numbers = new Map(ordered.map(a => { const stage = a.milestoneId || ""; const number = (counters.get(stage) || 0) + 1; counters.set(stage, number); return [a.id, number]; }));
  const byId = new Map(actions.map(a => [a.id, a]));
  const rows = ordered.map((action) => {
    const unfinished = action.dependencies
      .map((edge) => edge.dependsOn)
      .filter((dependency) => !dependency.done);
    const missingLink = action.dependencyLevel > 0 && action.dependencies.length === 0;
    const milestoneTitle = action.milestoneId ? milestoneBlocks.get(action.milestoneId) : undefined;
    const resolved = unfinished.length === 0 && !missingLink && !milestoneTitle;
    const blocked = !resolved;
    const impactWeight = IMPACT_WEIGHTS[action.impact as keyof typeof IMPACT_WEIGHTS] ?? 0;
    const weight = urgencyWeight(action.urgencyType, action.urgencyDays);
    const actionTimeMinMinutes =
      action.actionTimeMinMinutes ?? action.actionTimeMinHours * 60;
    const actionTimeMaxMinutes =
      action.actionTimeMaxMinutes ?? action.actionTimeMaxHours * 60;
    return {
      action,
      score: priorityScore(action),
      impactWeight,
      urgencyWeight: weight,
      resolved,
      blocked,
      unfinished,
      missingLink,
      milestoneTitle,
      actionTimeMinMinutes,
      actionTimeMaxMinutes,
    };
  });

  const ready = rows.filter((row) => !row.action.done && !row.blocked);
  const ranks = new Map(ready.map((row, index) => [row.action.id, index + 1]));

  return rows
    .map(({ action, score, impactWeight, urgencyWeight: urgency, resolved, blocked, unfinished, missingLink, milestoneTitle, actionTimeMinMinutes, actionTimeMaxMinutes }) => ({
      id: action.id,
      milestoneId: action.milestoneId,
      clientKey: action.clientKey,
      displayNumber: numbers.get(action.id),
      milestonePosition: positions.get(action.milestoneId || "") ?? null,
      completedAt: action.completedAt ? new Date(action.completedAt).toISOString() : null,
      metric: { target: action.metricTarget ?? null, unit: action.metricUnit ?? null, current: action.metricCurrent ?? null },
      title: humanizeActionText(action.title),
      impact: { label: action.impact, weight: impactWeight },
      urgency: {
        type: action.urgencyType as "immediate" | "urgent" | "scheduled",
        ...(action.urgencyDays == null ? {} : { days: action.urgencyDays }),
        weight: urgency,
      },
      dependency: {
        level: action.dependencyLevel as 0 | 1 | 2 | 3,
        notes: action.dependencyNotes ? humanizeActionText(action.dependencyNotes) : null,
        actionIds: action.dependencies.map((edge) => edge.dependsOn.id),
        actionTitles: unfinished.map((dependency) => humanizeActionText(dependency.title)),
        actionRefs: action.dependencies.map(({ dependsOn: d }) => ({ ...d, title: humanizeActionText(d.title), displayNumber: numbers.get(d.id), milestonePosition: positions.get(byId.get(d.id)?.milestoneId || "") ?? null, crossMilestone: byId.get(d.id)?.milestoneId !== action.milestoneId })),
        missingLink,
        resolved,
        blocked,
        milestoneTitle,
      },
      difficulty: {
        level: action.difficulty as 1 | 2 | 3 | 4 | 5,
        actionTime: {
          minMinutes: actionTimeMinMinutes,
          maxMinutes: actionTimeMaxMinutes,
          minHours: action.actionTimeMinHours,
          maxHours: action.actionTimeMaxHours,
        },
      },
      companyStage: action.companyStage,
      stageFit: {
        score: action.stageFit,
        reason: humanizeActionText(action.stageFitReason),
        confidence: action.stageFitConfidence,
        adjustedByUser: action.stageFitEditedByUser,
      },
      bottleneck: {
        group: action.bottleneckGroup,
        code: action.bottleneckCode,
        label: bottleneckLabel(action.bottleneckGroup, action.bottleneckCode),
      },
      bottleneckFit: {
        score: action.bottleneckFit,
        reason: humanizeActionText(action.bottleneckFitReason),
        confidence: action.bottleneckFitConfidence,
        adjustedByUser: action.bottleneckFitEditedByUser,
      },
      expectedOutcome: {
        category: action.outcomeCategory as ActionPlanActionDto["expectedOutcome"]["category"],
        text: humanizeActionText(action.expectedOutcome),
        estimatedTime: { minDays: action.outcomeTimeMinDays, maxDays: action.outcomeTimeMaxDays },
      },
      priorityScore: score,
      rank: ranks.get(action.id) ?? null,
      done: action.done,
      source: action.source,
    }))
;
}

export function wouldCreateCycle(graph: Map<string, string[]>, actionId: string, nextDependencies: string[]): boolean {
  const next = new Map(graph);
  next.set(actionId, nextDependencies);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of next.get(id) ?? []) if (visit(dependency)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return [...next.keys()].some(visit);
}
