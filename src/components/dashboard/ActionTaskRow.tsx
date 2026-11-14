"use client";
import { usePlanDisplay } from "@/components/dashboard/PlanLocalization";
import { commercialTask } from "@/lib/validation/schema";
import type { ReactNode } from "react";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import TaskDependencyEditor from "./TaskDependencyEditor";
import TaskProgressLog from "./TaskProgressLog";
import { useLocale } from "next-intl";
import TaskCheckbox from "./TaskCheckbox";
import LearningResources from "./LearningResources";
import { workspaceKind, workspaceComplete } from "@/lib/action-plan/workspace";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
import { priorityTier } from "@/lib/action-plan/ranking";

export default function ActionTaskRow({ action, busy = false, readOnly = false, onToggle, onMetric, onDependencyChange, revision, onEdit, onDelete, href, compact = false, featured = false, focusMode = false, workspace, results, plan }: { results?: ReactNode; plan?: ActionPlanDto; focusMode?: boolean; workspace?: ReactNode; action: ActionPlanActionDto; busy?: boolean; readOnly?: boolean; revision?: number; onDependencyChange?: (thresholds: Record<string, number | null>, revision?: number) => Promise<boolean | void>; onToggle?: () => void; onMetric?: (metric: { metricTarget: number | null; metricUnit: string | null; metricCurrent: number | null; revision?: number }) => Promise<boolean | void>; onEdit?: () => void; onDelete?: () => void; href?: string; compact?: boolean; featured?: boolean }) {
  const { planText, planUnit, displayTaskReference } = usePlanDisplay();
  const locale = useLocale(), zh = locale === "zh-tw";
  const title = planText(action.title, locale), outcome = planText(action.expectedOutcome.text, locale);
  const status = action.done ? (zh ? "已完成" : "Done") : action.dependency.blocked ? (zh ? "受阻擋" : "Blocked") : (zh ? "可執行" : "Ready");
  const blockedReason = `${zh ? "前置條件" : "Requires"}: ${(action.dependency.milestoneTitle ? planText(action.dependency.milestoneTitle, locale) : "") || (action.dependency.missingLink ? (zh ? "請設定前置任務" : "Link prerequisites") : action.dependency.actionRefs.filter(d => !(d.resolved ?? d.done)).map(d => displayTaskReference(d, locale)).join(", "))}`;
  const button = "min-h-11 rounded-xl border border-dark/15 bg-white px-3 py-2 text-sm disabled:opacity-50";
  const taskActions = <>
      {!readOnly && onDependencyChange && action.dependency.actionRefs.length > 0 && <TaskDependencyEditor action={action} revision={revision} busy={busy} onSave={onDependencyChange} />}
      <div className="mt-3 flex flex-wrap gap-2">{onEdit && <button type="button" disabled={busy} onClick={onEdit} className={button}>{zh ? "編輯" : "Edit"}</button>}{onDelete && <button type="button" disabled={busy} onClick={onDelete} className={`${button} text-red-700`}>{zh ? "刪除" : "Delete"}</button>}{href && <a href={href} className={button}>{zh ? "開啟今日任務" : "Open today's tasks"} →</a>}</div>
    </>;
  const interviewPending = focusMode && action.recordingMode === "interview" && action.metric?.target != null && (action.metric.current ?? 0) < action.metric.target;
  const workspacePending = focusMode && Boolean(workspaceKind(action)) && workspaceKind(action) !== "interview" && !commercialTask(action) && !workspaceComplete(action.taskWorkspace ?? null);
  const lockReason = interviewPending ? (zh ? "達到有效訪談公司數目標後，才能確認完成" : "Reach the valid company conversation target before confirming completion") : workspacePending ? (zh ? "請先儲存符合完成標準的紀錄" : "Save records that meet the completion criteria first") : blockedReason;
  const checkbox = !readOnly && (onToggle || action.dependency.blocked) && <TaskCheckbox label={`${zh ? "完成任務" : "Complete task"}: ${title}`} checked={action.done} locked={!action.done && (action.dependency.blocked || interviewPending || workspacePending)} disabled={busy} reason={lockReason} onChange={onToggle || (() => {})} />;
  const badges = !focusMode && <div className="mt-2 flex flex-wrap gap-2 text-xs"><span className={`rounded-md px-2 py-1 ${action.done ? "bg-dark/5" : action.dependency.blocked ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>{status}</span><span className="rounded-md bg-amber-100/70 px-2 py-1 text-amber-900">{priorityTier(action.priorityScore)}</span></div>;
  const metric = <>{action.metric?.target != null && !(focusMode && workspace) && <div className="mt-3">
    <p className="text-sm font-semibold">{action.metric.current ?? (zh ? "尚未回報" : "Not reported")}/{action.metric.target} {planUnit(action.metric.unit || "", locale)}</p>
    {!focusMode && action.metric.current != null && <><progress className="mt-2 h-2 w-full overflow-hidden rounded-full appearance-none [&::-webkit-progress-bar]:bg-dark/10 [&::-webkit-progress-value]:bg-black [&::-moz-progress-bar]:bg-black" aria-label={zh ? "數量進度" : "Quantity progress"} value={Math.min(action.metric.current, action.metric.target)} max={action.metric.target} /></>}
  </div>}{!readOnly && onMetric && !action.done && !action.dependency.blocked && action.recordingMode !== "interview" && !action.taskWorkspace && !commercialTask(action) && !(focusMode && workspace) && <TaskProgressLog inline={focusMode} action={action} revision={revision} busy={busy} onSave={onMetric} />}</>;
  const shortBlocker = (action.dependency.milestoneTitle ? planText(action.dependency.milestoneTitle, locale) : "") || (action.dependency.missingLink ? (zh ? "請設定前置任務" : "Link prerequisites") : action.dependency.actionRefs.filter(d => !(d.resolved ?? d.done)).map(d => `${d.crossMilestone && d.milestonePosition != null ? (zh ? `里程碑 ${Number(d.milestonePosition) + 1} 的 ` : `Milestone ${Number(d.milestonePosition) + 1} · `) : ""}#${d.displayNumber}${d.minimumCurrent != null ? ` (${d.metricCurrent ?? "?"}/${d.minimumCurrent} ${d.metricUnit || ""})` : ""}`).join(", "));
  const number = <span aria-hidden="true" className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dark/20 text-sm font-bold">{action.displayNumber}</span>;
  if (compact && focusMode && featured && plan) {
    const milestone = plan.roadmap?.milestones.find(m => m.id === action.milestoneId);
    const group = plan.actions.filter(a => a.milestoneId === action.milestoneId);
    const workId = `task-work-${action.id}`;
    return <article className="min-w-0 space-y-4" data-legacy-task>
      <section data-today-priority className="rounded-xl bg-black p-4 text-white sm:p-5">
        <div className="flex flex-col items-start justify-between gap-4 lg:flex-row"><div className="min-w-0 w-full flex-1 lg:w-auto">
          <p className="text-[10px] font-semibold tracking-wider text-white/55">{milestone ? `${zh ? "里程碑" : "Milestone"} ${milestone.position + 1} · ${planText(milestone.title, locale)}` : zh ? "目前計畫" : "Current plan"} · {zh ? "行動" : "Action"} {group.findIndex(a => a.id === action.id) + 1} / {group.length}</p>
          <h2 className="mt-2 break-words text-lg font-bold sm:text-xl">{title}</h2>
          <div className="mt-3 flex flex-wrap gap-1" aria-hidden="true">{group.map(a => <span key={a.id} className={"h-1 w-7 rounded-full " + (a.done || a.id === action.id ? "bg-white" : "bg-white/20")} />)}</div>
        </div><button type="button" disabled={busy} className="min-h-11 shrink-0 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black focus-visible:outline-2 disabled:opacity-50" onClick={() => { const work = document.getElementById(workId); work?.scrollIntoView({ block: "start" }); work?.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a")?.focus(); }}>{zh ? "繼續本步行動" : "Work on this step"}</button></div>
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-white/15 pt-3 text-xs sm:grid-cols-[1.6fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-1"><dt className="text-[10px] tracking-wider text-white/50">{zh ? "完成標準" : "Completion criteria"}</dt><dd className="mt-2 whitespace-pre-wrap break-words leading-6">{outcome}</dd></div>
          <div><dt className="text-[10px] tracking-wider text-white/50">{zh ? "目前進度" : "Saved progress"}</dt><dd className="mt-2 font-semibold">{action.metric?.target != null ? `${action.metric.current ?? 0} / ${action.metric.target} ${planUnit(action.metric.unit || "", locale)}` : status}</dd></div>
          <div><dt className="text-[10px] tracking-wider text-white/50">{milestone ? zh ? "里程碑期限" : "Milestone due" : zh ? "目標期限" : "Goal due"}</dt><dd className="mt-2 font-semibold">{milestone?.targetDate || plan.roadmap?.deadline || "—"}</dd></div>
        </dl>
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" data-task-columns>
        <section id={workId} className="min-w-0 scroll-mt-6 space-y-3 rounded-xl border border-dark/10 bg-white p-4 sm:p-5" aria-label={zh ? "本步操作" : "Current step work"}><h3 className="text-base font-bold">{zh ? "操作區" : "Your work"}</h3>{metric}{workspace}{taskActions}
        {checkbox && !action.done && (action.dependency.blocked || interviewPending || workspacePending) && <p className="text-sm">{lockReason}</p>}{checkbox && <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-dark/15 bg-dark/[0.02] py-2 pl-2 pr-5 text-sm font-semibold">{checkbox}<span>{action.done ? (zh ? "已完成" : "Completed") : (zh ? "確認並完成" : "Confirm and complete")}</span></label>}</section>
        <aside className="min-w-0 space-y-4 rounded-xl border border-dark/10 bg-white p-5"><h3 className="font-bold">{zh ? "方法指引" : "How to approach it"}</h3><LearningResources visual kind={workspaceKind(action)} question={title} /></aside>
      </div>
      {results}
    </article>;
  }
  if (compact) return <article className={`min-w-0 rounded-2xl border bg-white p-3 [overflow-wrap:anywhere] sm:p-4 ${featured ? "border-black shadow-sm" : focusMode ? "border-dark/30" : "border-dark/10"}`}>
    <div className={focusMode ? "relative" : "flex items-start gap-2 sm:gap-3"}><div className={focusMode ? "absolute left-0 top-0 flex items-start gap-2" : "flex shrink-0 flex-col items-center gap-2 sm:flex-row sm:items-start"}>{number}{!featured && checkbox}</div>
      <details key={featured ? "featured" : "secondary"} open={featured} className="group/task min-w-0 flex-1">
        <summary className={`flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden ${focusMode ? (featured ? "pl-12" : "pl-24") : ""}`}>
          <h3 className={`min-w-0 flex-1 font-bold ${focusMode && featured ? "text-lg sm:text-2xl leading-snug" : ""} ${action.done ? "text-dark/50 line-through" : focusMode && !featured ? "text-dark/60" : "text-dark"}`}>{title}</h3>
          {!focusMode && action.dependency.blocked && !action.done && <span className="order-last basis-full text-xs font-medium text-dark/60 sm:order-none sm:basis-auto">{zh ? "前置條件" : "Requires"}: {shortBlocker}</span>}
          <span aria-hidden="true" className="ml-auto shrink-0 text-dark/50 group-open/task:rotate-180">⌄</span>
          <span className="sr-only">{zh ? "展開或收合任務" : "Expand or collapse task"}</span>
        </summary>
        {badges}<div className="mt-4 border-t border-dark/10 pt-4">{focusMode && <p className="text-xs font-semibold tracking-wide text-dark/55">{zh ? "完成標準" : "COMPLETION CRITERIA"}</p>}<p className="mt-2 whitespace-pre-wrap text-base leading-7 text-dark/75">{outcome}</p></div>{focusMode && !workspace && <div className="mt-5"><LearningResources kind={workspaceKind(action)} question={title} /></div>}{metric}{workspace}{taskActions}{featured && checkbox && <label className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-dark/15 bg-dark/[0.02] py-2 pl-2 pr-5 text-sm font-semibold">{checkbox}<span>{action.done ? (zh ? "已完成" : "Completed") : (zh ? "確認並完成" : "Confirm and complete")}</span></label>}
      </details>
    </div>
  </article>;
  return <article className="min-w-0 rounded-xl border border-dark/15 bg-white p-4 [overflow-wrap:anywhere]">
    <div className="flex items-start gap-3">{number}{checkbox}<div className="min-w-0 flex-1">
      <h3 className={`font-bold ${action.done ? "line-through text-dark/50" : "text-dark"}`}>{title}</h3>{badges}
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-dark/60">{outcome}</p>
      {action.dependency.blocked && <p className="mt-2 text-xs font-semibold text-amber-800">{blockedReason}</p>}{metric}
    </div></div>{taskActions}
  </article>;
}
