"use client";

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
  function acceptPlan(next: ActionPlanDto | null) {
    setPlanState(prev => ({ ...prev, current: prev.current?.id === next?.id && (prev.current?.revision || 0) > (next?.revision || 0) ? prev.current : next }));
    notifyPlanChanged(userId);
  }

  return (
    <div className="mt-7 flex flex-col gap-8">
      <PlanRefresh userId={userId} />
      {currentPlan?.personalization?.weeklyTime === "under3" && <p className="rounded-xl border border-dark/15 bg-white p-5 text-sm">{zh ? "本週只聚焦目前這一步，後續任務依序安排。" : "Focus on the current step this week. Later tasks follow in order."}</p>}
      {!currentPlan && <><ActionPlanManager guided={guided} initialPlan={null} onChanged={acceptPlan} /><RoadmapPanel userId={userId} initialPlan={null} onChanged={acceptPlan} /></>}
      {currentPlan && <><ActionDiagnosis plan={currentPlan} />{currentPlan.workflowVersion === 2 ? <FlowWorkspace key={currentPlan.id} userId={userId} plan={currentPlan} onChanged={acceptPlan} /> : <RoadmapPanel userId={userId} initialPlan={currentPlan} onChanged={acceptPlan} />}</>}

    </div>
  );
}
