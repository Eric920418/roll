"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TaskCheckbox from "./TaskCheckbox";
import { useLocale } from "next-intl";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import type { CheckInView } from "@/lib/check-ins/service";
import type { TaskSnapshot } from "@/lib/check-ins/schema";
import { taskReference } from "@/lib/action-plan/ranking";
import { pathForLocale } from "@/lib/routes";

const button = "min-h-11 rounded-xl border border-dark/15 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";
const input = "mt-1 w-full rounded-xl border border-dark/15 bg-white p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
export default function WeeklyCheckIn({ userId, plan, canShare, onChanged }: { userId: string; plan: ActionPlanDto | null; canShare: boolean; onChanged: (plan: ActionPlanDto | null) => void }) {
  const locale = useLocale() === "zh-tw" ? "zh-tw" : "en", zh = locale === "zh-tw";
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLElement | null>(null), busyRef = useRef(false), editVersion = useRef<{ planRevision: number; revision: number } | null>(null);
  const [mounted, setMounted] = useState(false), [opened, setOpened] = useState(false), [busy, setBusy] = useState(false), [view, setView] = useState<CheckInView | null>(null);
  const [finding, setFinding] = useState(""), [blockers, setBlockers] = useState(""), [metrics, setMetrics] = useState<Record<string, string>>({}), [investorDraft, setInvestorDraft] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [historyPlan, setHistoryPlan] = useState("");
  const [historyOptions, setHistoryOptions] = useState<Array<{ id: string; goal: string | null; createdAt: string }>>([]);
  const cacheKey = `nova:check-in:${userId}:${plan?.id || "none"}`;
  useEffect(() => setMounted(true), []);
  function cache(next = { finding, blockers, metrics, investorDraft }) { if (!editVersion.current && view) editVersion.current = { planRevision: plan?.revision || 0, revision: view.current?.revision || 0 }; try { localStorage.setItem(cacheKey, JSON.stringify({ ...next, weekStart: view?.weekStart, version: editVersion.current })); } catch { setNotice(zh ? "本機暫存不可用，請先儲存回報。" : "Local storage unavailable. Save your report first."); } }
  async function request(data?: object, path = "/api/action-plans/check-ins") {
    const res = await fetch(path, { cache: "no-store", ...(data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}) });
    let json; try { json = await res.json(); } catch { throw new Error(`HTTP ${res.status}: ${zh ? "無法讀取回應，請重試" : "Unreadable response; retry"}`); }
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json.data;
  }
  function accept(fresh: CheckInView) { setView(fresh); if (fresh.active && (fresh.active.id !== plan?.id || (fresh.active.revision || 0) > (plan?.revision || 0))) onChanged(fresh.active); }
  async function reload(preserve = true, planId = historyPlan || plan?.id) {
    try {
      const fresh: CheckInView = await request(undefined, `/api/action-plans/check-ins${planId ? `?planId=${encodeURIComponent(planId)}` : ""}`); accept(fresh);
      if (preserve && fresh.current?.lastRequestId !== view?.current?.lastRequestId && fresh.current?.investorDraft && !investorDraft) setInvestorDraft(fresh.current.investorDraft);
      if (!preserve) {
        let cached; try { cached = JSON.parse(localStorage.getItem(cacheKey) || "null"); } catch { /* server remains available */ }
        if (cached?.weekStart !== fresh.weekStart) cached = null;
        editVersion.current = cached?.version || null;
        setFinding(cached?.finding ?? fresh.current?.finding ?? ""); setBlockers(cached?.blockers ?? fresh.current?.blockers ?? ""); setMetrics(cached?.metrics || {}); setInvestorDraft(cached?.investorDraft ?? fresh.current?.investorDraft ?? "");
      }
      return fresh;
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  useEffect(() => { if (!opened || !view?.current?.pending) return; const timer = setInterval(() => void reload(true), 3000); return () => clearInterval(timer); /* preserve local answers */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, view?.current?.pending]);
  useEffect(() => { if (opened) void reload(true); /* plan updates change eligibility, not the local report */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.revision]);
  async function open() {
    trigger.current = document.activeElement as HTMLElement; setOpened(true); setHistoryPlan(""); setError(""); setNotice(""); dialog.current?.showModal();
    await reload(false, plan?.id);
    try { const roadmap = await request(undefined, "/api/action-plans/roadmap"); setHistoryOptions(roadmap.history); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  useEffect(() => { if (mounted && location.hash === "#weekly-check-in") void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);
  async function run(action: "save" | "generate" | "apply" | "edit") {
    if (!plan || !view || busyRef.current || view.current?.pending || view.readOnly) return;
    if (action === "generate" || action === "apply") {
      const dirty = finding.trim() !== (view.current?.finding || "") || blockers.trim() !== (view.current?.blockers || "") || Object.entries(metrics).some(([id, value]) => value !== String(plan.actions.find(a => a.id === id)?.metric?.current ?? ""));
      if (dirty) { setError(zh ? "請先儲存本週的新回答與數量，再生成或套用建議。" : "Save your new weekly answers and quantities before generating or applying recommendations."); return; }
    }
    busyRef.current = true; setBusy(true); setError(""); setNotice(""); if (action === "save" || action === "edit") cache();
    try {
      const row = view.current, requestId = crypto.randomUUID();
      const payload = action === "save" ? { action, planId: plan.id, planRevision: editVersion.current?.planRevision ?? plan.revision, weekStart: view.weekStart, revision: editVersion.current?.revision ?? row?.revision ?? 0, requestId, finding, blockers, metrics: Object.entries(metrics).map(([actionId, value]) => ({ actionId, current: value === "" ? null : Number(value) })) }
        : { action, id: row!.id, revision: action === "edit" ? editVersion.current?.revision ?? row!.revision : row!.revision, requestId, ...(action === "edit" ? { investorDraft } : { planRevision: plan.revision, ...(action === "generate" ? { locale } : {}) }) };
      const fresh: CheckInView = await request(payload); accept(fresh); setInvestorDraft(fresh.current?.investorDraft || ""); if (action === "save") setMetrics({});
      editVersion.current = null;
      if (action === "save") { try { localStorage.removeItem(cacheKey); } catch { /* report is on the server */ } }
      else if (action === "edit") { try { localStorage.setItem(cacheKey, JSON.stringify({ finding, blockers, metrics, investorDraft: fresh.current?.investorDraft || "", weekStart: fresh.weekStart, version: { planRevision: fresh.active?.revision || 0, revision: fresh.current?.revision || 0 } })); } catch { /* server draft is saved */ } }
      setNotice(action === "save" ? (zh ? "回報已保存。可生成建議及投資人草稿。" : "Report saved. Generate recommendations and an investor draft.") : action === "apply" ? (zh ? "排序已套用。" : "Order applied.") : (zh ? "草稿已保存。" : "Draft saved."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); await reload(true); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function taskMutation(id: string, data: object) {
    if (!plan || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try { const res = await fetch(`/api/action-plans/actions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, revision: plan.revision }) }); const json = await res.json(); if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`); if (editVersion.current) { editVersion.current.planRevision = json.data.revision; cache(); } onChanged(json.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const row = view?.current, disabled = busy || Boolean(row?.pending) || !view || view.readOnly;
  return <section id="weekly-check-in" className="rounded-2xl border border-dark/15 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Weekly Check-in</h2><p className="mt-1 text-sm text-dark/60">{zh ? "約 2 分鐘：完成任務、重要發現、卡住的地方。" : "About 2 minutes: completed tasks, one key finding, and blockers."}</p></div><button type="button" disabled={!plan} className={button} onClick={() => void open()}>{zh ? "填寫本週回報" : "Check in this week"}</button></div>
    {mounted && createPortal(<dialog ref={dialog} aria-labelledby="weekly-title" onClose={() => { setOpened(false); if (trigger.current?.isConnected) trigger.current.focus(); }} className="nova-theme fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-[920px] overflow-y-auto rounded-l-2xl border-0 bg-white p-0 text-dark shadow-2xl backdrop:bg-black/35">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5"><h2 id="weekly-title" className="text-xl font-bold">Weekly Check-in</h2><button type="button" className={button} onClick={() => dialog.current?.close()}>{zh ? "關閉" : "Close"}</button></header>
      <div className="space-y-5 p-5 sm:p-8">
        <p className="text-sm text-dark/60">{view?.weekStart} · {zh ? "台北時間，週一至週日；本週可修訂，歷史唯讀。" : "Asia/Taipei, Monday–Sunday. Current week editable; history read-only."}</p>
        <label className="block text-sm font-semibold">{zh ? "查看計畫" : "View plan"}<select className={input} value={historyPlan} onChange={e => { setHistoryPlan(e.target.value); void reload(true, e.target.value || plan?.id); }}><option value="">{zh ? "目前計畫" : "Current plan"}</option>{historyOptions.map(p => <option key={p.id} value={p.id}>{p.goal || (zh ? "舊計畫" : "Previous plan")} · {p.createdAt.slice(0, 10)}</option>)}</select></label>
        {!view?.readOnly && <form onSubmit={e => { e.preventDefault(); void run("save"); }} className="space-y-4">
          <fieldset disabled={disabled} className="space-y-3"><legend className="font-bold">1. {zh ? "這週完成了什麼？" : "What did you complete?"}</legend>
            {plan?.actions.filter(a => !a.dependency.milestoneTitle).map(a => <div key={a.id} className="rounded-xl border border-dark/10 p-3"><label className="flex items-start gap-3"><TaskCheckbox label={`${zh ? "完成任務" : "Complete task"}: ${a.title}`} checked={a.done} locked={!a.done && a.dependency.blocked} disabled={disabled} reason={`${zh ? "先完成" : "Complete first"}: ${a.dependency.actionRefs.filter(r => !(r.resolved ?? r.done)).map(taskReference).join(", ") || (zh ? "連結前置任務" : "Link prerequisites")}`} onChange={() => void taskMutation(a.id, { done: !a.done })} /><span>{taskReference(a)}</span></label>{a.dependency.blocked && <p className="mt-1 text-xs text-amber-800">{zh ? "先完成" : "Complete first"}: {a.dependency.actionRefs.filter(r => !(r.resolved ?? r.done)).map(taskReference).join(", ") || (zh ? "連結前置任務" : "Link prerequisites")}</p>}{a.metric?.target != null && <label className="mt-2 block text-xs">{zh ? "累計數量（選填）" : "Cumulative quantity (optional)"}: /{a.metric.target} {a.metric.unit}<input type="number" min={0} max={1000000000} disabled={Boolean(plan?.roadmap?.milestones.find(m => m.id === a.milestoneId)?.achievedAt)} className={input} placeholder={zh ? "尚未回報" : "Not reported"} value={metrics[a.id] ?? String(a.metric.current ?? "")} onChange={e => { const next = { ...metrics, [a.id]: e.target.value }; setMetrics(next); cache({ finding, blockers, metrics: next, investorDraft }); }} /></label>}</div>)}
          </fieldset>
          <label className="block font-bold">2. {zh ? "本週最重要的發現或決定？" : "Your most important finding or decision?"}<textarea autoFocus rows={3} maxLength={4000} disabled={disabled} value={finding} onChange={e => { setFinding(e.target.value); cache({ finding: e.target.value, blockers, metrics, investorDraft }); }} className={input} /></label>
          <label className="block font-bold">3. {zh ? "有沒有卡住的地方？" : "Anything blocking you?"}<textarea rows={3} maxLength={4000} disabled={disabled} value={blockers} onChange={e => { setBlockers(e.target.value); cache({ finding, blockers: e.target.value, metrics, investorDraft }); }} className={input} /></label>
          <button disabled={disabled} className={`${button} bg-black! text-white!`}>{zh ? "儲存回報與摘要" : "Save report and summary"}</button>
        </form>}
        {row && <section className="space-y-4 rounded-xl border p-4"><h3 className="font-bold">Weekly Summary</h3><p className="whitespace-pre-wrap text-sm">{row.summary}</p>{!view?.readOnly && <button type="button" className={button} disabled={disabled} onClick={() => void run("generate")}>{zh ? "生成下週建議與投資人草稿" : "Generate next-week recommendations and investor draft"}</button>}
          {row.output && <><h3 className="font-bold">{zh ? "下週最多三件事（建議）" : "Next week's moves (proposed)"}</h3><p className="whitespace-pre-wrap text-sm">{row.output.rationale}</p><ol className="space-y-2">{row.output.nextActionIds.map(id => { const saved = (row.snapshot as TaskSnapshot[]).find(a => a.id === id); const live = plan?.actions.find(a => a.id === id); return <li key={id}>{!view?.readOnly && live ? taskReference(live) : saved?.reference || (zh ? "任務已移除" : "Task removed")}</li>; })}</ol>{!view?.readOnly && <button type="button" className={button} disabled={disabled || !row.output.nextActionIds.length} onClick={() => void run("apply")}>{zh ? "確認套用排序" : "Confirm and apply order"}</button>}
            {!view?.readOnly && row.output.metricSuggestions.map(m => <div key={m.actionId} className="rounded-lg border p-3 text-sm"><p>{zh ? "數量目標建議，尚未儲存" : "Proposed target, not saved"}: {plan?.actions.find(a => a.id === m.actionId)?.title} · {m.target} {m.unit}</p><button type="button" className={`${button} mt-2`} disabled={disabled} onClick={() => void taskMutation(m.actionId, { metricTarget: m.target, metricUnit: m.unit, metricCurrent: plan?.actions.find(a => a.id === m.actionId)?.metric?.current ?? null })}>{zh ? "確認目標" : "Confirm target"}</button></div>)}
          </>}
          {row.investorDraft && <><h3 className="font-bold">Investor Update · {zh ? "私人草稿" : "Private draft"}</h3><textarea aria-label="Investor Update" rows={7} maxLength={6000} readOnly={view?.readOnly} value={view?.readOnly ? row.investorDraft : investorDraft} onChange={e => { setInvestorDraft(e.target.value); cache({ finding, blockers, metrics, investorDraft: e.target.value }); }} className={input} /><div className="flex flex-wrap gap-2">{!view?.readOnly && <button type="button" className={button} disabled={disabled || !investorDraft.trim()} onClick={() => void run("edit")}>{zh ? "儲存草稿" : "Save draft"}</button>}<button type="button" className={button} onClick={() => { void navigator.clipboard.writeText(view?.readOnly ? row.investorDraft || "" : investorDraft).then(() => setNotice(zh ? "已複製" : "Copied")).catch(() => setError(zh ? "無法複製，請手動選取文字。" : "Copy unavailable. Select the text manually.")); }}>{zh ? "複製" : "Copy"}</button>{canShare && <a className={button} href={`${pathForLocale("/dashboard/investors", locale)}?checkInId=${encodeURIComponent(row.id)}`}>{zh ? "帶入 Share with investors（尚未發布）" : "Open in Share with investors (not published)"}</a>}</div></>}
        </section>}
        {(busy || row?.pending) && <p role="status">{zh ? "處理中；AI 約需 1–2 分鐘，回報已保存。" : "Processing. AI takes about 1–2 minutes; your report is saved."}</p>}
        {(error || row?.error) && <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap">{error || row?.error}</p><button type="button" className={button} disabled={busy} onClick={() => { setError(""); void reload(true).then(fresh => { if (fresh) editVersion.current = { planRevision: fresh.active?.revision || 0, revision: fresh.current?.revision || 0 }; }); }}>{zh ? "重新載入（保留輸入）" : "Reload (keep input)"}</button></div>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <section><h3 className="font-bold">{zh ? "每週時間軸" : "Weekly timeline"}</h3><div className="mt-3 space-y-3">{view?.history.map(r => <details key={r.id} className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">{r.weekStart} · {r.readOnly ? (zh ? "唯讀" : "Read-only") : (zh ? "本週" : "This week")}</summary><p className="mt-3 whitespace-pre-wrap text-sm">{r.summary}</p><ul className="mt-3 space-y-1 text-sm">{(r.snapshot as TaskSnapshot[]).map(a => <li key={a.id}>{a.done ? "✓" : "○"} {a.reference}{a.metric.target != null ? ` · ${a.metric.current ?? (zh ? "尚未回報" : "Not reported")}/${a.metric.target} ${a.metric.unit}` : ""}</li>)}</ul>{r.investorDraft && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-dark/5 p-3 text-sm">Investor Update: {r.investorDraft}</p>}</details>)}</div></section>
      </div>
    </dialog>, document.body)}
  </section>;
}
