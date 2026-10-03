"use client";
import { useRef, useState } from "react";
import { useLocale } from "next-intl";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
import { taskReference, priorityTier } from "@/lib/action-plan/ranking";
import { formatActionTime } from "@/lib/action-plan/time";

export default function ActionTaskRow({ action, busy = false, readOnly = false, onToggle, onMetric, revision, onEdit, onDelete, href }: { action: ActionPlanActionDto; busy?: boolean; readOnly?: boolean; revision?: number; onToggle?: () => void; onMetric?: (metric: { metricTarget: number | null; metricUnit: string | null; metricCurrent: number | null; revision?: number }) => Promise<boolean | void>; onEdit?: () => void; onDelete?: () => void; href?: string }) {
  const zh = useLocale() === "zh-tw";
  const [target, setTarget] = useState(String(action.metric?.target ?? "")), [unit, setUnit] = useState(action.metric?.unit || ""), [value, setValue] = useState(String(action.metric?.current ?? ""));
  const metricRevision = useRef<number | undefined>(undefined);
  const [metricEditing, setMetricEditing] = useState(false);
  const shownTarget = metricEditing ? target : String(action.metric?.target ?? ""), shownUnit = metricEditing ? unit : action.metric?.unit || "", shownValue = metricEditing ? value : String(action.metric?.current ?? "");
  const captureRevision = () => { if (!metricEditing) { setTarget(shownTarget); setUnit(shownUnit); setValue(shownValue); } setMetricEditing(true); if (metricRevision.current == null) metricRevision.current = revision; };
  const status = action.done ? (zh ? "已完成" : "Done") : action.dependency.blocked ? (zh ? "受阻擋" : "Blocked") : (zh ? "可執行" : "Ready");
  const button = "min-h-11 rounded-xl border border-dark/15 bg-white px-3 py-2 text-sm disabled:opacity-50";
  return <article className="min-w-0 rounded-xl border border-dark/15 bg-white p-4 [overflow-wrap:anywhere]">
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dark/20 font-bold">{action.displayNumber}</span>
      {!readOnly && onToggle && <input type="checkbox" className="mt-2 h-5 w-5 shrink-0 accent-black" aria-label={`${zh ? "完成任務" : "Complete task"}: ${action.title}`} checked={action.done} disabled={busy || (!action.done && action.dependency.blocked)} onChange={onToggle} />}
      <div className="min-w-0 flex-1"><h3 className={`font-bold ${action.done ? "line-through text-dark/50" : "text-dark"}`}>{action.title}</h3><div className="mt-1 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-dark/5 px-2 py-1">{status}</span><span className="rounded-full bg-dark/5 px-2 py-1">{priorityTier(action.priorityScore)}</span></div><p className="mt-2 line-clamp-1 text-sm text-dark/60">{action.expectedOutcome.text}</p>
      {action.dependency.blocked && <p className="mt-2 text-xs font-semibold text-amber-800">{zh ? "先完成" : "Complete first"}: {action.dependency.milestoneTitle || (action.dependency.missingLink ? (zh ? "請設定前置任務" : "Link prerequisites") : action.dependency.actionRefs.filter(d => !d.done).map(d => { const ref = taskReference(d); return zh ? ref.replace(/^Milestone (\d+) · /, "里程碑 $1 的 ") : ref; }).join(", "))}</p>}
      {action.metric?.target != null && <p className="mt-2 text-xs">{action.metric.current ?? (zh ? "尚未回報" : "Not reported")}/{action.metric.target} {action.metric.unit}</p>}</div>
    </div>
    <details className="group mt-3 text-sm">
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
    </details>
  </article>;
}
