"use client";

import { useState } from "react";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import PlanRefresh, { notifyPlanChanged } from "./PlanRefresh";
import RoadmapPanel from "./RoadmapPanel";
import ActionPlanManager, { ActionDiagnosis } from "@/components/dashboard/ActionPlanManager";
import { useLocale } from "next-intl";
import { actionProgress } from "@/lib/dashboard/next-steps";

type Props = {
  userId: string;
  guided?: boolean;
  hideProgress?: boolean;
  actionPlan: ActionPlanDto | null;
};

export default function AgendaBoard({ userId, actionPlan, guided = false, hideProgress = false }: Props) {
  const zh = useLocale() === "zh-tw";
  const [planState, setPlanState] = useState({ source: actionPlan, current: actionPlan });
  if (planState.source !== actionPlan) {
    const current = planState.current;
    setPlanState({ source: actionPlan, current: current?.id === actionPlan?.id && (current?.revision || 0) > (actionPlan?.revision || 0) ? current : actionPlan });
  }
  const currentPlan = planState.current;
  const progress = actionProgress(currentPlan?.actions || []);
  function acceptPlan(next: ActionPlanDto | null) {
    setPlanState(prev => ({ ...prev, current: prev.current?.id === next?.id && (prev.current?.revision || 0) > (next?.revision || 0) ? prev.current : next }));
    notifyPlanChanged(userId);
  }

  return (
    <div className="mt-7 flex flex-col gap-8">
      <PlanRefresh userId={userId} />
      {!hideProgress && <section data-next-step="insights" aria-label={zh ? "計畫進度" : "Plan progress"} className="rounded-2xl border border-dark/15 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-dark/65">{zh ? "整體進度" : "Overall progress"}</p><div className="mt-4 flex flex-wrap items-baseline gap-3"><span aria-live="polite" className="text-5xl font-bold tracking-tight">{progress}%</span><span className="text-base text-dark/65">{zh ? "目前計畫已完成" : "of your plan completed"}</span></div>
        <div role="progressbar" aria-label={zh ? "任務與小步驟進度" : "Task and step progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mt-3 h-3 overflow-hidden rounded-full bg-dark/10"><div className="h-full rounded-full bg-black transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
      </section>}
      {!currentPlan && <><ActionPlanManager guided={guided} initialPlan={null} onChanged={acceptPlan} /><RoadmapPanel userId={userId} initialPlan={null} onChanged={acceptPlan} /></>}
      {currentPlan && <><RoadmapPanel userId={userId} initialPlan={currentPlan} onChanged={acceptPlan} /><ActionDiagnosis plan={currentPlan} /></>}

    </div>
  );
}
