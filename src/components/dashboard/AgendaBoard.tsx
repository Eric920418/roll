"use client";

import { useState } from "react";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import PlanRefresh, { notifyPlanChanged } from "./PlanRefresh";
import RoadmapPanel from "./RoadmapPanel";
import ActionPlanManager, { ActionDiagnosis } from "@/components/dashboard/ActionPlanManager";

type Props = {
  userId: string;
  guided?: boolean;
  actionPlan: ActionPlanDto | null;
};

export default function AgendaBoard({ userId, actionPlan, guided = false }: Props) {
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
    <div className="mt-7 flex flex-col gap-8">
      <PlanRefresh userId={userId} />
      {!currentPlan && <ActionPlanManager guided={guided} initialPlan={null} onChanged={acceptPlan} />}
      {currentPlan && <><RoadmapPanel userId={userId} initialPlan={currentPlan} onChanged={acceptPlan} /><ActionDiagnosis plan={currentPlan} /></>}

    </div>
  );
}
