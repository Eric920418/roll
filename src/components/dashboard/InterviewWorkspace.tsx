"use client";
import { memberFetch } from "@/lib/member-fetch";
import { usePlanDisplay } from "@/components/dashboard/PlanLocalization";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { useLocale } from "next-intl";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import { interviewSummary, type InterviewRow, type InterviewSummary } from "@/lib/customer-insights/interviews";
import { commercialTask } from "@/lib/validation/schema";
import { CHALLENGES } from "@/lib/customer-insights/schema";
import CustomerDiscovery from "./CustomerDiscovery";
import { interviewTarget, workspaceKind } from "@/lib/action-plan/workspace";
import LearningResources from "./LearningResources";

const button = "min-h-11 rounded-xl border border-dark/20 px-4 py-2 text-sm font-semibold disabled:opacity-50";
async function readInterviews(actionId: string) {
  return memberFetch<{ rows: Array<InterviewRow & { updatedAt: string }>; summary: InterviewSummary; plan: ActionPlanDto | null }>(`/api/customer-insights?actionId=${encodeURIComponent(actionId)}`);
}

export default function InterviewWorkspace({ userId, action, busy, onChanged, onInsights, revision, showGuide = true }: {
  showGuide?: boolean;
  userId: string; action: ActionPlanActionDto; busy: boolean; revision?: number;
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
  }, [action.id, revision]);
  async function reload(plan?: ActionPlanDto) {
    if (plan) onChanged(plan);
    try { const data = await readInterviews(action.id); setRows(data.rows); onChanged(data.plan); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <section className={showGuide ? "mt-5 space-y-5 border-t border-dark/10 pt-5" : "space-y-3"}>
    {showGuide && <LearningResources collapsed kind="interview" question={zh ? "如何進行客戶對話？" : "How to run a customer conversation?"} />}
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">{zh ? "已記錄客戶對話" : "Conversations recorded"} · {rows ? interviewSummary(action.id, rows).total : "…"}/{target ?? "?"} {zh ? "間不同公司" : "distinct companies"}</p><button type="button" onClick={onInsights} className={button}>{zh ? "查看關鍵發現" : "View findings"}</button></div>
      <progress aria-label={zh ? "有效訪談進度" : "Valid conversation progress"} className="mt-3 h-2 w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-dark/10 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-black [&::-moz-progress-bar]:bg-black" value={action.recordingMode === "interview" ? Math.min(action.metric?.current ?? 0, target ?? 1) : 0} max={target ?? 1} />
    </div>
      {!rows && !error && <p role="status" className="text-sm">{zh ? "載入訪談紀錄…" : "Loading conversations…"}</p>}
      {rows && <CustomerDiscovery userId={userId} actionId={action.id} rows={rows} outcomes={[]} readOnly={busy || action.done || action.dependency.blocked} onSaved={plan => { void reload(plan); }} />}
      {action.done ? <div className="space-y-3 rounded-xl border border-dark/15 bg-white p-4"><h4 className="font-semibold">{zh ? "對話任務已完成，下一步整理目標客戶" : "Conversations complete. Next: review your target customer"}</h4><Link href={`${pathForLocale("/dashboard/profile", locale)}#icp-start`} className={`${button} inline-flex items-center justify-center bg-black text-white`}>{zh ? "確認或更新目標客戶" : "Confirm or update your target customer"} →</Link></div> : null}
    {error && <div role="alert" className="space-y-2 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap break-words">{error}</p>{<button type="button" className={button} onClick={() => { void reload(); }}>{zh ? "重新載入（保留輸入）" : "Reload (keep input)"}</button>}</div>}
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
    {summary && <InterviewSummaryView summary={summary} />}
    {summary && summary.total > 0 && <div className="mt-6 space-y-3 border-t border-dark/10 pt-5"><h3 className="font-semibold">{zh ? "下一步：確認你的 目標客戶" : "Next: review your target customer"}</h3><Link href={`${pathForLocale("/dashboard/profile", locale)}#icp-start`} className={`${button} inline-flex items-center justify-center bg-black text-white`}>{zh ? "確認或更新目標客戶" : "Confirm or update your target customer"} →</Link></div>}
    {error && <div role="alert" className="mt-5 space-y-3"><p className="whitespace-pre-wrap text-red-700">{error}</p><button type="button" className={button} onClick={() => { void load(); }}>{zh ? "重試" : "Retry"}</button></div>}
  </dialog>;
}

export function InterviewFindings({ actionId, revision }: { actionId: string; revision?: number }) {
  const zh = useLocale() === "zh-tw", [summary,setSummary]=useState<InterviewSummary|null>(null), [error,setError]=useState("");
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{let alive=true;void readInterviews(actionId).then(data=>{if(alive){setSummary(data.summary);setError("");}}).catch(cause=>{if(alive)setError(cause instanceof Error?cause.message:String(cause));});return()=>{alive=false;};},[actionId,revision,attempt]);
  if (!summary?.top.length && !error) return null;
  return <section className="min-w-0 space-y-3" aria-label={zh?"關鍵發現":"Key findings"}><h3 className="text-sm font-bold">{zh?"關鍵發現":"Key findings"}</h3><div className="rounded-xl border border-dark/10 bg-white p-4">{error && <div role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800"><p>{error}</p><button type="button" className={button} onClick={()=>setAttempt(v=>v+1)}>{zh?"重試":"Retry"}</button></div>}{summary && summary.top.length > 0 && <table className="w-full table-fixed text-left text-xs"><thead className="text-dark/45"><tr><th scope="col" className="w-2/3 pb-3">{zh?"已分類挑戰":"Classified challenge"}</th><th scope="col" className="pb-3">{zh?"佐證公司":"Supporting companies"}</th></tr></thead><tbody>{summary.top.map(row=><tr className="border-t border-dark/10" key={row.key}><th scope="row" className="break-words py-3 pr-3">{CHALLENGES[row.key][zh?1:0]}</th><td className="py-3">{row.count} / {summary.total}</td></tr>)}</tbody></table>}</div></section>;
}

export function InterviewSummaryView({ summary }: { summary: InterviewSummary }) {
  const zh = useLocale() === "zh-tw";
  return <div className="mt-5 space-y-5">
      <h3 className="font-semibold">{zh ? "前三項創業挑戰" : "Top 3 Startup Challenges"} · {summary.total} {zh ? "間公司" : "companies"}</h3>
      {summary.top.length ? <ol className="list-inside list-decimal space-y-3">{summary.top.map(row => <li key={row.key}>{CHALLENGES[row.key][zh ? 1 : 0]} — {row.count}/{summary.total} ({row.percent}%)</li>)}</ol> : <p>{zh ? "尚無已分類的主要挑戰。" : "No classified challenges yet."}</p>}
      <p className="text-sm text-dark/60">{zh ? "其他" : "Other"}: {summary.counts.other} · {zh ? "未分類" : "Unclassified"}: {summary.counts.unclassified}</p>
      <h3 className="font-semibold">{zh ? "受訪公司名單" : "Companies with conversations"}</h3>
      {summary.companies.length ? <ul className="space-y-2">{summary.companies.map(company => <li key={company.recordId} className="break-words">{company.name} · {company.challenge === "unclassified" ? (zh ? "未分類" : "Unclassified") : CHALLENGES[company.challenge][zh ? 1 : 0]}</li>)}</ul> : <p>{zh ? "尚無有效訪談紀錄。" : "No valid conversations yet."}</p>}
    </div>;
}

export function CompletedTaskInsights({ action, revision }: { action: ActionPlanActionDto; revision?: number }) {
  const { planText } = usePlanDisplay();
  const zh = useLocale() === "zh-tw", [summary, setSummary] = useState<InterviewSummary | null>(null), [error, setError] = useState("");
  const interview = workspaceKind(action) === "interview";
  async function load() { try { setSummary((await readInterviews(action.id)).summary); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  useEffect(() => { if (!interview) return; let alive = true; void readInterviews(action.id).then(data => { if (alive) { setSummary(data.summary); setError(""); } }).catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); }); return () => { alive = false; }; }, [action.id, revision, interview]);
  const copy = (value: string) => action.taskFinding?.source === "ai" ? planText(value, zh ? "zh-tw" : "en") : value;
  const result = action.taskFinding?.result;
  return <section aria-label={zh ? "前項任務分析結果" : "Previous task Insights"} className="min-w-0 space-y-2 border-t border-dark/10 py-3"><h3 className="text-xs font-semibold text-dark/50">{zh ? "任務" : "Task"} #{action.displayNumber}</h3>{!result && <p className="text-sm text-dark/60">{planText(action.title, zh ? "zh-tw" : "en")}</p>}
    {commercialTask(action) ? <div className="mt-3 space-y-2 text-sm"><p>{action.commercialValidation?.requiresConfirmation ? (zh ? "付款證據已撤銷，成果需重新確認。" : "Payment evidence revoked; reconfirm this outcome.") : action.commercialValidation?.confirmedAt ? (zh ? `已確認 ${action.metric?.current ?? 0} 家有效商業承諾；付款與合約金額在上方分別顯示。` : `${action.metric?.current ?? 0} companies with confirmed commitments; payment and contract values are listed separately above.`) : (zh ? "歷史完成紀錄；付款／付費合約尚未經此流程驗證。" : "Historical completion; payment / paid contract not verified in this workflow.")}</p></div> : result ? <><ul className="list-disc space-y-2 pl-5 text-sm font-medium">{result.cards.map((card, i) => <li key={i} className="break-words">{copy(card.title)}</li>)}</ul><details><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-dark/60">{zh ? "查看細節" : "Details"}</summary><p className="text-sm text-dark/60">{planText(action.title, zh ? "zh-tw" : "en")}</p>{result.cards.map((card, i) => <article key={i} className="mt-3 text-sm"><h4 className="font-semibold">{copy(card.title)}</h4><p className="mt-1 whitespace-pre-wrap break-words">{copy(card.text)}</p></article>)}<p className="mt-3 whitespace-pre-wrap break-words text-sm">{copy(result.why)}</p></details></> : !interview && <p className="mt-3 text-sm text-dark/60">{zh ? "尚無重點。" : "No findings yet."}</p>}
    {interview && (summary ? <details open={!result}><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{zh ? "已保存的訪談統計" : "Saved conversation summary"}</summary><InterviewSummaryView summary={summary} /></details> : !error && <p role="status" className="mt-3 text-sm">{zh ? "載入統計…" : "Loading summary…"}</p>)}
    {action.taskFinding?.error && <p role="alert" className="mt-3 whitespace-pre-wrap text-sm text-red-700">{action.taskFinding.error}</p>}
    {error && <div role="alert" className="mt-3 text-sm text-red-700"><p className="whitespace-pre-wrap break-words">{error}</p><button className={button} onClick={() => void load()}>{zh ? "重試" : "Retry"}</button></div>}
  </section>;
}
