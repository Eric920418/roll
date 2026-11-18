"use client";

import { PlanLocalizationProvider } from "./PlanLocalization";
import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { memberFetch } from "@/lib/member-fetch";
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
  const locale = useLocale(), zh = locale === "zh-tw";
  const [upgradeError, setUpgradeError] = useState("");
  const [retry, setRetry] = useState(0);
  const upgrade = useEffectEvent(async () => {
    const plan = currentPlan;
    if (!plan?.legacyUpgradeAvailable) return;
    setUpgradeError("");
    const url = "/api/action-plans/flow?locale=" + locale;
    try {
      const next = await memberFetch<{ plan: ActionPlanDto }>(url, { method: "POST", body: JSON.stringify({ action: "upgradeLegacy", planId: plan.id, revision: plan.revision }) });
      acceptPlan(next.plan);
    } catch (error) {
      const latest = await memberFetch<{ plan: ActionPlanDto }>(url + "&planId=" + encodeURIComponent(plan.id)).catch(() => null);
      if (latest?.plan.workflowVersion === 2) acceptPlan(latest.plan);
      else {
        if (latest) acceptPlan(latest.plan);
        setUpgradeError(error instanceof Error ? error.message : String(error));
      }
    }
  });
  const legacyPlanId = currentPlan?.legacyUpgradeAvailable && currentPlan.id;
  useEffect(() => {
    if (!legacyPlanId) return;
    const timer = setTimeout(() => void upgrade(), 0);
    return () => clearTimeout(timer);
  }, [legacyPlanId, retry]);
  function acceptPlan(next: ActionPlanDto | null) {
    setPlanState(prev => ({ ...prev, current: prev.current?.id === next?.id && (prev.current?.revision || 0) > (next?.revision || 0) ? prev.current : next }));
    notifyPlanChanged(userId);
  }

  return (
    <PlanLocalizationProvider planId={currentPlan?.id} revision={currentPlan?.revision}><div className="flex flex-col gap-4">
      <PlanRefresh userId={userId} />
      {!currentPlan && <>{title}<ActionPlanManager guided={guided} initialPlan={null} onChanged={acceptPlan} /><RoadmapPanel userId={userId} initialPlan={null} onChanged={acceptPlan} /></>}
      {currentPlan && <>{currentPlan.workflowVersion === 2 ? <FlowWorkspace key={currentPlan.id} title={title} userId={userId} plan={currentPlan} onChanged={acceptPlan} /> : currentPlan.legacyUpgradeAvailable ? <section data-task-reference="" className="space-y-3">
        {title}
        {upgradeError ? <><p role="alert" className="text-sm text-red-800">{upgradeError}</p><button type="button" className="min-h-11 rounded-full border px-4" onClick={() => setRetry(n => n + 1)}>{zh ? "重試" : "Retry"}</button></> : <p role="status">{zh ? "正在載入今日任務…" : "Loading today’s tasks…"}</p>}
      </section> : <RoadmapPanel key={currentPlan.id} title={title} userId={userId} initialPlan={currentPlan} onChanged={acceptPlan} />}</>}

    </div></PlanLocalizationProvider>
  );
}
