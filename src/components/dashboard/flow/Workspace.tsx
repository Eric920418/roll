"use client";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { memberFetch } from "@/lib/member-fetch";
import { STEPS, MILESTONES, flowDataSchema, emptyRecord, emptyContact, words, type FlowData, type StepId } from "@/lib/action-plan/flow/catalog";
import type { FlowView } from "@/lib/action-plan/flow/service";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import { pathForLocale } from "@/lib/routes";
import ActionMap from "../ActionMap";
import ActionPlanBuilder from "../ActionPlanBuilder";
import Templates, { button, TextField } from "./Templates";
import CurrentFindings from "./CurrentFindings";
import LearningResources from "../LearningResources";
import TaskAssist from "./TaskAssist";
import Proofs from "./Proofs";
const ProspectSearch = lazy(() => import("../prospecting/ProspectSearch"));
const ThisWeekCalendar = lazy(() => import("../home/ThisWeekCalendar"));

export default function Workspace({ userId, plan, onChanged }: { userId: string; plan: ActionPlanDto; onChanged(plan: ActionPlanDto): void }) {
  const locale = useLocale() as "zh-tw" | "en", zh = locale === "zh-tw", router = useRouter(), w = (a: string, b: string) => zh ? a : b;
  const [view, setView] = useState<FlowView | null>(null), [selected, setSelected] = useState<StepId | null>(null), [draft, setDraft] = useState<FlowData | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [link, setLink] = useState(""), [leadId, setLeadId] = useState(""), [editingGoal, setEditingGoal] = useState(false);
  const [goal, setGoal] = useState(plan.roadmap?.goal || ""), [deadline, setDeadline] = useState(plan.roadmap?.deadline || "");
  const [comparison, setComparison] = useState(false), [prospectsOpen, setProspectsOpen] = useState(false), [weeklyOpen, setWeeklyOpen] = useState(false);
  const loadRequest = useRef(0);
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
  useEffect(() => {
    const reveal = () => { if (window.location.hash === "#prospects") setProspectsOpen(true); };
    const timer = setTimeout(reveal, 0); window.addEventListener("hashchange", reveal);
    return () => { clearTimeout(timer); window.removeEventListener("hashchange", reveal); };
  }, []);
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
      if (next.link) setLink(new URL(pathForLocale(next.link, locale), window.location.origin).href);
      if (selected && ("data" in body || move)) {
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
  if (!view) return <section className="rounded-2xl border border-dark/15 p-5"><p role="status">{w("載入 16 步行動計畫…", "Loading your sixteen-step plan…")}</p>{error && <p role="alert" className="whitespace-pre-wrap break-words text-red-800">{error}</p>}<button className={button} disabled={loading} type="button" onClick={() => void load()}>{w("重試", "Retry")}</button></section>;
  const displayPlan = view.steps.length === 0 ? view.plan : { ...view.plan, roadmap: view.plan.roadmap ? { ...view.plan.roadmap, milestones: view.plan.roadmap.milestones.map(m => ({ ...m, title: words(MILESTONES[m.position], locale) })) } : null };
  const lastMilestone = view.plan.roadmap?.milestones.filter(m => m.achievedAt).at(-1);
  const mapEvent = view.archived ? null : lastMilestone ? "milestone:" + lastMilestone.id : "goal:" + view.plan.id;
  return <section id="goal-roadmap" className="min-w-0 space-y-6">
    <header data-next-step="goal" className="space-y-4 rounded-2xl border border-dark/15 bg-white p-5 sm:p-7">
      <p className="text-xs font-semibold tracking-widest text-dark/55">NOVA · {view.steps.length ? w("5 個里程碑／16 步", "5 MILESTONES / 16 STEPS") : w("歷史計畫", "ARCHIVED PLAN")}</p>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm text-dark/60">{w("我的目標", "My goal")}</p><h2 className="mt-2 break-words text-xl font-bold">{view.plan.roadmap?.goal || w("舊計畫", "Previous plan")}</h2><p className="mt-2 text-sm">{view.plan.roadmap?.deadline}</p></div>{!view.archived && <button type="button" className={button} onClick={() => { setGoal(view.plan.roadmap?.goal || ""); setDeadline(view.plan.roadmap?.deadline || ""); setEditingGoal(v => !v); }}>{w("修改目標", "Edit goal")}</button>}</div>
      {editingGoal && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void mutate({ action: "goal", goal, deadline }).then(next => { if (next) setEditingGoal(false); }); }}><TextField label={w("目標", "Goal")} value={goal} onChange={setGoal} /><TextField type="date" label={w("期限", "Deadline")} value={deadline} onChange={setDeadline} /><button className={button} disabled={disabled}>{w("保存目標與日期", "Save goal and dates")}</button></form>}
      <p className="text-sm">{view.plan.actions.filter(s => s.done).length} / {view.plan.actions.length} {w("步已完成", "steps completed")}{view.archived ? w(" · 歷史版本，唯讀", " · Archived, read only") : ""}</p>
    </header>
    {view.integrity.length > 0 && <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><p>{w("部分先前證據已失效，歷史紀錄保留；請補正證明再繼續或分享。", "Some earlier evidence is no longer valid. History is retained; correct the proof before continuing or sharing.")}</p>{view.integrity.map(v => <p key={v.step}>{v.step} · {v.reasons.join("；")}</p>)}</div>}
    {!view.current && view.steps.length > 0 && <p role="status" className="rounded-xl bg-black p-5 font-bold text-white">{view.integrity.length ? w("16 步紀錄完成，證據需補正", "Sixteen steps recorded; evidence needs attention") : w("已完成驗證 · 16 步成果已保存", "Validation complete · sixteen steps retained")}</p>}
    {readOnly && view.current && !view.archived && <button className={button} type="button" onClick={() => choose(view, view.current)}>{w("回到目前一步", "Return to the current step")}</button>}
    {step && spec && draft && <article key={view.plan.id+":"+step.id} id={"action-" + step.actionId} data-next-step="record" className="scroll-mt-6 space-y-6 rounded-2xl border border-dark/20 bg-white p-5 sm:p-7">
      <header><p className="text-xs font-semibold tracking-wider text-dark/60">{words(MILESTONES[spec.milestone], locale)} · {step.id} · {w(({ conversation: "對話", organize: "整理", outreach: "聯絡", document: "文件" })[step.kind], ({ conversation: "Conversation", organize: "Organize", outreach: "Outreach", document: "Document" })[step.kind])}</p><h2 ref={heading} tabIndex={-1} className="mt-3 scroll-mt-6 break-words text-2xl font-bold focus:outline-none">{words(spec.title, locale)}</h2></header>
      <section className="rounded-xl bg-dark/5 p-4"><h3 className="text-sm font-bold">{w("完成標準", "Completion criteria")}</h3><p className="mt-2 text-sm leading-6">{words(spec.criteria, locale)}</p><p className="mt-3 font-semibold">{w("已儲存進度：", "Saved progress: ")}{step.current} / {step.target}</p></section>
      <Templates key={view.plan.id + ":" + step.id} step={step.id} data={draft} view={view} locale={locale} disabled={readOnly || disabled} onChange={change} />
      {!view.archived && (["02-2", "04-1", "05-2"].includes(step.id) || view.integrity.length > 0) && <Proofs userId={userId} view={view} onChanged={() => void load(view.plan.id, true)} />}
      {!readOnly && step.id !== "02-2" && <div className="flex flex-wrap gap-3"><button type="button" className={button + " bg-black text-white"} disabled={disabled} onClick={() => void mutate({ action: "save", step: selected, data: draft })}>{w("儲存本步成果", "Save this step")}</button>{step.kind !== "conversation" && <button type="button" className={button} disabled={disabled} onClick={() => { if (window.confirm(w("重新帶入已存成果作為初稿？確認後仍需按儲存，不會更動前一步紀錄。", "Rebuild the draft from saved results? Save it explicitly; earlier records stay unchanged."))) change(step.draft); }}>{w("重新整理初稿", "Rebuild draft")}</button>}</div>}
      {step.id === "01-2" && !readOnly && <section className="space-y-3 rounded-xl border border-dark/15 p-4"><h3 className="font-bold">{w("請受訪者確認定位", "Ask interviewees to confirm")}</h3><p className="text-sm">{w("先儲存定位，再複製專屬連結給受訪者。每位對象只計一次，連結 30 天有效。", "Save the statement, then copy a dedicated link to each interviewee. Each person counts once; links last thirty days.")}</p><label className="block text-sm">{w("選擇受訪者", "Choose an interviewee")}<select aria-label={w("選擇受訪者", "Choose an interviewee")} className="mt-1 min-h-11 w-full rounded-xl border px-3" value={leadId} onChange={e => { setLeadId(e.target.value); setLink(""); }}><option value="">{w("請選擇", "Choose")}</option>{view.leads.map(l => <option key={l.id} value={l.id}>{l.company} · {l.name}</option>)}</select></label><button type="button" className={button} disabled={!saved || !leadId || disabled} onClick={() => { setLink(""); void mutate({ action: "confirmLink", leadId }); }}>{w("建立確認連結", "Create confirmation link")}</button><button type="button" className={button} disabled={disabled} onClick={() => void load(view.plan.id, true)}>{w("更新回覆", "Refresh responses")}</button></section>}

      {!readOnly && <TaskAssist key={view.plan.id+":"+step.id} userId={userId} step={step.id} view={view} locale={locale} disabled={disabled} onBusy={value => { busyRef.current = value; setBusy(value); }} onView={next => { setView(next); onChanged(next.plan); }} onRefresh={() => void load(view.plan.id, true)} onApply={change} />}
      <section className="space-y-2 border-t border-dark/10 pt-5"><h3 className="font-bold">{w("方法指引", "How to approach it")}</h3><p className="text-sm leading-7">{words(spec.guide, locale)}</p><LearningResources kind={step.kind === "conversation" ? "interview" : step.kind === "outreach" ? "pilot" : step.id === "01-2" ? "positioning" : null} question={words(spec.title, locale)} /></section>
      <section data-next-step="insights" className="space-y-3 rounded-xl bg-dark/[0.025] p-4"><h3 className="font-bold">{w("NOVA 整理結果", "NOVA findings")}</h3><p className="text-xs text-dark/60">{w("依已儲存紀錄整理；未保存的修改不計入。", "Based on saved records; unsaved edits are excluded.")}</p>{step.summary.map((s, i) => <p key={i} className="whitespace-pre-wrap break-words text-sm">{s}</p>)}{["01-1","01-2","01-3","01-4"].includes(step.id) && <CurrentFindings view={view} locale={locale} />}
        {step.id === "04-3" && <dl className="space-y-2 text-sm"><div><dt>{w("續約率", "Renewal rate")}</dt><dd>{view.metrics.renewalRate === null ? w("不適用（無到期客戶）", "N/A (no eligible customers)") : Math.round(view.metrics.renewalRate * 100) + "%"}</dd></div><div><dt>{w("平均客單價", "Revenue per customer")}</dt><dd>{view.metrics.currency} {view.metrics.averageRevenue.toFixed(2)}</dd></div><div><dt>{w("現金行銷取得成本", "Cash marketing acquisition cost")}</dt><dd>{view.metrics.currency} {view.metrics.acquisitionCost?.toFixed(2) ?? "—"}</dd></div></dl>}
        {step.id === "05-1" && <p className="text-sm">{view.weekly.currency} {view.weekly.target} · {w("每週聯絡／對話：", "Weekly contacts / conversations: ")}{view.weekly.weeklyContacts} / {view.weekly.weeklyConversations}{view.weekly.assumed ? w("（含待驗證轉換率假設）", " (includes a conversion assumption)") : ""}</p>}
        {!step.ready && <ul className="list-disc space-y-2 pl-5 text-sm text-dark/65">{step.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      </section>
      {["03-3", "05-3"].includes(step.id) && step.saved && (view.current || view.archived) && <a className={button} href={pathForLocale("/task-report/" + step.actionId, locale)} target="_blank" rel="noopener noreferrer">{w("預覽／列印為 PDF", "Preview / print to PDF")}</a>}
      {!readOnly && <button type="button" className={button + " bg-black text-white"} disabled={disabled || !saved || !step.ready} onClick={() => void mutate({ action: "complete", step: selected, requestId: crypto.randomUUID() }, true)}>{w("確認並完成", "Confirm and complete")}</button>}
      {readOnly && <p className="text-sm text-dark/65">{w("此步驟的完成成果已保留，不能覆寫。", "This completed result is retained and cannot be overwritten.")} {step.completedAt?.slice(0, 10)}</p>}
    </article>}
    {!view.current && !view.archived && view.steps.length > 0 && <section id="flow-report" className="scroll-mt-6 space-y-3 rounded-xl border p-5"><h2 className="text-lg font-bold">{w("市場驗證報告", "Market validation report")} · {view.reportCode}</h2><p className="text-sm">{w("分享預設關閉，開啟後 30 天有效；更新成果或證據後須重新建立。", "Sharing is off by default. Links last thirty days; changed results or proof require a new link.")}</p><div className="flex flex-wrap gap-3"><a className={button} href={pathForLocale("/task-report/" + view.steps.at(-1)!.actionId, locale)} target="_blank" rel="noopener noreferrer">{w("預覽／列印為 PDF", "Preview / print to PDF")}</a><button className={button} disabled={disabled || view.integrity.length > 0} type="button" onClick={() => void mutate({ action: "share", enabled: true })}>{w("建立報告分享連結", "Create report sharing link")}</button>{view.shared && <button className={button} disabled={disabled} type="button" onClick={() => void mutate({ action: "share", enabled: false }).then(next => { if (next) setLink(""); })}>{w("撤銷報告分享", "Revoke report sharing")}</button>}</div></section>}
    {link && <div role="status" className="space-y-3 rounded-xl border border-dark/20 p-4"><label className="block text-sm">{w("專屬連結（可複製）", "Dedicated link (copy to share)")}<input readOnly className="mt-1 min-h-11 w-full rounded-xl border px-3 text-sm" value={link} onFocus={e => e.target.select()} /></label><button type="button" className={button} disabled={disabled} onClick={() => { void navigator.clipboard.writeText(link).then(() => setNotice(w("連結已複製", "Link copied"))).catch(() => setError(w("無法使用剪貼簿，請手動複製上方連結。", "Clipboard unavailable; copy the link manually."))); }}>{w("複製連結", "Copy link")}</button></div>}
    {error && <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-red-800"><p className="whitespace-pre-wrap break-words text-sm">{error}</p><button type="button" className={button} disabled={disabled} onClick={() => void load(view.plan.id, true).then(next => { if (next) setComparison(true); })}>{w("比較最新版本並保留草稿", "Compare latest version and keep draft")}</button></div>}
    {comparison && step && <details className="rounded-xl border p-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w("最新已存成果", "Latest saved result")}</summary><Templates step={step.id} data={step.data} view={view} locale={locale} disabled onChange={() => {}} /></details>}
    {notice && <p role="status" className="rounded-xl bg-dark/5 p-4 text-sm">{notice}</p>}
    {!view.archived && view.steps.find(s => s.id === "05-1")?.done && <details open={weeklyOpen} onToggle={e => setWeeklyOpen(e.currentTarget.open)} className="rounded-xl border border-dark/15 p-5"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w("每週開發待辦（已建立 13 週）", "Weekly activity (thirteen weeks created)")}</summary><p className="mt-3 text-sm">{w("第一週從下週一開始，可切到下一週查看、記錄完成與調整自己的時間。", "The first week starts next Monday. Move to the next week to review, complete or reschedule your tasks.")}</p>{weeklyOpen && <Suspense fallback={<p role="status">{w("載入每週待辦…", "Loading weekly tasks…")}</p>}><ThisWeekCalendar /></Suspense>}</details>}
    {!view.archived && <details id="prospects" open={prospectsOpen} onToggle={e => setProspectsOpen(e.currentTarget.open)} className="scroll-mt-6 rounded-xl border border-dark/15 p-5"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w("找新公司（5 家／20 Token）", "Find new companies (5 for 20 Token)")}</summary>{prospectsOpen && <Suspense fallback={<p role="status">{w("載入公司搜尋…", "Loading company search…")}</p>}><ProspectSearch userId={userId} active={prospectsOpen} onSelect={!readOnly && draft && ["conversation", "outreach"].includes(draft.kind) && step?.id !== "02-1" ? company => { if (draft.kind === "conversation") change({ ...draft, records: [...draft.records, { ...emptyRecord(crypto.randomUUID()), company: company.name, name: company.contact.name || "" }] }); else if (draft.kind === "outreach") change({ ...draft, contacts: [...draft.contacts, { ...emptyContact(crypto.randomUUID()), company: company.name, name: company.contact.name || "" }] }); setNotice(w("已帶入公司與公開聯絡人，請補上實際對話或聯絡結果再儲存。", "Company and public contact added. Record actual results before saving.")); } : undefined} /></Suspense>}</details>}
    <details className="rounded-xl border border-dark/15 p-5"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w("計畫歷史與新計畫", "Plan history and a new plan")}</summary><div className="mt-4 space-y-3"><button className={button} onClick={() => void load(plan.id)} type="button">{w("回到目前計畫", "Return to the active plan")}</button>{view.history.map(h => <button className={button} key={h.id} type="button" onClick={() => void load(h.id)}>{h.goal || w("舊計畫", "Previous plan")} · {h.createdAt.slice(0, 10)}</button>)}{view.archived && view.steps.length === 0 && view.plan.actions.map(a => <article key={a.id} className="rounded-xl border p-4"><h3 className="font-bold">{a.done ? "✓ " : "○ "}{a.title}</h3><p className="mt-2 text-sm">{a.expectedOutcome.text}</p><p className="mt-2 text-sm">{a.completedAt?.slice(0, 10)}</p>{a.taskFinding?.result?.cards.map((c, i) => <p key={i} className="mt-2 text-sm">{c.title} · {c.text} · {c.evidence}</p>)}</article>)}{!view.archived && <ActionPlanBuilder variant="regenerate" />}</div></details>
    {view.steps.length > 0 && <ActionMap userId={userId} plan={displayPlan} event={mapEvent}>
      <div className="space-y-5">{MILESTONES.map((m, index) => <section key={index} className="space-y-3 pt-4"><h3 className="font-bold">{index + 1}. {words(m, locale)}</h3>{view.steps.filter(s => s.milestone === index).map(s => <div key={s.id} className={"rounded-xl border p-4 " + (s.id === view.current ? "border-black bg-white" : "border-dark/10")}>{s.done || s.id === view.current ? <button type="button" className="min-h-11 w-full break-words text-left font-semibold underline focus-visible:outline-2" onClick={() => { choose(view, s.id); requestAnimationFrame(() => heading.current?.focus()); }}>{s.done ? "✓ " : "→ "}{s.id} {words(STEPS.find(spec => spec.id === s.id)!.title, locale)}</button> : <p className="break-words font-semibold">{s.id} {words(STEPS.find(spec => spec.id === s.id)!.title, locale)} · {w("完成上一步後開啟", "Complete the previous step to unlock")}</p>}<p className="mt-2 text-sm text-dark/65">{words(STEPS.find(spec => spec.id === s.id)!.criteria, locale)}</p></div>)}</section>)}</div>
    </ActionMap>}

  </section>;
}
