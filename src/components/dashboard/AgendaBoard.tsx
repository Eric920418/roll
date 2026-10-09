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
  const progress = actionProgress(currentPlan?.actions || []);
  function acceptPlan(next: ActionPlanDto | null) {
    setPlanState(prev => ({ ...prev, current: prev.current?.id === next?.id && (prev.current?.revision || 0) > (next?.revision || 0) ? prev.current : next }));
    notifyPlanChanged(userId);
  }

  return (
    <div className="mt-7 flex flex-col gap-8">
      <PlanRefresh userId={userId} />
      <section aria-label={zh ? "計畫進度" : "Plan progress"} className="rounded-2xl border border-dark/15 bg-white p-5">
        <div className="flex items-center justify-between gap-3 font-semibold"><span>{zh ? "目前計畫進度" : "Your plan progress"}</span><span aria-live="polite">{progress}%</span></div>
        <div role="progressbar" aria-label={zh ? "任務與小步驟進度" : "Task and step progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mt-3 h-3 overflow-hidden rounded-full bg-dark/10"><div className="h-full rounded-full bg-black transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
        <p className="mt-3 text-sm text-dark/60">{currentPlan?.actions.length ? (zh ? "依任務及已記錄的數量進度計算。每間不同公司的有效訪談都計入；全部確認完成才達 100%。" : "Based on tasks and recorded steps. Each valid interview with a distinct company counts; 100% requires confirming every task.") : (zh ? "建立計畫後，完成任務或記錄小步驟就會更新進度。" : "Build a plan to track tasks and recorded steps.")}</p>
      </section>
      {!currentPlan && <><ActionPlanManager guided={guided} initialPlan={null} onChanged={acceptPlan} /><RoadmapPanel userId={userId} initialPlan={null} onChanged={acceptPlan} /></>}
      {currentPlan && <><RoadmapPanel userId={userId} initialPlan={currentPlan} onChanged={acceptPlan} /><ActionDiagnosis plan={currentPlan} /></>}

    </div>
  );
}
