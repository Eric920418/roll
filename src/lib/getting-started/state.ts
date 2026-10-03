import { COMPANY_STAGES } from "../action-plan/constants";
import { PRIMARY_NEEDS } from "../icp/schema";
import type { ActionPlanDto } from "../action-plan/service";

export const GUIDE_VERSION = 1;
export const GUIDE_FIELDS = ["companyName", "oneLinePitch", "companyStage", "primaryNeed"] as const;
export type GuideField = typeof GUIDE_FIELDS[number];
export type GuideProfile = Partial<Record<GuideField, string | null>> | null;
export type GettingStartedView = {
  version: number;
  dismissedAt: string | null;
  completedAt: string | null;
  experienced: boolean;
  visible: boolean;
  canGenerate: boolean;
  missingFields: GuideField[];
  hasPlan: boolean;
  currentStep: 1 | 2 | 3;
  nextTask: { id: string; title: string; displayNumber: number } | null;
  blocked: "outcome" | "next_stage" | "prerequisites" | "no_tasks" | null;
  blockers: string[];
};
export function missingGuideFields(profile: GuideProfile): GuideField[] {
  return GUIDE_FIELDS.filter(key => !profile?.[key]?.trim() ||
    key === "companyStage" && !COMPANY_STAGES.includes(profile[key] as typeof COMPANY_STAGES[number]) ||
    key === "primaryNeed" && !PRIMARY_NEEDS.includes(profile[key] as typeof PRIMARY_NEEDS[number]));
}
export function gettingStartedState(input: {
  profile: GuideProfile; plan: ActionPlanDto | null; canGenerate: boolean;
  dismissedAt: Date | null; completedAt: Date | null; previouslyDone: boolean;
}): GettingStartedView {
  const missingFields = missingGuideFields(input.profile);
  const experienced = Boolean(input.completedAt || input.previouslyDone);
  const currentMilestone = input.plan?.roadmap?.milestones.find(m => !m.achievedAt);
  const ready = input.plan?.nextMoves.find(a => !a.done && !a.dependency.blocked);
  const blocked = !input.plan || ready ? null : currentMilestone?.status === "awaiting" ? "outcome"
    : currentMilestone?.status === "unplanned" ? "next_stage"
    : input.plan.blockers.length ? "prerequisites" : "no_tasks";
  return {
    version: GUIDE_VERSION, dismissedAt: input.dismissedAt?.toISOString() || null,
    completedAt: input.completedAt?.toISOString() || null, experienced,
    // Reopening uses a null dismissal; completion is permanent unless explicitly reopened.
    visible: !input.dismissedAt && !experienced, canGenerate: input.canGenerate,
    missingFields, hasPlan: Boolean(input.plan), currentStep: input.plan ? 3 : missingFields.length ? 1 : 2,
    nextTask: ready && input.canGenerate ? { id: ready.id, title: ready.title, displayNumber: ready.displayNumber || 1 } : null,
    blocked: input.canGenerate ? blocked : null,
    blockers: input.canGenerate ? input.plan?.blockers.map(b => [b.title, ...b.dependencies].join(" · ")).slice(0, 3) || [] : [],
  };
}
