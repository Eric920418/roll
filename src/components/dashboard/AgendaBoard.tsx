"use client";

import NextStepsTour from "./NextStepsTour";
import { PlanLocalizationProvider } from "./PlanLocalization";
import { useState } from "react";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import PlanRefresh, { notifyPlanChanged } from "./PlanRefresh";
import FlowWorkspace from "./flow/Workspace";
import RoadmapPanel from "./RoadmapPanel";
import ActionPlanManager, { ActionDiagnosis } from "@/components/dashboard/ActionPlanManager";
import { useLocale } from "next-intl";

type Props = {
  userId: string;
  guided?: boolean;
  actionPlan: ActionPlanDto | null;
};

export default function AgendaBoard({ userId, actionPlan, guided = false }: Props) {
  const zh = useLocale() === "zh-tw";
  const [planState, setPlanState] = useState({ source: actionPlan, current: actionPlan });
  if (planState.source !== actionPlan) {
    const current = planState.current;
    setPlanState({ source: actionPlan, current: current?.id === actionPlan?.id && (current?.revision || 0) > (actionPlan?.revision || 0) ? current : actionPlan });
  }
  const currentPlan = planState.current;
  const currentTask = currentPlan?.nextMoves[0] || currentPlan?.actions.find(a => !a.done && !a.dependency.blocked);
  const awaitingOutcome = currentPlan?.roadmap?.milestones.some(m => !m.achievedAt && ["awaiting", "unplanned"].includes(m.status));
  function acceptPlan(next: ActionPlanDto | null) {
    setPlanState(prev => ({ ...prev, current: prev.current?.id === next?.id && (prev.current?.revision || 0) > (next?.revision || 0) ? prev.current : next }));
    notifyPlanChanged(userId);
  }

  return (
    <PlanLocalizationProvider planId={currentPlan?.id} revision={currentPlan?.revision}><div className="mt-4 flex flex-col gap-4">
      <PlanRefresh userId={userId} />
      {currentPlan?.personalization?.weeklyTime === "under3" && <p className="rounded-xl border border-dark/15 bg-white p-5 text-sm">{zh ? "本週只聚焦目前這一步，後續任務依序安排。" : "Focus on the current step this week. Later tasks follow in order."}</p>}
      {!currentPlan && <><ActionPlanManager guided={guided} initialPlan={null} onChanged={acceptPlan} /><RoadmapPanel userId={userId} initialPlan={null} onChanged={acceptPlan} /></>}
      {currentPlan && <>{currentPlan.workflowVersion === 2 ? <FlowWorkspace key={currentPlan.id} userId={userId} plan={currentPlan} onChanged={acceptPlan} /> : <RoadmapPanel key={currentPlan.id} userId={userId} initialPlan={currentPlan} onChanged={acceptPlan} />}<ActionDiagnosis plan={currentPlan} /></>}

    </div>{currentPlan && <NextStepsTour workflowVersion={currentPlan.workflowVersion} mission={currentTask?.title || (awaitingOutcome ? (zh ? "確認本階段成果並繼續" : "Confirm this stage’s outcomes and continue") : (zh ? "驗證你的目標客戶" : "Validate your target customer"))} target={currentTask?.metric?.target} reward={Boolean(currentTask)} />}</PlanLocalizationProvider>
  );
}
