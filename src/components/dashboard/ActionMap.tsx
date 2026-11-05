"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import type { ActionPlanDto } from "@/lib/action-plan/service";

export default function ActionMap({ userId, plan, event, children }: {
  userId: string; plan: ActionPlanDto; event: string | null; children: ReactNode;
}) {
  const zh = useLocale() === "zh-tw", ref = useRef<HTMLDetailsElement>(null);
  const [warning, setWarning] = useState("");
  const milestones = plan.roadmap?.milestones || [];
  const current = milestones.find(m => !m.achievedAt);
  const completed = plan.actions.filter(a => a.done).length;
  useEffect(() => {
    function reveal() { if (window.location.hash === "#action-map" && ref.current) ref.current.open = true; }
    reveal(); window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [plan.id]);
  useEffect(() => {
    if (!event) return;
    const key = `nova:action-map:v1:${userId}:${plan.id}:${event}`;
    const timer = setTimeout(() => {
      try {
        if (localStorage.getItem(key)) return;
        if (ref.current) ref.current.open = true;
        localStorage.setItem(key, "seen");
      } catch {
        if (ref.current) ref.current.open = true;
        setWarning(zh ? "無法記住行動地圖的展開狀態；你的計畫與紀錄不受影響。" : "The map preference could not be saved. Your plan and records are retained.");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [event, userId, plan.id, zh]);
  return <div className="mt-8 min-w-0">
    {warning && <p role="status" className="mb-3 text-sm text-amber-800">{warning}</p>}
    <details data-next-step="map" id="action-map" ref={ref} className="scroll-mt-6 rounded-2xl border border-dark/15 bg-dark/[0.015] p-4 sm:p-5">
      <summary className="min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h3 className="text-lg font-semibold">{zh ? "行動地圖" : "Action map"}</h3><p className="mt-1 text-sm text-dark/65">{current ? `${zh ? "目前里程碑" : "Current milestone"} ${current.position + 1} · ${current.title}` : zh ? "目前計畫" : "Current plan"}</p></div>
          <span className="inline-flex min-h-11 items-center rounded-xl border border-dark/15 bg-white px-4 text-sm font-semibold">{zh ? "查看全部步驟" : "View all steps"} ↕</span>
        </div>
        <div className="mt-4 flex gap-1.5" aria-hidden="true">{milestones.length > 0 ? milestones.map(m => <span key={m.id} className={`h-1.5 min-w-0 flex-1 rounded-full ${m.achievedAt ? "bg-black" : m.id === current?.id ? "bg-dark/45" : "bg-dark/10"}`} />) : <progress className="h-1.5 w-full accent-black" value={completed} max={Math.max(1, plan.actions.length)} />}</div>
        <p className="mt-3 text-sm text-dark/65">{milestones.length > 0 ? `${milestones.length} ${zh ? "個里程碑 · " : (milestones.length === 1 ? "milestone · " : "milestones · ")}` : ""}{completed} / {plan.actions.length} {zh ? "步已完成" : "steps completed"}{current?.targetDate ? ` · ${zh ? "截止" : "Due"} ${current.targetDate}` : ""}</p>
      </summary>
      <div className="mt-5 border-t border-dark/10 pt-1">{children}</div>
    </details>
  </div>;
}
