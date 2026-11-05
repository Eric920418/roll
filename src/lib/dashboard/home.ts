import type { ActionPlanDto } from "../action-plan/service";
import { personalizationRoute } from "../action-plan/personalization";
import type { getDiscoverySnapshot } from "../discovery/service";

export function homeNextStep({ plan, isPaying, discovery }: {
  plan: ActionPlanDto | null;
  isPaying: boolean;
  discovery: Awaited<ReturnType<typeof getDiscoverySnapshot>> | null;
}) {
  const agenda = "/dashboard/agenda";
  if (isPaying && plan) {
    if (plan.workflowVersion === 2 && plan.workflowNeedsReview) return { kind: "blocked" as const, href: agenda + "#flow-evidence" };
    const action = plan.nextMoves.find(a => !a.done && !a.dependency.blocked)
      ?? plan.actions.find(a => !a.done && !a.dependency.blocked);
    if (action) return { kind: "action" as const, href: `${agenda}#action-${action.id}`, action };
    const milestone = plan.roadmap?.milestones.find(m => !m.achievedAt);
    if (milestone?.status === "awaiting" || milestone?.status === "unplanned")
      return { kind: milestone.status === "awaiting" ? "outcome" as const : "next" as const, href: `${agenda}#current-outcome` };
    if (plan.roadmap ? !milestone : plan.actions.length > 0 && plan.actions.every(a => a.done))
      return { kind: "complete" as const, href: plan.workflowVersion === 2 ? agenda + "#flow-report" : `${agenda}#action-map` };
    return { kind: "blocked" as const, href: `${agenda}#action-map` };
  }
  if (discovery && !isPaying && discovery.active) {
    if (discovery.needsSetup) return { kind: "setup" as const, href: `${agenda}#discovery` };
    if (discovery.setup?.personalization && personalizationRoute(discovery.setup.personalization) !== "interviews")
      return { kind: "starter" as const, href: `${agenda}#discovery` };
    return { kind: discovery.total < discovery.target ? "conversation" as const : "prospects" as const, href: `${agenda}#${discovery.total < discovery.target ? "discovery" : "prospects"}` };
  }
  return isPaying ? { kind: "setup" as const, href: `${agenda}?guide=build` }
    : { kind: "upgrade" as const, href: "/dashboard/account#plan" };
}

export const MATCHMAKING_TABS = ["recommendations", "all", "roundtables", "messages"] as const;
export type MatchmakingTab = typeof MATCHMAKING_TABS[number];
export function matchmakingTab(value?: string): MatchmakingTab {
  return MATCHMAKING_TABS.includes(value as MatchmakingTab) ? value as MatchmakingTab
    : value === "sharing" ? "messages" : "recommendations";
}
