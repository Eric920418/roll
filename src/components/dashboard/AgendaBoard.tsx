"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import PlanRefresh, { notifyPlanChanged } from "./PlanRefresh";
import WeeklyCheckIn from "./WeeklyCheckIn";
import RoadmapPanel from "./RoadmapPanel";
import ActionPlanManager from "@/components/dashboard/ActionPlanManager";
import ChecklistTool from "@/components/dashboard/ChecklistTool";
import type { MilestoneGroupView } from "@/lib/tools/checklist";

type Props = {
  userId: string;
  guided?: boolean;
  canShare?: boolean;
  actionPlan: ActionPlanDto | null;
  milestoneGroups: MilestoneGroupView[];
};

export default function AgendaBoard({ userId, canShare = false, actionPlan, milestoneGroups, guided = false }: Props) {
  const t = useTranslations("Dashboard.agenda");
  const tGuide = useTranslations("Dashboard.gettingStarted");
  const [currentPlan, setCurrentPlan] = useState(actionPlan);
  useEffect(() => setCurrentPlan(prev => prev?.id === actionPlan?.id && (prev?.revision || 0) > (actionPlan?.revision || 0) ? prev : actionPlan), [actionPlan]);
  function acceptPlan(next: ActionPlanDto | null) { setCurrentPlan(prev => prev?.id === next?.id && (prev?.revision || 0) > (next?.revision || 0) ? prev : next); notifyPlanChanged(userId); }

  return (
    <div className="mt-7 flex flex-col gap-8">
      <PlanRefresh userId={userId} />
      {!currentPlan && <ActionPlanManager guided={guided} initialPlan={null} onChanged={acceptPlan} />}
      {currentPlan ? <><RoadmapPanel userId={userId} initialPlan={currentPlan} onChanged={acceptPlan} />
      <WeeklyCheckIn userId={userId} plan={currentPlan} canShare={canShare} onChanged={acceptPlan} />
      <ActionPlanManager guided={guided} initialPlan={currentPlan} onChanged={acceptPlan} /></>
      : <details className="rounded-2xl border border-dark/10 p-4"><summary className="min-h-11 cursor-pointer font-semibold">{tGuide("optionalRoadmap")}</summary><RoadmapPanel userId={userId} initialPlan={null} onChanged={acceptPlan} /></details>}

      <section id="milestones" className="scroll-mt-6">
        <h2 className="text-xl font-extrabold text-dark font-[family-name:var(--font-heading)]">{t("milestoneSection")}</h2>
        <p className="mt-1 text-sm text-dark/55">{t("milestoneSectionBody")}</p>
        <ChecklistTool key={JSON.stringify(milestoneGroups)} groups={milestoneGroups} />
      </section>

    </div>
  );
}
