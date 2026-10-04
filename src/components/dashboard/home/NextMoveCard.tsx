"use client";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import ActionTaskRow from "../ActionTaskRow";
import { useDashboardUser } from "../DashboardUserProvider";
import { notifyPlanChanged } from "../PlanRefresh";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
export default function NextMoveCard({ action, revision, href }: { action: ActionPlanActionDto; revision?: number; href: string }) {
  const router = useRouter(), userId = useDashboardUser(), zh = useLocale() === "zh-tw";
  return <div className={`min-w-0 ${action.dependency.blocked ? "opacity-65" : ""}`}><ActionTaskRow action={action} revision={revision} href={href} onMetric={async metric => {
    const res = await fetch(`/api/action-plans/actions/${action.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metric) });
    const json = await res.json(); if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    notifyPlanChanged(userId || undefined); router.refresh();
  }} /><button type="button" disabled={action.dependency.blocked} className="mt-2 min-h-11 rounded-xl disabled:cursor-not-allowed disabled:opacity-50 border border-dark/15 px-4 text-sm" onClick={() => { window.dispatchEvent(new CustomEvent("nova-schedule-task", { detail: action.id })); document.getElementById("this-week")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{zh ? "安排時間" : "Schedule"} ↗</button></div>;
}
