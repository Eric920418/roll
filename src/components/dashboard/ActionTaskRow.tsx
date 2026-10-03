"use client";
import { useRef, useState } from "react";
import { useLocale } from "next-intl";
import TaskCheckbox from "./TaskCheckbox";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
import { taskReference, priorityTier } from "@/lib/action-plan/ranking";
import { formatActionTime } from "@/lib/action-plan/time";

export default function ActionTaskRow({ action, busy = false, readOnly = false, onToggle, onMetric, revision, onEdit, onDelete, href, compact = false, featured = false }: { action: ActionPlanActionDto; busy?: boolean; readOnly?: boolean; revision?: number; onToggle?: () => void; onMetric?: (metric: { metricTarget: number | null; metricUnit: string | null; metricCurrent: number | null; revision?: number }) => Promise<boolean | void>; onEdit?: () => void; onDelete?: () => void; href?: string; compact?: boolean; featured?: boolean }) {
  const zh = useLocale() === "zh-tw";
  const [target, setTarget] = useState(String(action.metric?.target ?? "")), [unit, setUnit] = useState(action.metric?.unit || ""), [value, setValue] = useState(String(action.metric?.current ?? ""));
  const metricRevision = useRef<number | undefined>(undefined);
  const [metricEditing, setMetricEditing] = useState(false);
  const shownTarget = metricEditing ? target : String(action.metric?.target ?? ""), shownUnit = metricEditing ? unit : action.metric?.unit || "", shownValue = metricEditing ? value : String(action.metric?.current ?? "");
  const captureRevision = () => { if (!metricEditing) { setTarget(shownTarget); setUnit(shownUnit); setValue(shownValue); } setMetricEditing(true); if (metricRevision.current == null) metricRevision.current = revision; };
  const status = action.done ? (zh ? "已完成" : "Done") : action.dependency.blocked ? (zh ? "受阻擋" : "Blocked") : (zh ? "可執行" : "Ready");
  const blockedReason = `${zh ? "先完成" : "Complete first"}: ${action.dependency.milestoneTitle || (action.dependency.missingLink ? (zh ? "請設定前置任務" : "Link prerequisites") : action.dependency.actionRefs.filter(d => !d.done).map(d => zh ? taskReference(d).replace(/^Milestone (\d+) · /, "里程碑 $1 的 ") : taskReference(d)).join(", "))}`;
  const button = "min-h-11 rounded-xl border border-dark/15 bg-white px-3 py-2 text-sm disabled:opacity-50";
  const fullDetails = <>    <details className="group mt-3 text-sm">
      <summary className="w-fit cursor-pointer font-bold text-dark"><span className="group-open:hidden">{zh ? "顯示更多" : "Show more"} ↓</span><span className="hidden group-open:inline">{zh ? "收起" : "Show less"} ↑</span></summary>
      <dl className="mt-3 space-y-3 whitespace-pre-wrap text-dark/70">
        <div><dt className="font-semibold">{zh ? "預期成果" : "Expected outcome"}</dt><dd>{action.expectedOutcome.text}</dd></div>
        <div><dt className="font-semibold">{zh ? "預估時間" : "Estimated time"}</dt><dd>{action.expectedOutcome.estimatedTime.minDays}–{action.expectedOutcome.estimatedTime.maxDays} {zh ? "天" : "days"} · {formatActionTime(action.difficulty.actionTime, zh ? "zh-tw" : "en")}</dd></div>
        <div><dt className="font-semibold">{zh ? "為何現在做" : "Why now"}</dt><dd>{action.bottleneckFit.reason}</dd></div>
        <div><dt className="font-semibold">{zh ? "階段適合度" : "Stage fit"}</dt><dd>{action.stageFit.reason}</dd></div>
        <div><dt className="font-semibold">{zh ? "前置任務" : "Blocked by / Prerequisites"}</dt><dd>{action.dependency.milestoneTitle || action.dependency.actionRefs.map(taskReference).join(", ") || (zh ? "無" : "None")}{action.dependency.notes ? `\n${action.dependency.notes}` : ""}</dd></div>
      </dl>
      {!readOnly && onMetric && <form className="mt-4 grid gap-2 sm:grid-cols-3" onSubmit={async e => { e.preventDefault(); const saved = await onMetric({ metricTarget: shownTarget ? Number(shownTarget) : null, metricUnit: shownUnit.trim() || null, metricCurrent: shownValue ? Number(shownValue) : null, revision: metricRevision.current ?? revision }); if (saved !== false) { metricRevision.current = undefined; setMetricEditing(false); } }}>
        <label>{zh ? "數量目標（選填）" : "Target (optional)"}<input type="number" min={1} max={1000000000} value={shownTarget} onChange={e => { captureRevision(); setTarget(e.target.value); }} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label>{zh ? "單位" : "Unit"}<input maxLength={80} value={shownUnit} onChange={e => { captureRevision(); setUnit(e.target.value); }} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label>{zh ? "累計值（未知請留白）" : "Cumulative (blank if unknown)"}<input type="number" min={0} max={1000000000} value={shownValue} onChange={e => { captureRevision(); setValue(e.target.value); }} className="mt-1 w-full rounded-lg border p-2" /></label>
        <button disabled={busy} className={button}>{zh ? "確認數量" : "Confirm metric"}</button><p className="text-xs sm:col-span-2">{zh ? "數量達標不會自動完成任務或確認成果。" : "Reaching a target does not automatically complete the task or confirm its outcome."}</p>
      </form>}
      <div className="mt-3 flex flex-wrap gap-2">{onEdit && <button type="button" disabled={busy} onClick={onEdit} className={button}>{zh ? "編輯" : "Edit"}</button>}{onDelete && <button type="button" disabled={busy} onClick={onDelete} className={`${button} text-red-700`}>{zh ? "刪除" : "Delete"}</button>}{href && <a href={href} className={button}>{zh ? "開啟 Next steps" : "Open Next steps"} →</a>}</div>
    </details></>;
  const checkbox = !readOnly && onToggle && <TaskCheckbox label={`${zh ? "完成任務" : "Complete task"}: ${action.title}`} checked={action.done} locked={!action.done && action.dependency.blocked} disabled={busy} reason={blockedReason} onChange={onToggle} />;
  const badges = <div className="mt-2 flex flex-wrap gap-2 text-xs"><span className={`rounded-md px-2 py-1 ${action.done ? "bg-dark/5" : action.dependency.blocked ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>{status}</span><span className="rounded-md bg-amber-100/70 px-2 py-1 text-amber-900">{priorityTier(action.priorityScore)}</span></div>;
  const metric = action.metric?.target != null && <p className="mt-3 text-sm font-semibold">{action.metric.current ?? (zh ? "尚未回報" : "Not reported")}/{action.metric.target} {action.metric.unit}</p>;
  const shortBlocker = action.dependency.milestoneTitle || (action.dependency.missingLink ? (zh ? "請設定前置任務" : "Link prerequisites") : action.dependency.actionRefs.filter(d => !d.done).map(d => `${d.crossMilestone && d.milestonePosition != null ? (zh ? `里程碑 ${Number(d.milestonePosition) + 1} 的 ` : `Milestone ${Number(d.milestonePosition) + 1} · `) : ""}#${d.displayNumber}`).join(", "));
  const number = <span aria-hidden="true" className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dark/20 text-sm font-bold">{action.displayNumber}</span>;
  if (compact) return <article className={`min-w-0 rounded-2xl border bg-white p-3 [overflow-wrap:anywhere] sm:p-4 ${featured ? "border-sky-200" : "border-dark/10"}`}>
    <div className="flex items-start gap-2 sm:gap-3"><div className="flex shrink-0 flex-col items-center gap-2 sm:flex-row sm:items-start">{number}{checkbox}</div>
      <details open={featured} className="group/task min-w-0 flex-1">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
          <h3 className={`min-w-0 flex-1 font-bold ${action.done ? "text-dark/50 line-through" : "text-dark"}`}>{action.title}</h3>
          {action.dependency.blocked && !action.done && <span className="order-last basis-full text-xs font-medium text-dark/60 sm:order-none sm:basis-auto">{zh ? "先完成" : "Finish first"}: {shortBlocker}</span>}
          <span aria-hidden="true" className="shrink-0 text-dark/50 group-open/task:rotate-180">⌄</span>
          <span className="sr-only">{zh ? "展開或收合任務" : "Expand or collapse task"}</span>
        </summary>
        {badges}<p className="mt-3 line-clamp-3 text-sm leading-6 text-dark/65">{action.expectedOutcome.text}</p>{metric}{fullDetails}
      </details>
    </div>
  </article>;
  return <article className="min-w-0 rounded-xl border border-dark/15 bg-white p-4 [overflow-wrap:anywhere]">
    <div className="flex items-start gap-3">{number}{checkbox}<div className="min-w-0 flex-1">
      <h3 className={`font-bold ${action.done ? "line-through text-dark/50" : "text-dark"}`}>{action.title}</h3>{badges}
      <p className="mt-2 line-clamp-1 text-sm text-dark/60">{action.expectedOutcome.text}</p>
      {action.dependency.blocked && <p className="mt-2 text-xs font-semibold text-amber-800">{blockedReason}</p>}{metric}
    </div></div>{fullDetails}
  </article>;
}
