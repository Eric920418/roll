"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useDashboardUser } from "../DashboardUserProvider";
import InterviewWorkspace, { InterviewInsights } from "../InterviewWorkspace";
import { notifyPlanChanged } from "../PlanRefresh";
import { interviewTarget, workspaceKind } from "@/lib/action-plan/workspace";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import type { WeekPlan } from "@/lib/week-plan/schema";
import { pathForLocale } from "@/lib/routes";
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/20 px-4 py-2 text-sm font-semibold disabled:opacity-50";
async function read<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const raw = await res.text(); let body;
  try { body = JSON.parse(raw); } catch { throw new Error(`HTTP ${res.status}: ${raw || res.statusText}`); }
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body.data;
}
export default function HomeLogButton({ canRecord }: { canRecord: boolean }) {
  const locale = useLocale() === "zh-tw" ? "zh-tw" : "en", zh = locale === "zh-tw", userId = useDashboardUser();
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLElement | null>(null), pending = useRef(false);
  const [plan, setPlan] = useState<ActionPlanDto | null>(null), [actionId, setActionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [target, setTarget] = useState(""), [insights, setInsights] = useState(false);
  const action = plan?.actions.find(a => a.id === actionId);
  async function open(id?: string) {
    if (pending.current) return; pending.current = true; setBusy(true); setError("");
    trigger.current = document.activeElement as HTMLElement; dialog.current?.showModal();
    try {
      const week = await read<WeekPlan>("/api/week-plan");
      const selected = id ?? week.interviewProgress?.actionId;
      if (!canRecord || !week.canScheduleActions) { setPlan(null); setActionId(null); return; }
      if (!selected) { setPlan(null); setActionId(null); return; }
      const result = await read<{ plan: ActionPlanDto | null }>(`/api/customer-insights?actionId=${encodeURIComponent(selected)}`);
      const task = result.plan?.actions.find(a => a.id === selected);
      if (!task || workspaceKind(task) !== "interview") throw new Error(zh ? "訪談任務已變更，請重新查看 Next Steps。" : "The interview task changed. Review Next Steps.");
      setPlan(result.plan); setActionId(selected); setTarget(String(interviewTarget(task) ?? ""));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { pending.current = false; setBusy(false); }
  }
  useEffect(() => {
    const handler = (event: Event) => { void open((event as CustomEvent<string>).detail); };
    window.addEventListener("nova-home-interview", handler);
    return () => window.removeEventListener("nova-home-interview", handler);
    // The dialog reloads current ownership and entitlement for every opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRecord, zh]);
  function changed(next: ActionPlanDto | null) { setPlan(next); notifyPlanChanged(userId || undefined); }
  async function confirmTarget() {
    if (!action || !plan || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { changed(await read<ActionPlanDto>(`/api/action-plans/actions/${action.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: plan.revision, recordingMode: "interview", metricTarget: Number(target) }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <>
    <button type="button" onClick={() => void open()} className="inline-flex min-h-12 items-center justify-center rounded-full bg-dark px-6 py-3 text-base font-bold text-white hover:bg-dark/85 focus-visible:outline-2 focus-visible:outline-offset-4">+ {zh ? "記錄訪談" : "Log interview"}</button>
    <dialog ref={dialog} aria-labelledby="home-interview-title" onClose={() => { if (trigger.current?.isConnected) trigger.current.focus(); }} className="nova-theme fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-3xl bg-white p-5 text-dark backdrop:bg-black/50 sm:p-7">
      <header className="flex items-center justify-between gap-3"><h2 id="home-interview-title" className="text-2xl font-bold">{zh ? "記錄訪談" : "Log interview"}</h2><button type="button" className={button} onClick={() => dialog.current?.close()}>{zh ? "關閉" : "Close"}</button></header>
      {busy && <p role="status" className="mt-4">{zh ? "載入中…" : "Loading…"}</p>}
      {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap break-words">{error}</p><button type="button" className={`${button} mt-2`} disabled={busy} onClick={() => void open(actionId ?? undefined)}>{zh ? "重試" : "Retry"}</button></div>}
      {action && plan ? <><h3 className="mt-5 font-bold">{action.title}</h3>{!interviewTarget(action) ? <form onSubmit={event => { event.preventDefault(); void confirmTarget(); }} className="mt-4 space-y-3"><label className="block text-sm font-semibold">{zh ? "目標訪談公司數" : "Target number of companies"}<input type="number" required min={1} max={1000000000} step={1} value={target} onChange={event => setTarget(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-dark/20 px-3" /></label><button className={button} disabled={busy}>{zh ? "確認目標" : "Confirm target"}</button></form> : <InterviewWorkspace userId={userId!} action={action} busy={busy} onChanged={changed} onInsights={() => setInsights(true)} />}
        <Link href={`${pathForLocale("/dashboard/agenda", locale)}#action-${action.id}`} className={`${button} mt-5`}>{zh ? "到 Next Steps 確認任務完成" : "Review and complete in Next Steps"}</Link></>
        : !busy && !error && <div className="mt-5 space-y-3"><p>{canRecord ? (zh ? "目前沒有訪談任務。先在 Next Steps 建立或選擇訪談任務。" : "No interview task yet. Create or choose one in Next Steps.") : (zh ? "訪談工作區需有效 Pro 以上方案。" : "The interview workspace requires an active Pro plan.")}</p><Link className={button} href={pathForLocale(canRecord ? "/dashboard/agenda" : "/dashboard/account#plan", locale)}>{canRecord ? "Next Steps" : zh ? "查看方案" : "View plans"}</Link></div>}
    </dialog>
    {insights && action && <InterviewInsights actionId={action.id} title={action.title} onClose={() => setInsights(false)} />}
  </>;
}
