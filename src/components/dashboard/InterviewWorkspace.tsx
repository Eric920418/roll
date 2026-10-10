"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { useLocale } from "next-intl";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import { interviewSummary, type InterviewRow, type InterviewSummary } from "@/lib/customer-insights/interviews";
import { CHALLENGES } from "@/lib/customer-insights/schema";
import CustomerDiscovery from "./CustomerDiscovery";
import { interviewTarget } from "@/lib/action-plan/workspace";
import LearningResources from "./LearningResources";

const button = "min-h-11 rounded-xl border border-dark/20 px-4 py-2 text-sm font-semibold disabled:opacity-50";
async function readInterviews(actionId: string) {
  const res = await fetch(`/api/customer-insights?actionId=${encodeURIComponent(actionId)}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data as { rows: Array<InterviewRow & { updatedAt: string }>; summary: InterviewSummary; plan: ActionPlanDto | null };
}

export default function InterviewWorkspace({ userId, action, busy, onChanged, onInsights }: {
  userId: string; action: ActionPlanActionDto; busy: boolean;
  onChanged: (plan: ActionPlanDto | null) => void; onInsights: () => void;
}) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const [rows, setRows] = useState<Array<InterviewRow & { updatedAt: string }> | null>(null);
  const [error, setError] = useState("");
  const target = interviewTarget(action);
  useEffect(() => {
    let alive = true;
    void readInterviews(action.id).then(data => { if (alive) { setRows(data.rows); setError(""); } }).catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { alive = false; };
  }, [action.id]);
  async function reload(plan?: ActionPlanDto) {
    if (plan) onChanged(plan);
    try { const data = await readInterviews(action.id); setRows(data.rows); onChanged(data.plan); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <section className="mt-5 space-y-5 border-t border-dark/10 pt-5">
    <LearningResources question={zh ? "如何進行訪談？" : "How to run an interview?"} />
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">{zh ? "已記錄訪談" : "Interviews logged"} · {rows ? interviewSummary(action.id, rows).total : "…"}/{target ?? "?"} {zh ? "間不同公司" : "distinct companies"}</p><button type="button" onClick={onInsights} className={button}>{zh ? "查看 Insights" : "View Insights"}</button></div>
      <progress aria-label={zh ? "有效訪談進度" : "Valid interview progress"} className="mt-3 h-2 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-dark/10 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-black [&::-moz-progress-bar]:bg-black" value={action.recordingMode === "interview" ? Math.min(action.metric?.current ?? 0, target ?? 1) : 0} max={target ?? 1} />
      <p className="mt-2 text-xs text-dark/60">{zh ? "以實際訪談計算，不沿用手動總數。同公司重訪只計一次。" : "Saved interviews count; manual totals do not. Repeat company conversations count once."}</p>
    </div>
      {!rows && !error && <p role="status" className="text-sm">{zh ? "載入訪談紀錄…" : "Loading interviews…"}</p>}
      {rows && <CustomerDiscovery userId={userId} actionId={action.id} rows={rows} outcomes={[]} readOnly={busy || action.done || action.dependency.blocked} onSaved={plan => { void reload(plan); }} />}
      {action.done ? <div className="space-y-3 rounded-xl border border-dark/15 bg-white p-4"><h4 className="font-semibold">{zh ? "訪談任務已完成，下一步整理 ICP" : "Interviews complete. Next: review your ICP"}</h4><p className="text-sm text-dark/60">{zh ? "你可以用這些紀錄建立或更新 ICP；草稿需另行確認並儲存。" : "Use these conversations to create or update your ICP. Review and save the draft separately."}</p><Link href={`${pathForLocale("/dashboard/profile", locale)}#icp-start`} className={`${button} inline-flex items-center justify-center bg-black text-white`}>{zh ? "建立或更新 ICP" : "Create or update ICP"} →</Link></div> : <p className="text-sm text-dark/60">{zh ? "達到目標後，請確認完成任務。儲存訪談不會自動完成或發分；完成任務也不會自動建立或更新 ICP。" : "After reaching the target, confirm task completion. Saving an interview does not complete the task or award points. Task completion does not automatically create or update your ICP."}</p>}
    {error && <div role="alert" className="space-y-2 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap">{error}</p>{<button type="button" className={button} onClick={() => { void reload(); }}>{zh ? "重新載入（保留輸入）" : "Reload (keep input)"}</button>}</div>}
  </section>;
}

export function InterviewInsights({ actionId, title, onClose }: { actionId: string; title: string; onClose: () => void }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw", dialog = useRef<HTMLDialogElement>(null);
  const [summary, setSummary] = useState<InterviewSummary | null>(null), [error, setError] = useState("");
  async function load() { setError(""); try { setSummary((await readInterviews(actionId)).summary); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    let alive = true;
    void readInterviews(actionId).then(data => { if (alive) setSummary(data.summary); }).catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { alive = false; if (previous?.isConnected) previous.focus(); else document.getElementById("action-plan-list")?.focus(); };
  }, [actionId]);
  return <dialog ref={dialog} aria-labelledby="interview-insights-title" onClose={onClose} className="nova-theme fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-dark/10 bg-white p-5 text-dark shadow-xl backdrop:bg-black/40 sm:p-7">
    <div className="flex items-start justify-between gap-4"><div><h2 id="interview-insights-title" className="text-2xl font-bold">Insights</h2><p className="mt-2 text-sm text-dark/60">{title}</p></div><button type="button" aria-label={zh ? "關閉 Insights" : "Close Insights"} className={button} onClick={() => dialog.current?.close()}>{zh ? "關閉" : "Close"}</button></div>
    {!summary && !error && <p role="status" className="mt-5">{zh ? "載入統計…" : "Loading summary…"}</p>}
    {summary && <div className="mt-5 space-y-5">
      <h3 className="font-semibold">{zh ? "前三項創業挑戰" : "Top 3 Startup Challenges"} · {summary.total} {zh ? "間公司" : "companies"}</h3>
      {summary.top.length ? <ol className="list-inside list-decimal space-y-3">{summary.top.map(row => <li key={row.key}>{CHALLENGES[row.key][zh ? 1 : 0]} — {row.count}/{summary.total} ({row.percent}%)</li>)}</ol> : <p>{zh ? "尚無已分類的主要挑戰。" : "No classified challenges yet."}</p>}
      <p className="text-sm text-dark/60">{zh ? "其他" : "Other"}: {summary.counts.other} · {zh ? "未分類" : "Unclassified"}: {summary.counts.unclassified}</p>
      <p className="text-sm text-dark/60">{zh ? "比例以不同受訪公司為分母；同公司以最近儲存的有效紀錄分類，不是 AI 分析。" : "Percentages use distinct companies. The latest saved valid conversation determines each company's category. These are recorded classifications."}</p>
      <h3 className="font-semibold">{zh ? "受訪公司名單" : "Interviewed companies"}</h3>
      {summary.companies.length ? <ul className="space-y-2">{summary.companies.map(company => <li key={company.recordId} className="break-words">{company.name} · {company.challenge === "unclassified" ? (zh ? "未分類" : "Unclassified") : CHALLENGES[company.challenge][zh ? 1 : 0]}</li>)}</ul> : <p>{zh ? "尚無有效訪談紀錄。" : "No valid interviews yet."}</p>}
    </div>}
    {summary && summary.total > 0 && <div className="mt-6 space-y-3 border-t border-dark/10 pt-5"><h3 className="font-semibold">{zh ? "下一步：確認你的 ICP" : "Next: review your ICP"}</h3><p className="text-sm text-dark/60">{zh ? "Insights 是訪談統計。請到公司檔案整理 ICP 草稿，確認並儲存後才會更新已儲存的 ICP。" : "Insights summarises your interviews. Prepare an ICP draft in your company profile, then confirm and save it to update your saved ICP."}</p><Link href={`${pathForLocale("/dashboard/profile", locale)}#icp-start`} className={`${button} inline-flex items-center justify-center bg-black text-white`}>{zh ? "建立或更新 ICP" : "Create or update ICP"} →</Link></div>}
    {error && <div role="alert" className="mt-5 space-y-3"><p className="whitespace-pre-wrap text-red-700">{error}</p><button type="button" className={button} onClick={() => { void load(); }}>{zh ? "重試" : "Retry"}</button></div>}
  </dialog>;
}
