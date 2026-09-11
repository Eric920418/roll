import type { ActionPlanActionDto } from "./ranking";
import type { ActionPlanDto } from "./service";
import { COMPANY_STAGES, type CompanyStage } from "./constants";

export type DashboardPriority =
  | { kind: "upgrade" }
  | { kind: "action"; action: ActionPlanActionDto }
  | { kind: "blocked"; blockerCount: number }
  | { kind: "complete" }
  | { kind: "onboarding" }
  | { kind: "quiz" }
  | { kind: "build" };

export function deriveDashboardPriority(input: {
  isPaying: boolean;
  onboardingDone: boolean;
  quizDone: boolean;
  plan: ActionPlanDto | null;
}): DashboardPriority {
  if (!input.isPaying) return { kind: "upgrade" };

  if (input.plan) {
    const first = input.plan.nextMoves[0];
    if (first) return { kind: "action", action: first };

    const unfinished = input.plan.actions.filter((action) => !action.done);
    if (unfinished.length === 0) return { kind: "complete" };
    return {
      kind: "blocked",
      blockerCount: input.plan.blockers.length || unfinished.length,
    };
  }

  if (!input.onboardingDone) return { kind: "onboarding" };
  if (!input.quizDone) return { kind: "quiz" };
  return { kind: "build" };
}

export const DASHBOARD_PROGRESS_GROUPS = [
  "product",
  "sales",
  "fundraising",
  "expansion",
] as const;

export type DashboardProgressGroup = (typeof DASHBOARD_PROGRESS_GROUPS)[number];

export type DashboardProgress = Record<
  DashboardProgressGroup,
  { done: number; total: number; percent: number | null }
>;

function progressGroup(
  category: ActionPlanActionDto["expectedOutcome"]["category"],
): DashboardProgressGroup | null {
  if (category === "product") return "product";
  if (category === "customers" || category === "revenue") return "sales";
  if (category === "fundraising") return "fundraising";
  if (category === "expansion") return "expansion";
  return null;
}

export function calculateDashboardProgress(
  actions: ActionPlanActionDto[],
): DashboardProgress {
  const progress = Object.fromEntries(
    DASHBOARD_PROGRESS_GROUPS.map((group) => [
      group,
      { done: 0, total: 0, percent: null },
    ]),
  ) as DashboardProgress;

  for (const action of actions) {
    const group = progressGroup(action.expectedOutcome.category);
    if (!group) continue;
    progress[group].total += 1;
    if (action.done) progress[group].done += 1;
  }

  for (const group of DASHBOARD_PROGRESS_GROUPS) {
    const row = progress[group];
    row.percent = row.total > 0 ? Math.round((row.done / row.total) * 100) : null;
  }

  return progress;
}

export function nextCompanyStage(stage: string): CompanyStage | null {
  const index = COMPANY_STAGES.indexOf(stage as CompanyStage);
  if (index < 0 || index === COMPANY_STAGES.length - 1) return null;
  return COMPANY_STAGES[index + 1];
}
