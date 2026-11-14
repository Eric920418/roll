"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePlanDisplay } from "@/components/dashboard/PlanLocalization";
import { useLocale } from "next-intl";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import { actionProgress } from "@/lib/dashboard/next-steps";

export default function ActionMap({ userId, plan, event, children, tools, compact = false }: {
  userId: string; plan: ActionPlanDto; event: string | null; children: ReactNode; tools?: ReactNode; compact?: boolean;
}) {
  const { planText } = usePlanDisplay();
  const locale = useLocale(), zh = locale === "zh-tw", ref = useRef<HTMLDetailsElement>(null);
  const [warning, setWarning] = useState(""), [open, setOpen] = useState(false);
  const milestones = plan.roadmap?.milestones || [];
  const current = milestones.find(m => !m.achievedAt);
  const completed = plan.actions.filter(a => a.done).length;
  const progress = milestones.map(m => ({ ...m, progress: m.achievedAt ? 100 : Math.min(99, actionProgress(plan.actions.filter(a => a.milestoneId === m.id))) }));
  const milestoneBar = (m: typeof progress[number]) => <div role="progressbar" aria-label={`${planText(m.title, locale)} · ${zh ? "已儲存進度" : "Saved progress"}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.progress} className="h-1.5 min-w-0 overflow-hidden rounded-full bg-dark/10"><div className="h-full bg-black transition-[width] motion-reduce:transition-none" style={{ width: `${m.progress}%` }} /></div>;
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
    {compact && <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-bold"><span className="mr-3 text-[10px] tracking-wider text-dark/40">04</span>{zh ? "行動地圖" : "Action map"}</h3>{tools}</div>}
    <details data-next-step="map" id="action-map" ref={ref} onToggle={e => setOpen(e.currentTarget.open)} className={"scroll-mt-6 rounded-xl border border-dark/10 p-4 sm:p-5 " + (compact ? "bg-white" : "bg-dark/[0.015] ")}>
      <summary className="min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {compact ? <div className="grid items-center gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <div className="min-w-0"><p className="mt-1 break-words text-sm font-bold">{current ? `${zh ? "里程碑" : "Milestone"} ${current.position + 1} · ${planText(current.title, locale)}` : zh ? "目前計畫" : "Current plan"}</p></div>
          <ol className="grid min-w-0 grid-cols-2 gap-3 sm:col-span-3 sm:row-start-2 sm:grid-cols-5" aria-label={zh?'里程碑進度':'Milestone progress'}>{progress.map(m=><li key={m.id} aria-current={m.id === current?.id ? 'step' : undefined} className="min-w-0">{milestoneBar(m)}<div className="mt-2 flex justify-between gap-2 text-[10px] text-dark/60"><span>{String(m.position+1).padStart(2,'0')}{m.achievedAt ? ' ✓' : m.id === current?.id ? (zh ? ' · 目前階段' : ' · Current') : ''}</span><span>{m.progress}%</span></div><p className="mt-1 break-words text-xs font-semibold">{planText(m.title,locale)}</p><p className="mt-1 text-[10px] text-dark/50">{m.targetDate || '—'}</p></li>)}</ol>
          <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/15 bg-white px-4 text-xs font-semibold sm:col-start-3">{open ? (zh ? "收合步驟" : "Collapse steps") : (zh ? "展開步驟" : "Expand steps")} ↕</span>
        </div> : <><div className="flex flex-wrap items-center justify-between gap-4">
          <div><h3 className="text-lg font-semibold">{zh ? "行動地圖" : "Action map"}</h3><p className="mt-1 text-sm text-dark/65">{current ? `${zh ? "目前里程碑" : "Current milestone"} ${current.position + 1} · ${planText(current.title, locale)}` : zh ? "目前計畫" : "Current plan"}</p></div>
          <span className="inline-flex min-h-11 items-center rounded-xl border border-dark/15 bg-white px-4 text-sm font-semibold">{open ? (zh ? "收合步驟" : "Collapse steps") : (zh ? "展開步驟" : "Expand steps")} ↕</span>
        </div>
        <div className="mt-4 flex gap-1.5">{milestones.length > 0 ? progress.map(m => <div key={m.id} className="min-w-0 flex-1">{milestoneBar(m)}</div>) : <progress aria-label={zh ? "已完成步驟" : "Completed steps"} className="h-1.5 w-full accent-black" value={completed} max={Math.max(1, plan.actions.length)} />}</div>
        </>}
      </summary>
      <div className="mt-5 border-t border-dark/10 pt-1">{children}</div>
    </details>
  </div>;
}
