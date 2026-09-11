import { IMPACT_WEIGHTS, bottleneckLabel, urgencyWeight } from "./constants";

export type RankableAction = {
  id: string;
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
    dependsOn: { id: string; title: string; done: boolean };
  }>;
};

export type ActionPlanActionDto = {
  id: string;
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
    resolved: boolean;
    blocked: boolean;
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

export function rankActions(actions: RankableAction[]): ActionPlanActionDto[] {
  const rows = actions.map((action) => {
    const unfinished = action.dependencies
      .map((edge) => edge.dependsOn)
      .filter((dependency) => !dependency.done);
    const resolved = unfinished.length === 0;
    const blocked = action.dependencyLevel === 3 && !resolved;
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
      actionTimeMinMinutes,
      actionTimeMaxMinutes,
    };
  });

  const ready = rows
    .filter((row) => !row.action.done && !row.blocked)
    .sort((a, b) =>
      b.score - a.score ||
      b.urgencyWeight - a.urgencyWeight ||
      b.impactWeight - a.impactWeight ||
      a.actionTimeMaxMinutes - b.actionTimeMaxMinutes ||
      new Date(a.action.createdAt).getTime() - new Date(b.action.createdAt).getTime(),
    );
  const ranks = new Map(ready.map((row, index) => [row.action.id, index + 1]));

  return rows
    .map(({ action, score, impactWeight, urgencyWeight: urgency, resolved, blocked, unfinished, actionTimeMinMinutes, actionTimeMaxMinutes }) => ({
      id: action.id,
      title: action.title,
      impact: { label: action.impact, weight: impactWeight },
      urgency: {
        type: action.urgencyType as "immediate" | "urgent" | "scheduled",
        ...(action.urgencyDays == null ? {} : { days: action.urgencyDays }),
        weight: urgency,
      },
      dependency: {
        level: action.dependencyLevel as 0 | 1 | 2 | 3,
        notes: action.dependencyNotes,
        actionIds: action.dependencies.map((edge) => edge.dependsOn.id),
        actionTitles: unfinished.map((dependency) => dependency.title),
        resolved,
        blocked,
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
        reason: action.stageFitReason,
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
        reason: action.bottleneckFitReason,
        confidence: action.bottleneckFitConfidence,
        adjustedByUser: action.bottleneckFitEditedByUser,
      },
      expectedOutcome: {
        category: action.outcomeCategory as ActionPlanActionDto["expectedOutcome"]["category"],
        text: action.expectedOutcome,
        estimatedTime: { minDays: action.outcomeTimeMinDays, maxDays: action.outcomeTimeMaxDays },
      },
      priorityScore: score,
      rank: ranks.get(action.id) ?? null,
      done: action.done,
      source: action.source,
    }))
    .sort((a, b) => {
      if (a.rank != null && b.rank != null) return a.rank - b.rank;
      if (a.rank != null) return -1;
      if (b.rank != null) return 1;
      if (a.done !== b.done) return a.done ? 1 : -1;
      return b.priorityScore - a.priorityScore;
    });
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
