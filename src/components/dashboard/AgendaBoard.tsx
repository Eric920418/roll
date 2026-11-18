"use client";

import { PlanLocalizationProvider } from "./PlanLocalization";
import { useState, type ReactNode } from "react";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import PlanRefresh, { notifyPlanChanged } from "./PlanRefresh";
import FlowWorkspace from "./flow/Workspace";
import RoadmapPanel from "./RoadmapPanel";
import ActionPlanManager from "@/components/dashboard/ActionPlanManager";

type Props = {
  userId: string;
  title?: ReactNode;
  guided?: boolean;
  actionPlan: ActionPlanDto | null;
};

export default function AgendaBoard({ userId, actionPlan, guided = false, title }: Props) {
  const [planState, setPlanState] = useState({ source: actionPlan, current: actionPlan });
  if (planState.source !== actionPlan) {
    const current = planState.current;
    setPlanState({ source: actionPlan, current: current?.id === actionPlan?.id && (current?.revision || 0) > (actionPlan?.revision || 0) ? current : actionPlan });
  }
  const currentPlan = planState.current;
  function acceptPlan(next: ActionPlanDto | null) {
    setPlanState(prev => ({ ...prev, current: prev.current?.id === next?.id && (prev.current?.revision || 0) > (next?.revision || 0) ? prev.current : next }));
    notifyPlanChanged(userId);
  }

  return (
    <PlanLocalizationProvider planId={currentPlan?.id} revision={currentPlan?.revision}><div className="flex flex-col gap-4">
      <PlanRefresh userId={userId} />
      {!currentPlan && <>{title}<ActionPlanManager guided={guided} initialPlan={null} onChanged={acceptPlan} /><RoadmapPanel userId={userId} initialPlan={null} onChanged={acceptPlan} /></>}
      {currentPlan && <>{currentPlan.workflowVersion === 2 ? <FlowWorkspace key={currentPlan.id} title={title} userId={userId} plan={currentPlan} onChanged={acceptPlan} /> : <RoadmapPanel key={currentPlan.id} title={title} userId={userId} initialPlan={currentPlan} onChanged={acceptPlan} />}</>}

    </div></PlanLocalizationProvider>
  );
}
