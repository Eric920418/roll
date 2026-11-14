"use client";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { memberFetch } from "@/lib/member-fetch";
import { STEPS, MILESTONES, STEP_WORK, flowDataSchema, words, type FlowData, type StepId } from "@/lib/action-plan/flow/catalog";
import type { FlowView } from "@/lib/action-plan/flow/service";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import { pathForLocale } from "@/lib/routes";
import ActionMap from "../ActionMap";
import ActionPlanBuilder from "../ActionPlanBuilder";
import Templates, { button, TextField } from "./Templates";
import CurrentFindings from "./CurrentFindings";
import { positioningPreview } from "./PositioningEditor";
import LearningResources from "../LearningResources";
import TaskAssist from "./TaskAssist";
import Proofs from "./Proofs";
import Followups from "./Followups";
const ProspectSearch = lazy(() => import("../prospecting/ProspectSearch"));
const ThisWeekCalendar = lazy(() => import("../home/ThisWeekCalendar"));

export default function Workspace({ userId, plan, onChanged }: { userId: string; plan: ActionPlanDto; onChanged(plan: ActionPlanDto): void }) {
  const locale = useLocale() as "zh-tw" | "en", zh = locale === "zh-tw", router = useRouter(), w = (a: string, b: string) => zh ? a : b;
  const [view, setView] = useState<FlowView | null>(null), [selected, setSelected] = useState<StepId | null>(null), [draft, setDraft] = useState<FlowData | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [link, setLink] = useState(""), [leadId, setLeadId] = useState(""), [editingGoal, setEditingGoal] = useState(false);
  const [goal, setGoal] = useState(plan.roadmap?.goal || ""), [deadline, setDeadline] = useState(plan.roadmap?.deadline || "");
  const [savedVersion, setSavedVersion] = useState(0);
  const [comparison, setComparison] = useState(false), [weeklyOpen, setWeeklyOpen] = useState(false);
  const loadRequest = useRef(0);
  const supplementRequest = useRef<string | null>(null);
  const busyRef = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const base = "/api/action-plans/flow?locale=" + locale;
  const cacheKey = useCallback((id: string, step: StepId) => "nova:flow:v2:" + userId + ":" + id + ":" + step, [userId]);
  const choose = useCallback((next: FlowView, id: StepId | null, restore = true) => {
    setSelected(id);
    const step = next.steps.find(s => s.id === id); let data = step?.data || null;
    if (data && id && restore && !next.archived && !step?.done) {
      try {
        const saved = localStorage.getItem(cacheKey(next.plan.id, id));
        if (saved) { const parsed = flowDataSchema.safeParse(JSON.parse(saved)); if (parsed.success && parsed.data.kind === step?.kind) { data = parsed.data; setNotice(zh ? "已恢復這一步的未儲存草稿。" : "Unsaved draft restored for this step."); } }
      } catch { setNotice(zh ? "無法讀取本機草稿，伺服器紀錄保留。" : "Local draft unavailable; server records are retained."); }
    }
    setDraft(data); setComparison(false); setLink("");
  }, [cacheKey, zh]);
  const load = useCallback(async (id = plan.id, preserve = false) => {
    const request = ++loadRequest.current; setLoading(true);
    try {
      const next = await memberFetch<FlowView>(base + "&planId=" + encodeURIComponent(id));
      if (request !== loadRequest.current) return null;
      setView(next); setError("");
      if (!preserve) { requestAnimationFrame(() => { const id = window.location.hash.slice(1); if (id) document.getElementById(id)?.scrollIntoView({ block: "start" }); }); const linked = next.steps.find(s => window.location.hash === "#action-" + s.actionId && (s.done || s.id === next.current)); choose(next, linked?.id || next.current || next.steps.at(-1)?.id || null); }
      return next;
    } catch (error) { if (request === loadRequest.current) setError(error instanceof Error ? error.message : String(error)); return null; }
    finally { if (request === loadRequest.current) setLoading(false); }
  }, [base, plan.id, choose]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const step = view?.steps.find(s => s.id === selected), spec = STEPS.find(s => s.id === selected);
  const disabled = busy || loading;
  const readOnly = Boolean(view?.archived || step?.done || selected !== view?.current);
  const saved = step?.id === "02-2" || Boolean(step?.saved && JSON.stringify(draft) === JSON.stringify(step.data));
  function change(data: FlowData) {
    if (!view || !selected) return;
    setDraft(data);
    try { localStorage.setItem(cacheKey(view.plan.id, selected), JSON.stringify(data)); }
    catch { setNotice(w("本機暫存失敗，離開前請先儲存。", "Local draft could not be saved; save before leaving.")); }
  }
  async function mutate(body: object, move = false) {
    if (!view || busyRef.current || loading) return; loadRequest.current++; setLoading(false); busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const next = await memberFetch<FlowView & { link?: string }>(base, { method: "POST", body: JSON.stringify({ planId: view.plan.id, revision: view.plan.revision, ...body }) });
      setView(next);
      if ("data" in body) setSavedVersion(v=>v+1);
      if (next.link) setLink(new URL(pathForLocale(next.link, locale), window.location.origin).href);
      if (selected && ("data" in body || move || ("action" in body && body.action === "supplement"))) {
        try { localStorage.removeItem(cacheKey(view.plan.id, selected)); } catch { setNotice(w("伺服器已儲存，本機草稿清除失敗。", "Saved on the server; local draft could not be removed.")); }
        choose(next, move ? next.current || selected : selected, false);
      }
      if (next.plan.id === plan.id) onChanged(next.plan);
      router.refresh();
      setNotice(move ? w("已完成並保存成果，下一步已開啟。", "Completed and retained; the next step is now open.") : w("已儲存，完成標準已重新核對。", "Saved; completion criteria were checked."));
      if (move) requestAnimationFrame(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: "start" }); });
      return next;
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); return null; }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function startSupplement() {
    if (!view) return;
    const key=cacheKey(view.plan.id,"01-4")+":supplement-request";
    let requestId=supplementRequest.current;
    try { requestId ||= localStorage.getItem(key); } catch { /* In-memory retry identity remains available. */ }
    const existing=view.steps.find(s=>s.id==="01-4")?.data;
    if (!requestId || existing?.kind === "organize" && existing.supplements?.some(r=>r.id===requestId)) requestId=crypto.randomUUID();
    supplementRequest.current=requestId;
    try { localStorage.setItem(key,requestId); } catch { setNotice(w("無法暫存重試識別碼，請保持此頁開啟。", "Retry identity could not be cached; keep this page open.")); }
    if (await mutate({action:"supplement",requestId})) { supplementRequest.current=null;try{localStorage.removeItem(key);}catch{/* A saved round is recognised before the next request. */} }
  }
  if (!view) return <section className="rounded-2xl border border-dark/15 p-5"><p role="status">{w("載入 16 步行動計畫…", "Loading your sixteen-step plan…")}</p>{error && <p role="alert" className="whitespace-pre-wrap break-words text-red-800">{error}</p>}<button className={button} disabled={loading} type="button" onClick={() => void load()}>{w("重試", "Retry")}</button></section>;
  const displayPlan = view.steps.length === 0 ? view.plan : { ...view.plan, roadmap: view.plan.roadmap ? { ...view.plan.roadmap, milestones: view.plan.roadmap.milestones.map(m => ({ ...m, title: words(MILESTONES[m.position], locale) })) } : null };
  const preview = draft?.kind === "organize" && selected === "01-2" ? positioningPreview(draft.values, zh) : "";
  const unappliedPositioning = Boolean(preview && draft?.kind === "organize" && preview !== draft.values.positioning);
  const lastMilestone = view.plan.roadmap?.milestones.filter(m => m.achievedAt).at(-1);
  const mapEvent = view.archived ? null : lastMilestone ? "milestone:" + lastMilestone.id : "goal:" + view.plan.id;
  const confirmationText = step?.id === "01-2" && step.data.kind === "organize" ? w("您好，想請您確認這句話是否描述您的情況：", "Hello, does this statement describe your situation? ") + "\n" + (step.data.values.positioning || "") + "\n" + w("請開啟連結選擇符合或不符合，謝謝。", "Please open the link and choose yes or no. Thank you.") + "\n" + link : link;
  const linkPanel = link && <div role="status" className="space-y-3 rounded-xl border border-dark/20 p-4"><label className="block text-sm">{w("專屬連結（可複製）", "Dedicated link (copy to share)")}<input readOnly className="mt-1 min-h-11 w-full rounded-xl border px-3 text-sm" value={link} onFocus={e => e.target.select()} /></label><button type="button" className={button} disabled={disabled} onClick={() => { void navigator.clipboard.writeText(confirmationText).then(() => setNotice(w("連結已複製", "Link copied"))).catch(() => setError(w("無法使用剪貼簿，請手動複製上方連結。", "Clipboard unavailable; copy the link manually."))); }}>{step?.id === "01-2" ? w("複製確認訊息與連結", "Copy confirmation message and link") : w("複製連結", "Copy link")}</button></div>;
  return <section id="goal-roadmap" className="min-w-0 space-y-4">
    <header data-next-step="goal" className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-dark/10 pb-3">
      <div className="min-w-0"><p className="break-words text-sm text-dark/55">{w("目標：", "Goal: ")}{view.plan.roadmap?.goal || w("舊計畫", "Previous plan")} {view.plan.roadmap?.deadline && <> · {w("完成日期 ", "Due ")}{view.plan.roadmap.deadline}</>}</p><p className="mt-2 text-xs text-dark/50">{view.plan.actions.filter(s => s.done).length} / {view.plan.actions.length} {w("步已完成", "steps completed")}{view.archived ? w(" · 歷史版本，唯讀", " · Archived, read only") : ""}</p></div>
      <div className="flex min-h-11 items-center gap-3 text-xs text-dark/55"><span>{w("步驟完成率", "Steps completed")} {Math.round(view.plan.actions.filter(s => s.done).length / Math.max(1, view.plan.actions.length) * 100)}%</span><progress className="h-1 w-28 overflow-hidden border-0 bg-dark/10 accent-black [&::-webkit-progress-bar]:bg-dark/10 [&::-webkit-progress-value]:bg-black [&::-moz-progress-bar]:bg-black" aria-label={w("步驟完成率", "Steps completed")} value={view.plan.actions.filter(s => s.done).length} max={Math.max(1, view.plan.actions.length)} />{!view.archived && <button type="button" className="min-h-11 px-2 underline" onClick={() => { setGoal(view.plan.roadmap?.goal || ""); setDeadline(view.plan.roadmap?.deadline || ""); setEditingGoal(v => !v); }}>{w("修改目標", "Edit goal")}</button>}</div>
      {editingGoal && <form className="w-full space-y-3 rounded-xl border p-4" onSubmit={e => { e.preventDefault(); void mutate({ action: "goal", goal, deadline }).then(next => { if (next) setEditingGoal(false); }); }}><TextField label={w("目標", "Goal")} value={goal} onChange={setGoal} /><TextField type="date" label={w("期限", "Deadline")} value={deadline} onChange={setDeadline} /><button className={button} disabled={disabled}>{w("保存目標與日期", "Save goal and dates")}</button></form>}
    </header>
    {view.integrity.length > 0 && <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><p>{w("部分先前證據已失效，歷史紀錄保留；請補正證明再繼續或分享。", "Some earlier evidence is no longer valid. History is retained; correct the proof before continuing or sharing.")}</p>{view.integrity.map(v => <p key={v.step}>{v.step} · {v.reasons.join("；")}</p>)}</div>}
    {!view.current && view.steps.length > 0 && <p role="status" className="rounded-xl bg-black p-5 font-bold text-white">{view.integrity.length ? w("16 步紀錄完成，證據需補正", "Sixteen steps recorded; evidence needs attention") : w("已完成驗證 · 16 步成果已保存", "Validation complete · sixteen steps retained")}</p>}
    {readOnly && view.current && !view.archived && <button className={button} type="button" onClick={() => choose(view, view.current)}>{w("回到目前一步", "Return to the current step")}</button>}
    {step && spec && draft && <article key={view.plan.id+":"+step.id} id={"action-" + step.actionId} data-next-step="record" className="scroll-mt-6 space-y-4">
      <h3 className="text-sm font-bold"><span className="mr-3 text-[10px] tracking-wider text-dark/40">01</span>{w("本日優先行動", "Today's priority")}</h3>
      <section data-today-priority className="rounded-xl bg-black p-4 text-white sm:p-5"><div className="flex flex-col items-start justify-between gap-4 lg:flex-row"><div className="min-w-0 w-full flex-1 lg:w-auto"><p className="text-[10px] font-semibold tracking-wider text-white/55">{w("里程碑", "Milestone")} {spec.milestone + 1} · {words(MILESTONES[spec.milestone], locale)} · {w("行動", "Action")} {STEPS.filter(s => s.milestone === spec.milestone).findIndex(s => s.id === step.id) + 1} / {STEPS.filter(s => s.milestone === spec.milestone).length}</p><h2 ref={heading} tabIndex={-1} className="mt-2 scroll-mt-6 break-words text-lg font-bold focus:outline-none sm:text-xl">{words(spec.title, locale)}</h2><div className="mt-3 flex gap-1" aria-hidden="true">{view.steps.filter(s => s.milestone === spec.milestone).map(s => <span key={s.id} className={"h-1 w-7 rounded-full " + (s.done || s.id === step.id ? "bg-white" : "bg-white/20")} />)}</div></div>{!readOnly && <button className="min-h-11 shrink-0 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black focus-visible:outline-2" disabled={disabled} onClick={() => { const target = document.getElementById(step.id === "01-2" ? "positioning-confirmations" : "task-work"); target?.scrollIntoView({ block: "start" }); target?.querySelector<HTMLElement>("button, input, select, textarea")?.focus(); }}>{step.id === "01-2" ? w("取得確認連結", "Get confirmation links") : step.kind === "conversation" ? w("記錄客戶對話", "Record a conversation") : words(STEP_WORK[step.id], locale)}</button>}</div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-white/15 pt-3 text-xs sm:grid-cols-[1.6fr_1fr_1fr]"><div className="col-span-2 sm:col-span-1"><dt className="text-[10px] tracking-wider text-white/50">{w("完成標準", "Completion criteria")}</dt><dd className="mt-1 leading-5">{words(spec.criteria, locale)}</dd></div><div><dt className="text-[10px] tracking-wider text-white/50">{w("目前進度", "Saved progress")}</dt><dd className="mt-2 font-semibold">{step.current} / {step.target}</dd></div><div><dt className="text-[10px] tracking-wider text-white/50">{w("里程碑期限", "Milestone due")}</dt><dd className="mt-2 font-semibold">{view.plan.roadmap?.milestones[spec.milestone]?.targetDate || "—"}</dd></div></dl></section>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" data-task-columns>
      <section id="task-work" className="min-w-0 space-y-3 rounded-xl border border-dark/10 bg-white p-4 sm:p-5" aria-label={w("本步操作", "Current step work")}>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <Templates key={view.plan.id + ":" + step.id} resetVersion={savedVersion} secondary={!readOnly && step.kind === "conversation" ? <TaskAssist embedded key={view.plan.id+":"+step.id} userId={userId} step={step.id} view={view} locale={locale} disabled={disabled} onBusy={value => { busyRef.current = value; setBusy(value); }} onView={next => { setView(next); onChanged(next.plan); }} onRefresh={() => void load(view.plan.id, true)} onApply={data=>{change(data.kind === "organize" && draft.kind === "organize" ? {...data,supplements:draft.supplements} : data);setSavedVersion(v=>v+1);}} /> : undefined} step={step.id} data={draft} view={view} locale={locale} disabled={readOnly || disabled} readOnly={readOnly} onChange={change} />
      {!readOnly && step.id === "01-4" && draft.kind === "organize" && view.tiers.filter(t=>t.confirmed && t.tier === "A").length < 3 && <button type="button" className={button} disabled={disabled || !saved || view.leads.some(l=>!view.tiers.some(t=>t.leadId===l.id && t.confirmed)) || Boolean(draft.supplements?.some(r=>r.records.length<3 || !view.leads.some(l=>l.id===r.records[0]?.id)))} onClick={()=>void startSupplement()}>{w("補做三次對話", "Add three supplemental conversations")}</button>}
      {!view.archived && (["02-2", "04-1", "05-2"].includes(step.id) || view.integrity.length > 0) && <Proofs userId={userId} view={view} onChanged={() => void load(view.plan.id, true)} />}
      <div className="flex flex-wrap items-start gap-3 border-t border-dark/10 pt-3">
      {!readOnly && step.id !== "02-2" && <div className="flex flex-wrap gap-3"><button type="button" className={button + " bg-black text-white"} disabled={disabled} onClick={() => void mutate({ action: "save", step: selected, data: draft })}>{w("儲存本步成果", "Save this step")}</button>{step.kind !== "conversation" && <button type="button" className={button} disabled={disabled} onClick={() => { if (window.confirm(w("重新帶入已存成果作為初稿？確認後仍需按儲存，不會更動前一步紀錄。", "Rebuild the draft from saved results? Save it explicitly; earlier records stay unchanged."))) change(step.draft.kind === "organize" && draft.kind === "organize" ? {...step.draft, supplements:draft.supplements} : step.draft); }}>{w("重新整理初稿", "Rebuild draft")}</button>}</div>}
      {!readOnly && step.kind !== "conversation" && <TaskAssist key={view.plan.id+":"+step.id} userId={userId} step={step.id} view={view} locale={locale} disabled={disabled} onBusy={value => { busyRef.current = value; setBusy(value); }} onView={next => { setView(next); onChanged(next.plan); }} onRefresh={() => void load(view.plan.id, true)} onApply={data=>{change(data.kind === "organize" && draft.kind === "organize" ? {...data,supplements:draft.supplements} : data);setSavedVersion(v=>v+1);}} />}
      </div></section>
      <aside className="min-w-0 space-y-4 rounded-xl border border-dark/10 bg-white p-5">
      <section className="space-y-3"><h3 className="text-sm font-bold">{step.kind === "conversation" ? w("如何進行一次有效的客戶對話", "How to run an effective customer conversation") : step.id === "01-2" ? w("一句話定位怎麼寫", "Write your positioning statement") : w("這一步怎麼做", "How to approach this step")}</h3><LearningResources kind={step.kind === "conversation" ? "interview" : step.kind === "outreach" ? "pilot" : step.id === "01-2" ? "positioning" : null} question={words(spec.title, locale)} visual /><p className="text-xs leading-6">{words(spec.guide, locale)}</p></section>
      </aside></div>
      {step.id === "02-3" && <section className="space-y-2 rounded-xl border border-dark/10 bg-white p-4"><h3 className="font-bold">{w("提案與回饋來源", "Offer and feedback sources")}</h3>{(() => {const proposals=view.steps.find(s=>s.id==="02-1")?.data;return proposals?.kind==="outreach" ? proposals.contacts.filter(c=>c.status!=="draft").map(c=><div key={c.id} className="border-t border-dark/10 py-3 text-sm"><strong>{c.company} · {c.name}</strong><p className="mt-1 whitespace-pre-wrap break-words">{c.offer}</p>{view.followups.filter(f=>f.contactId===c.id && f.note).map(f=><p key={f.contactId} className="mt-1">{f.date} · {f.note}</p>)}</div>) : <p className="text-xs">{w("尚無已儲存提案", "No saved proposals yet")}</p>;})()}</section>}
      {step.id === "03-1" && <section className="space-y-2 rounded-xl border border-dark/10 bg-white p-4"><h3 className="font-bold">{w("每週開發進度", "Weekly outreach progress")}</h3><div className="grid gap-2 sm:grid-cols-2">{view.weeks.slice(-4).map(week=><div key={week.date} className="rounded-lg border border-dark/10 p-3 text-sm"><strong>{week.date}</strong><p>{w("已聯絡／目標：", "Contacts / target: ")}{week.contacts}/20 · {w("還差 ", "Remaining ")}{week.missing}</p><p>{w("有效對話：", "Valid conversations: ")}{week.conversations}</p></div>)}</div>{view.weeks.length>4 && <details><summary className="min-h-11 cursor-pointer py-3 text-sm">{w("較早週次", "Earlier weeks")} · {view.weeks.length-4}</summary>{view.weeks.slice(0,-4).map(week=><p key={week.date} className="py-2 text-xs">{week.date} · {week.contacts}/20 · {w("有效對話 ", "Valid conversations ")}{week.conversations}</p>)}</details>}</section>}
      {!view.archived && !readOnly && (["02-2","02-3","03-1","04-1","05-2"].includes(step.id) || view.followups.some(c=>!c.resolved && c.status === "sent" && c.step !== view.current)) && <Followups key={view.plan.id+step.id} view={view} userId={userId} locale={locale} disabled={disabled || !saved} save={mutate}/>}
      {step.id === "01-2" && <section id="positioning-confirmations" className="scroll-mt-6 space-y-4" aria-label={w("受訪者確認", "Conversation participant confirmations")}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold"><span className="mr-3 text-[10px] tracking-wider text-dark/40">03</span>{w("受訪者確認", "Conversation participant confirmations")} · {step.current} / {step.target}</h3>{!readOnly && <button type="button" className={button} disabled={disabled} onClick={() => void load(view.plan.id, true)}>{w("更新回覆", "Refresh responses")}</button>}</div><div className="space-y-4 rounded-xl border border-dark/10 bg-white p-5">
      {!readOnly && <><p className="text-xs text-dark">{saved ? w("選擇受訪者", "Choose a conversation participant") : w("請先儲存定位", "Save the statement first")}</p><div className="flex flex-wrap gap-2" role="group" aria-label={w("選擇受訪者", "Choose a conversation participant")}>{view.leads.map(l => <button type="button" key={l.id} disabled={disabled} aria-pressed={leadId === l.id} className={"min-h-11 rounded-full border px-3 py-2 text-xs " + (leadId === l.id ? "bg-black text-white" : "bg-white text-black")} onClick={() => { setLeadId(l.id); setLink(""); }}>{l.company} · {l.name}</button>)}</div><button type="button" className={button} disabled={!saved || !leadId || disabled} onClick={() => { setLink(""); void mutate({ action: "confirmLink", leadId }); }}>{w("建立確認連結", "Create confirmation link")}</button></>}
      {linkPanel}{link && <p className="whitespace-pre-wrap break-words text-sm">{confirmationText}</p>}<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-dark/50"><tr><th scope="col" className="border-b p-3">{w("受訪者", "Conversation participant")}</th><th scope="col" className="border-b p-3">{w("回覆", "Response")}</th><th scope="col" className="border-b p-3">{w("回覆時間", "Response time")}</th></tr></thead><tbody>{view.leads.map(l => { const reply = view.positioningReplies.find(r => r.leadId === l.id); return <tr key={l.id}><th scope="row" className="border-b border-dark/5 p-3 font-medium">{l.company} · {l.name}</th><td className="border-b border-dark/5 p-3"><span className={"inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs " + (reply?.answer === "yes" ? "bg-black text-white" : reply?.answer === "no" ? "bg-amber-50 text-amber-800" : "bg-dark/5 text-dark/55")}>{reply?.answer === "yes" ? w("符合", "Fits") : reply?.answer === "no" ? w("不符合", "Does not fit") : w("未回覆", "No response")}</span></td><td className="border-b border-dark/5 p-3 text-xs text-dark/55">{reply?.at && Number.isFinite(Date.parse(reply.at)) ? new Date(reply.at).toLocaleString(locale) : "—"}</td></tr>; })}</tbody></table></div></div></section>}
      {["01-1","01-2","01-3","01-4"].includes(step.id) && <CurrentFindings view={view} locale={locale} />}
{!["01-1","01-2","01-3","01-4"].includes(step.id) && <>       <section data-next-step="insights" className="space-y-3 rounded-xl bg-dark/[0.025] p-4"><h3 className="font-bold">{w("NOVA 整理結果", "NOVA findings")}</h3>{step.summary.length === 0 && <p className="text-sm">{w("儲存成果後顯示整理結果", "Save your work to see findings")}</p>}{step.summary.map((s, i) => <p key={i} className="whitespace-pre-wrap break-words text-sm">{s}</p>)}
        {step.id === "04-3" && <dl className="space-y-2 text-sm"><div><dt>{w("續約率", "Renewal rate")}</dt><dd>{view.metrics.renewalRate === null ? w("不適用（無到期客戶）", "N/A (no eligible customers)") : Math.round(view.metrics.renewalRate * 100) + "%"} · {view.metrics.renewed}/{view.metrics.eligible}</dd></div><div><dt>{w("平均客單價", "Revenue per customer")}</dt><dd>{view.metrics.currency} {view.metrics.averageRevenue.toFixed(2)}<span className="mt-1 block text-xs">{view.metrics.revenue.toFixed(2)} ÷ {view.metrics.customers}</span></dd></div><div><dt>{w("現金行銷取得成本", "Cash marketing acquisition cost")}</dt><dd>{view.metrics.currency} {view.metrics.acquisitionCost?.toFixed(2) ?? "—"}<span className="mt-1 block text-xs">{w("行銷支出 ÷ 付費公司數：", "Marketing spend ÷ paying companies: ")}{step.data.kind === "organize" ? step.data.values.spend : "—"} ÷ {view.metrics.customers}</span></dd></div><div><dt>{w("本計畫公司搜尋 Token（已結算淨額）", "Plan company-search Tokens (net settled)")}</dt><dd>{view.searchTokens.recordedOrders ? view.searchTokens.spent : w("尚無可歸屬紀錄", "No attributable records")} · {w("預扣：", "Reserved: ")}{view.searchTokens.reserved}</dd></div><div><dt>{w("工時／未歸屬的歷史用量", "Hours / unattributed historical usage")}</dt><dd>{w("未記錄，不列入現金成本", "Not recorded; excluded from cash costs")}</dd></div></dl>}
        {step.id === "05-1" && <p className="text-sm">{view.weekly.currency} {view.weekly.target} · {w("每週聯絡／對話：", "Weekly contacts / conversations: ")}{view.weekly.weeklyContacts} / {view.weekly.weeklyConversations}{view.weekly.assumed ? w("（含待驗證轉換率假設）", " (includes a conversion assumption)") : ""}</p>}
        {!step.ready && <ul className="list-disc space-y-2 pl-5 text-sm text-dark/65">{step.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      </section> </>}
      {["03-3", "05-3"].includes(step.id) && step.saved && (view.current || view.archived) && <a className={button} href={pathForLocale("/task-report/" + step.actionId, locale)} target="_blank" rel="noopener noreferrer">{w("預覽／列印為 PDF", "Preview / print to PDF")}</a>}
      {!readOnly && <div className="space-y-2">{(!saved || unappliedPositioning || !step.ready) && <ul className="list-inside list-disc text-sm">{!saved && <li>{w("請先儲存修改", "Save your changes first")}</li>}{unappliedPositioning && <li>{w("請先套用定位預覽", "Apply the positioning preview first")}</li>}{step.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>}<button type="button" className={button + " bg-black text-white"} disabled={disabled || !saved || !step.ready || unappliedPositioning} onClick={() => void mutate({ action: "complete", step: selected, requestId: crypto.randomUUID() }, true)}>{w("確認並完成", "Confirm and complete")}</button></div>}
      {readOnly && <p className="text-sm text-dark/65">{w("此步驟的完成成果已保留，不能覆寫。", "This completed result is retained and cannot be overwritten.")} {step.completedAt?.slice(0, 10)}</p>}
    </article>}
    {!view.current && !view.archived && view.steps.length > 0 && <section id="flow-report" className="scroll-mt-6 space-y-3 rounded-xl border p-5"><h2 className="text-lg font-bold">{w("市場驗證報告", "Market validation report")} · {view.reportCode}</h2><p className="text-sm">{w("分享預設關閉，開啟後 30 天有效；更新成果或證據後須重新建立。", "Sharing is off by default. Links last thirty days; changed results or proof require a new link.")}</p><div className="flex flex-wrap gap-3"><a className={button} href={pathForLocale("/task-report/" + view.steps.at(-1)!.actionId, locale)} target="_blank" rel="noopener noreferrer">{w("預覽／列印為 PDF", "Preview / print to PDF")}</a><button className={button} disabled={disabled || view.integrity.length > 0} type="button" onClick={() => void mutate({ action: "share", enabled: true })}>{w("建立報告分享連結", "Create report sharing link")}</button>{view.shared && <button className={button} disabled={disabled} type="button" onClick={() => void mutate({ action: "share", enabled: false }).then(next => { if (next) setLink(""); })}>{w("撤銷報告分享", "Revoke report sharing")}</button>}</div></section>}
    {step?.kind === "conversation" && !view.archived && <div id="prospects" className="scroll-mt-6"><ProspectSearch userId={userId} planId={view.plan.id} compact /></div>}
    {step?.id !== "01-2" && linkPanel}
    {error && <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-red-800"><p className="whitespace-pre-wrap break-words text-sm">{error}</p><button type="button" className={button} disabled={disabled} onClick={() => void load(view.plan.id, true).then(next => { if (next) setComparison(true); })}>{w("比較最新版本並保留草稿", "Compare latest version and keep draft")}</button></div>}
    {comparison && step && <details className="rounded-xl border p-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w("最新已存成果", "Latest saved result")}</summary><Templates step={step.id} data={step.data} view={view} locale={locale} disabled readOnly onChange={() => {}} /></details>}

    <div id="task-tools" className="space-y-4">
    {!view.archived && view.steps.find(s => s.id === "05-1")?.done && <details open={weeklyOpen} onToggle={e => setWeeklyOpen(e.currentTarget.open)} className="rounded-xl border border-dark/15 p-5"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w("每週開發待辦（已建立 13 週）", "Weekly activity (thirteen weeks created)")}</summary>{weeklyOpen && <Suspense fallback={<p role="status">{w("載入每週待辦…", "Loading weekly tasks…")}</p>}><ThisWeekCalendar /></Suspense>}</details>}
    {!view.archived && step?.kind !== "conversation" && <div id="prospects"><Suspense fallback={<p role="status">{w("載入公司搜尋…", "Loading company search…")}</p>}><ProspectSearch userId={userId} planId={view.plan.id} compact /></Suspense></div>}
    <details className="rounded-xl border border-dark/15 p-5"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w("計畫歷史與新計畫", "Plan history and a new plan")}</summary><div className="mt-4 space-y-3"><button className={button} onClick={() => void load(plan.id)} type="button">{w("回到目前計畫", "Return to the active plan")}</button>{view.history.map(h => <button className={button} key={h.id} type="button" onClick={() => void load(h.id)}>{h.goal || w("舊計畫", "Previous plan")} · {h.createdAt.slice(0, 10)}</button>)}{view.archived && view.steps.length === 0 && view.plan.actions.map(a => <article key={a.id} className="rounded-xl border p-4"><h3 className="font-bold">{a.done ? "✓ " : "○ "}{a.title}</h3><p className="mt-2 text-sm">{a.expectedOutcome.text}</p><p className="mt-2 text-sm">{a.completedAt?.slice(0, 10)}</p>{a.taskFinding?.result?.cards.map((c, i) => <p key={i} className="mt-2 text-sm">{c.title} · {c.text} · {c.evidence}</p>)}</article>)}</div></details>
    </div>
    {view.steps.length > 0 && <ActionMap userId={userId} plan={displayPlan} event={mapEvent} compact tools={!view.archived && <ActionPlanBuilder variant="regenerate" triggerClassName="min-h-11 rounded-xl border border-dark/20 bg-white px-3 py-2 text-xs font-semibold" />}>
      <div className="space-y-5">{MILESTONES.map((m, index) => <section key={index} className="space-y-3 pt-4"><h3 className="font-bold">{index + 1}. {words(m, locale)}</h3>{view.steps.filter(s => s.milestone === index).map(s => <div key={s.id} className={"rounded-xl border p-4 " + (s.id === view.current ? "border-black bg-white" : "border-dark/10")}>{s.done || s.id === view.current ? <button type="button" className="min-h-11 w-full break-words text-left font-semibold underline focus-visible:outline-2" onClick={() => { choose(view, s.id); requestAnimationFrame(() => heading.current?.focus()); }}>{s.done ? "✓ " : "→ "}{s.id} {words(STEPS.find(spec => spec.id === s.id)!.title, locale)}</button> : <p className="break-words font-semibold">{s.id} {words(STEPS.find(spec => spec.id === s.id)!.title, locale)} · {w("完成上一步後開啟", "Complete the previous step to unlock")}</p>}<p className="mt-2 text-sm text-dark/65">{words(STEPS.find(spec => spec.id === s.id)!.criteria, locale)}</p></div>)}</section>)}</div>
    </ActionMap>}

  </section>;
}
