"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import type { InterviewRow, InterviewSummary } from "@/lib/customer-insights/interviews";
import { CHALLENGES } from "@/lib/customer-insights/schema";
import CustomerDiscovery from "./CustomerDiscovery";

const button = "min-h-11 rounded-xl border border-dark/20 px-4 py-2 text-sm font-semibold disabled:opacity-50";
async function readInterviews(actionId: string) {
  const res = await fetch(`/api/customer-insights?actionId=${encodeURIComponent(actionId)}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data as { rows: Array<InterviewRow & { updatedAt: string }>; summary: InterviewSummary; plan: ActionPlanDto | null };
}

export default function InterviewWorkspace({ userId, action, busy, onConfigure, onChanged, onInsights }: {
  userId: string; action: ActionPlanActionDto; busy: boolean;
  onConfigure: (target: number) => Promise<boolean | void>;
  onChanged: (plan: ActionPlanDto | null) => void; onInsights: () => void;
}) {
  const zh = useLocale() === "zh-tw";
  const [target, setTarget] = useState(() => /^(companies|company|公司|間)$/i.test(action.metric?.unit || "") ? String(action.metric?.target ?? "") : "");
  const [rows, setRows] = useState<Array<InterviewRow & { updatedAt: string }> | null>(null);
  const [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const enabled = action.recordingMode === "interview";
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void readInterviews(action.id).then(data => { if (alive) { setRows(data.rows); setError(""); } }).catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { alive = false; };
  }, [enabled, action.id]);
  async function reload(plan?: ActionPlanDto) {
    if (plan) onChanged(plan);
    try { const data = await readInterviews(action.id); setRows(data.rows); onChanged(data.plan); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <section className="mt-5 space-y-5 border-t border-dark/10 pt-5">
    <section className="rounded-xl bg-dark/[0.03] p-4" aria-label={zh ? "學習資源" : "Learning resources"}>
      <p className="text-xs font-semibold uppercase tracking-wider text-dark/60">{zh ? "學習資源" : "Learning resources"}</p>
      <h4 className="mt-2 font-bold">{zh ? "如何進行訪談？" : "How do you interview people?"}</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{["YouTube", "Spotify"].map(platform => <div key={platform} className="rounded-lg border border-dark/10 bg-white p-3"><p className="font-semibold">{platform}</p><p className="mt-1 text-sm text-dark/60">{zh ? "學習資源待補上" : "Learning resource coming soon"}</p></div>)}</div>
    </section>
    {!enabled && !action.done && <form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (saving) return; setSaving(true); setError(""); try { const saved = await onConfigure(Number(target)); if (saved === false) throw new Error(zh ? "未儲存成功，請查看頁面錯誤並重試。" : "Not saved. Review the page error and retry."); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setSaving(false); } }}>
      <label className="block text-sm font-semibold">{zh ? "訪談公司數目標" : "Target number of companies"}<input required type="number" min="1" max="1000000000" step="1" value={target} onChange={e => setTarget(e.target.value)} disabled={busy || saving || action.dependency.blocked} className="mt-2 min-h-11 w-full rounded-xl border border-dark/20 px-3 sm:max-w-xs" /></label>
      <p className="text-sm text-dark/60">{zh ? "啟用後改用實際紀錄計算公司數；同公司多人或多次訪談只算一間，不沿用人工填寫的累計值。" : "Enabling interviews replaces manual totals with saved evidence. Multiple conversations at the same company count once."}</p>
      <button disabled={busy || saving || action.dependency.blocked} className={button}>{saving ? (zh ? "儲存中…" : "Saving…") : (zh ? "啟用訪談紀錄" : "Enable interview records")}</button>
    </form>}
    {enabled && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{action.metric?.current ?? 0}/{action.metric?.target ?? "?"} {zh ? "間不同公司" : "distinct companies"}</p><button type="button" onClick={onInsights} className={button}>{zh ? "查看 Insights" : "View Insights"}</button></div>
      {!rows && !error && <p role="status" className="text-sm">{zh ? "載入訪談紀錄…" : "Loading interviews…"}</p>}
      {rows && <CustomerDiscovery userId={userId} actionId={action.id} rows={rows} outcomes={[]} readOnly={busy || action.done || action.dependency.blocked} onSaved={plan => { void reload(plan); }} />}
      <p className="text-sm text-dark/60">{zh ? "達到目標後，請確認完成任務。儲存訪談不會自動完成或發分。" : "After reaching the target, confirm task completion. Saving an interview does not complete the task or award points."}</p>
    </>}
    {error && <div role="alert" className="space-y-2 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap">{error}</p>{enabled && <button type="button" className={button} onClick={() => { void reload(); }}>{zh ? "重新載入（保留輸入）" : "Reload (keep input)"}</button>}</div>}
  </section>;
}

export function InterviewInsights({ actionId, title, onClose }: { actionId: string; title: string; onClose: () => void }) {
  const zh = useLocale() === "zh-tw", dialog = useRef<HTMLDialogElement>(null);
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
    {error && <div role="alert" className="mt-5 space-y-3"><p className="whitespace-pre-wrap text-red-700">{error}</p><button type="button" className={button} onClick={() => { void load(); }}>{zh ? "重試" : "Retry"}</button></div>}
  </dialog>;
}
