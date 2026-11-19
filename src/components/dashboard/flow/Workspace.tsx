"use client";
import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { memberFetch } from "@/lib/member-fetch";
import { STEPS, MILESTONES, STEP_WORK, STEP_BUTTONS, TEMPLATE_NAMES, flowDataSchema, words, type FlowData, type StepId } from "@/lib/action-plan/flow/catalog";
import type { FlowView } from "@/lib/action-plan/flow/service";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import { pathForLocale } from "@/lib/routes";
import { today } from "@/lib/roadmap/schema";
import Templates, { button, TextField } from "./Templates";
import CurrentFindings from "./CurrentFindings";
import OrganizeWork, { TaskRoadmap, TaskSection, type ConfirmationRecipient } from "./OrganizeWork";
import LearningResources from "../LearningResources";
import TaskAssist from "./TaskAssist";
import Proofs from "./Proofs";
import TaskResults from "./TaskResults";
const ProspectSearch = lazy(() => import("../prospecting/ProspectSearch"));

export default function Workspace({ userId, plan, onChanged, title }: { title?: ReactNode; userId: string; plan: ActionPlanDto; onChanged(plan: ActionPlanDto): void }) {
  const locale = useLocale() as "zh-tw" | "en", zh = locale === "zh-tw", router = useRouter(), w = (a: string, b: string) => zh ? a : b;
  const [view, setView] = useState<FlowView | null>(null), [selected, setSelected] = useState<StepId | null>(null), [draft, setDraft] = useState<FlowData | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [link, setLink] = useState(""), [editingGoal, setEditingGoal] = useState(false);
  const [goal, setGoal] = useState(plan.roadmap?.goal || ""), [deadline, setDeadline] = useState(plan.roadmap?.deadline || "");
  const [savedVersion, setSavedVersion] = useState(0);
  const [comparison, setComparison] = useState(false);
  const loadRequest = useRef(0);
  const backgroundRequest = useRef(false);
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
        const legacy = !saved && ["01-2", "01-3"].includes(id)
          ? JSON.parse(localStorage.getItem(`nova:legacy-organize:${userId}:${step?.actionId}`) || "null")
          : null;
        const restored = saved ? JSON.parse(saved) : legacy?.revision === (next.plan.revision || 0) - 1 ? legacy?.data : null;
        if (restored) { const parsed = flowDataSchema.safeParse(restored); if (parsed.success && parsed.data.kind === step?.kind) { data = parsed.data; setNotice(zh ? "已恢復這一步的未儲存草稿。" : "Unsaved draft restored for this step."); } }
      } catch { setNotice(zh ? "無法讀取本機草稿，伺服器紀錄保留。" : "Local draft unavailable; server records are retained."); }
    }
    setDraft(data); setComparison(false); setLink("");
  }, [cacheKey, userId, zh]);
  const load = useCallback(async (id = plan.id, preserve = false, background = false) => {
    const request = ++loadRequest.current; if (!background) setLoading(true);
    try {
      const next = await memberFetch<FlowView>(base + "&planId=" + encodeURIComponent(id));
      if (request !== loadRequest.current) return null;
      setView(next); setError("");
      if (!preserve) { requestAnimationFrame(() => { const id = window.location.hash.slice(1); if (id) document.getElementById(id)?.scrollIntoView({ block: "start" }); }); const linked = next.steps.find(s => window.location.hash === "#action-" + s.actionId && (s.done || s.id === next.current || ["01-2", "01-3"].includes(s.id))); choose(next, linked?.id || next.current || next.steps.at(-1)?.id || null); }
      return next;
    } catch (error) { if (request === loadRequest.current) setError(error instanceof Error ? error.message : String(error)); return null; }
    finally { if (!background && request === loadRequest.current) setLoading(false); }
  }, [base, plan.id, choose]);
  useEffect(() => { const request = loadRequest, timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); request.current++; }; }, [load]);
  const step = view?.steps.find(s => s.id === selected), spec = STEPS.find(s => s.id === selected);
  const refreshProgress = useEffectEvent((newerVersionOnly = false) => {
    if (!view || view.archived || busyRef.current || loading || backgroundRequest.current || document.visibilityState !== "visible") return;
    if (newerVersionOnly && (view.plan.id !== plan.id || (view.plan.revision || 0) >= (plan.revision || 0))) return;
    // Keep the editing revision with unsaved input so a refresh cannot bypass conflict checks.
    if (JSON.stringify(draft) !== JSON.stringify(step?.data || null)) return;
    backgroundRequest.current = true;
    void load(view.plan.id, true, true).then(next => {
      if (next) choose(next, selected === view.current ? next.current || selected : selected, false);
    }).finally(() => { backgroundRequest.current = false; });
  });
  useEffect(() => { const timer = setTimeout(() => refreshProgress(true), 0); return () => clearTimeout(timer); }, [plan.revision, busy, loading]);
  useEffect(() => {
    const refresh = () => refreshProgress();
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const disabled = busy || loading;
  const readOnly = Boolean(view?.archived || step?.done || selected !== view?.current);
  const saved = step?.id === "02-2" || Boolean(step?.saved && JSON.stringify(draft) === JSON.stringify(step.data));
  function change(data: FlowData) {
    if (!view || !selected) return;
    if (backgroundRequest.current) loadRequest.current++;
    setDraft(data);
    try { localStorage.setItem(cacheKey(view.plan.id, selected), JSON.stringify(data)); }
    catch { setNotice(w("本機暫存失敗，離開前請先儲存。", "Local draft could not be saved; save before leaving.")); }
  }
  async function mutate(body: object, move = false, revision = view?.plan.revision, onError?: (message: string) => void) {
    if (!view || busyRef.current || loading) return; loadRequest.current++; setLoading(false); busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const next = await memberFetch<FlowView & { link?: string; emailResults?: Array<{ leadId: string; status: string; error: string }> }>(base, { method: "POST", body: JSON.stringify({ planId: view.plan.id, revision, ...body }) });
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
    } catch (error) { const message = error instanceof Error ? error.message : String(error); (onError || setError)(message); return null; }
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
  if (!view) return <div data-task-reference="" className="space-y-4">{title}<section className="rounded-2xl border border-dark/15 p-5"><p role="status">{w("載入 16 步行動計畫…", "Loading your sixteen-step plan…")}</p>{error && <p role="alert" className="whitespace-pre-wrap break-words text-red-800">{error}</p>}<button className={button} disabled={loading} type="button" onClick={() => void load()}>{w("重試", "Retry")}</button></section></div>;
  const originalMarket = view.steps.find(s => s.id === "01-1")?.data;
  const marketData = step?.id === "01-1" || step?.id === "05-2" ? draft : originalMarket;
  const positioning = view.steps.find(s => s.id === "01-2")?.data;
  const searchDescription = [positioning?.kind === "organize" && positioning.confirmed.includes("positioning") ? positioning.values.positioning : "", ...view.criteria.filter(c => c.confirmed && new Set(c.sources).size >= 3).map(c => c.label)].filter(Boolean).join("\n");
  const positioningProspects = step?.id === "01-2" && (step.done || view.current === step.id);
  const prospects = step && !view.archived && (positioningProspects || ["01-1", "03-1", "04-1", "05-2"].includes(step.id)) && <div id="prospects" data-task-section={positioningProspects ? "companies" : undefined} className="scroll-mt-6"><Suspense fallback={<p role="status">{w("載入公司搜尋…", "Loading company search…")}</p>}><ProspectSearch key={view.plan.id + ":" + step.id} userId={userId} planId={view.plan.id} compact showHeading={positioningProspects} stepContext={{ step: step.id, market: marketData?.kind === "conversation" || marketData?.kind === "outreach" ? marketData.market : "", description: searchDescription }} /></Suspense></div>;
  const firstTask = step?.id === "01-1";
  const organizeStep = step?.id === "01-2" || step?.id === "01-3" ? step.id : null;
  async function saveAndComplete(data: FlowData) {
    const next = await mutate({ action: "save", step: selected, data });
    if (next?.steps.find(s => s.id === selected)?.ready) return mutate({ action: "complete", step: selected, requestId: crypto.randomUUID() }, true, next.plan.revision);
    return next;
  }
  async function emailConfirmations(recipients: ConfirmationRecipient[], reminder: boolean) {
    if (!view || draft?.kind !== "organize") return w("請先載入定位草稿", "Load the positioning draft first");
    let error = "";
    const data = { ...draft, confirmed: [...new Set([...draft.confirmed, "positioning"])] };
    const next = reminder || saved && draft.confirmed.includes("positioning") ? view : await mutate({ action: "save", step: "01-2", data }, false, view.plan.revision, message => { error = message; });
    if (!next) return error || w("無法儲存，請重試。", "Unable to save. Retry.");
    const sent = await mutate({ action: "confirmEmail", recipients, reminder }, false, next.plan.revision, message => { error = message; });
    if (!sent?.emailResults) return error || w("無法確認寄送，請重試。", "Could not confirm the send. Retry.");
    const accepted = sent.emailResults.filter(item => item.status === "accepted").length;
    setNotice(w(`寄送服務已接受 ${accepted} 封確認信。`, `Email service accepted ${accepted} confirmation messages.`));
    return sent.emailResults.filter(item => item.error).map(item => {
      const lead = sent.leads.find(r => r.id === item.leadId);
      return [lead?.company, lead?.name, item.error].filter(Boolean).join(" · ");
    }).join("\n");
  }
  const linkPanel = link && <div role="status" className="space-y-3 rounded-xl border border-dark/20 p-4"><label className="block text-sm">{w("專屬連結（可複製）", "Dedicated link (copy to share)")}<input readOnly className="mt-1 min-h-11 w-full rounded-xl border px-3 text-sm" value={link} onFocus={e => e.target.select()} /></label><button type="button" className={button} disabled={disabled} onClick={() => { void navigator.clipboard.writeText(link).then(() => setNotice(w("連結已複製", "Link copied"))).catch(() => setError(w("無法使用剪貼簿，請手動複製上方連結。", "Clipboard unavailable; copy the link manually."))); }}>{w("複製連結", "Copy link")}</button></div>;
  function saveConversation() {
    if (draft?.kind !== "conversation") return;
    if (!draft.market.trim()) {
      (document.getElementById("first-task-market") as HTMLDialogElement | null)?.showModal();
      return;
    }
    void saveAndComplete(draft);
  }
  const milestone = spec && view.plan.roadmap?.milestones[spec.milestone];
  const milestoneSteps = spec ? view.steps.filter(s => s.milestone === spec.milestone) : [];
  const completed = view.plan.actions.filter(a => a.done).length;
  const report = step?.id === "05-3" && !view.current && !view.archived;
  const canEditGoal = !view.archived && !readOnly;
  const isEvidenceStep = step && ["02-2", "04-1", "05-2"].includes(step.id);
  const weeklyStep = step?.id === "05-1";
  const canConfirmWeekly = weeklyStep && saved && view.weekly.calculable;
  const repairStep = !view.archived && view.integrity.find(item => ["02-2", "04-1", "05-2"].includes(item.step))?.step;
  const recordButton = step ? words(STEP_BUTTONS[step.id], locale) : "";
  const proofOnly = step?.id === "02-2" || step?.id === "04-1";
  const editorSaves = step?.id === "01-4" || step?.id === "03-3" || step?.id === "04-2";

  function saveCurrentStep() {
    if (!step || !draft) return;
    if (draft.kind === "organize") {
      const keys = step.id === "02-3" ? ["price", "scope", "terms"].filter(key => draft.values[key]?.trim())
        : step.id === "03-2" && draft.selections.length === 2 ? ["channels"]
        : step.id === "04-3" ? ["renewal", "revenue", "cost"] : [];
      return saveAndComplete({ ...draft, confirmed: [...new Set([...draft.confirmed, ...keys])] });
    }
    if (step.id === "05-3" && draft.kind === "document") {
      return saveAndComplete({ ...draft, sections: draft.sections.map(chapter => ({ ...chapter, confirmed: Boolean(chapter.body.trim()) })) });
    }
    return saveAndComplete(draft);
  }

  function selectStep(id: StepId) {
    if (!view || (!readOnly && !saved && !window.confirm(w("尚未儲存的草稿會保留在此裝置，仍要切換？", "Unsaved input stays on this device. Switch steps?")))) return;
    choose(view, id);
    requestAnimationFrame(() => heading.current?.scrollIntoView({ block: "start" }));
  }

  return <section id="goal-roadmap" data-task-reference="" className="min-w-0 space-y-6">
    <header data-next-step="goal" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-dark/10 pb-3">
      <div className="min-w-0">
        {title}
        {view.plan.roadmap && <div className="flex flex-wrap items-center gap-x-2 text-xs text-dark/55">
          {canEditGoal ? <button type="button" className="min-h-11 text-left hover:underline focus-visible:outline-2" aria-label={w("修改目標", "Edit goal")} onClick={() => {
            setGoal(view.plan.roadmap?.goal || "");
            setDeadline(view.plan.roadmap?.deadline || "");
            setEditingGoal(value => !value);
          }}>{w("目標", "Goal")} · {view.plan.roadmap.goal}</button> : <p>{w("目標", "Goal")} · {view.plan.roadmap.goal}</p>}
          <span>{w("完成日期", "Due")} {view.plan.roadmap.deadline}</span>
        </div>}
      </div>
      <div className="ml-auto flex min-h-11 max-w-full items-center gap-3 text-xs text-dark/55">
        <span>{w("整體進度", "Overall progress")} {Math.round(completed / Math.max(1, view.plan.actions.length) * 100)}%</span>
        <progress className="h-1 w-20 sm:w-28 border-0 bg-dark/10 accent-black [&::-webkit-progress-bar]:bg-dark/10 [&::-webkit-progress-value]:bg-black [&::-moz-progress-bar]:bg-black" aria-label={w("整體進度", "Overall progress")} value={completed} max={Math.max(1, view.plan.actions.length)} />
      </div>
      {editingGoal && canEditGoal && <form className="w-full space-y-3 rounded-xl border p-4" onSubmit={e => { e.preventDefault(); void mutate({ action: "goal", goal, deadline }).then(next => { if (next) setEditingGoal(false); }); }}>
        <TextField label={w("目標", "Goal")} value={goal} onChange={setGoal} />
        <TextField type="date" label={w("期限", "Deadline")} value={deadline} onChange={setDeadline} />
        <button className={button} disabled={disabled}>{w("保存目標與日期", "Save goal and dates")}</button>
      </form>}
    </header>

    {step && spec && draft && <article key={view.plan.id + ":" + step.id} id={"action-" + step.actionId} data-next-step="record" className="scroll-mt-6 space-y-6">
      <div data-task-section="priority" className="space-y-3">
        <TaskSection number="01" title={w("本日優先行動", "Today’s priority")} />
        <section data-today-priority className="rounded-2xl bg-[#0b0b0d] p-5 text-white sm:p-6">
          <div className="flex flex-col items-start justify-between gap-4 lg:flex-row">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold tracking-wider text-white/55">
                {w("里程碑", "Milestone")} {String(spec.milestone + 1).padStart(2, "0")} · {words(MILESTONES[spec.milestone], locale)} · {w("行動", "Action")} {milestoneSteps.findIndex(s => s.id === step.id) + 1} / {milestoneSteps.length} · <span data-task-type>{words(TEMPLATE_NAMES[spec.kind], locale)}</span>
              </p>
              <h2 ref={heading} tabIndex={-1} className="mt-2 scroll-mt-6 break-words text-lg font-bold focus:outline-none sm:text-xl">
                {step.id === "01-2" ? w(spec.previousTitle[0], "Write your positioning statement and ask five participants to confirm") : step.id === "01-3" ? w(spec.previousTitle[0], "Build your lead qualification criteria") : words(spec.previousTitle, locale)}
              </h2>
              <div className="mt-3 flex gap-1" aria-hidden="true">{milestoneSteps.map(s => <span key={s.id} className={"h-1 w-7 rounded-full " + (s.done || s.id === step.id ? "bg-white" : "bg-white/20")} />)}</div>
            </div>
            {!readOnly && <button type="button" className="min-h-11 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black focus-visible:outline-2" disabled={disabled || organizeStep === "01-3" && draft.kind === "organize" && draft.criteria.length >= 6} onClick={() => {
              if (organizeStep === "01-3") document.getElementById("add-criterion")?.click();
              if (step.id === "05-2") {
                (document.getElementById("second-market-conversation") as HTMLDialogElement | null)?.showModal();
                return;
              }
              if (step.id === "03-1") document.getElementById("new-outreach-record")?.click();
              const target = document.getElementById(organizeStep === "01-2" ? "positioning-recipients" : "task-work");
              target?.scrollIntoView({ block: "start" });
              requestAnimationFrame(() => target?.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled), button:not(:disabled), select:not(:disabled)")?.focus());
            }}>{recordButton}</button>}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-5 border-t border-white/15 pt-4 text-xs sm:grid-cols-[1.4fr_1fr_1fr]">
            <div className="col-span-2 sm:col-span-1"><dt className="text-white/65">{w("完成標準", "Completion criteria")}</dt><dd className="mt-2 max-w-80 font-semibold leading-6">{words(spec.criteria, locale)}</dd></div>
            <div><dt className="text-white/65">{w("目前進度", "Saved progress")}</dt><dd className="mt-2 font-semibold">
              {firstTask ? <button type="button" className="min-h-11 text-left hover:underline focus-visible:outline-2" aria-label={w(`目前進度 ${step.current} / ${step.target}，查看已儲存對話`, `Progress ${step.current} / ${step.target}, view saved conversations`)} onClick={() => (document.getElementById("first-task-records") as HTMLDialogElement | null)?.showModal()}>{step.current} / {step.target} {w("次", "conversations")}</button> : <>{step.current} / {step.target}{organizeStep === "01-2" ? w(" 位確認", " confirmed") : organizeStep === "01-3" ? w(" 項確認", " confirmed") : ""}</>}
            </dd></div>
            <div><dt className="text-white/65">{w("截止日期", "Due date")}</dt><dd className="mt-2 font-semibold">{milestone?.targetDate || "—"}</dd></div>
          </dl>
        </section>
      </div>
      {readOnly && view.current && !view.archived && !step.done && <p role="status" className="text-sm text-dark/65">
        {w("唯讀預覽 · 完成前一步後即可操作。", "Read-only preview · Complete the preceding step to edit.")}
      </p>}
      {view.integrity.length > 0 && <div id="flow-evidence" role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
        <p>{w("部分先前證據已失效，請補正證明後再繼續。", "Some earlier evidence is no longer valid. Correct it before continuing.")}</p>
        {view.integrity.map(v => <p key={v.step}>{v.step} · {v.reasons.join("；")}</p>)}
        {repairStep && repairStep !== selected && <button type="button" className={button} onClick={() => selectStep(repairStep)}>{w("補正證明", "Correct evidence")}</button>}
      </div>}
      {error && <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-red-800">
        <p className="whitespace-pre-wrap break-words text-sm">{error}</p>
        <button type="button" className={button} disabled={disabled} onClick={() => void load(view.plan.id, true).then(next => { if (next) setComparison(true); })}>{w("比較最新版本並保留草稿", "Compare latest version and keep draft")}</button>
      </div>}
      {comparison && <details className="rounded-xl border p-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w("最新已存成果", "Latest saved result")}</summary><Templates step={step.id} data={step.data} view={view} locale={locale} disabled readOnly onChange={() => {}} /></details>}

      {organizeStep && draft.kind === "organize" ? <OrganizeWork key={step.id} step={organizeStep} data={draft} view={view} locale={locale} disabled={disabled} readOnly={readOnly} onChange={change} onSave={data => saveAndComplete(data || draft)} onEmail={emailConfirmations} links={[]} onRefresh={() => void load(view.plan.id, true)} notice={notice}
        beforeResults={positioningProspects && prospects} /> : <>
        <div data-task-section="work" className="space-y-3">
          <TaskSection number="02" title={words(STEP_WORK[step.id], locale)} />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" data-task-columns>
            <section id="task-work" className="min-w-0 space-y-4 rounded-2xl border border-dark/10 bg-white p-5 sm:p-6" aria-label={words(STEP_WORK[step.id], locale)}>
              {notice && <p role="status" className="text-sm">{notice}</p>}
              {!proofOnly && <Templates onSave={data => void saveAndComplete(data)} resetVersion={savedVersion} reference={draft.kind === "conversation"} step={step.id} data={draft} view={view} locale={locale} disabled={readOnly || disabled} readOnly={readOnly} onChange={change} />}
              {firstTask && !readOnly && draft.kind === "conversation" && <dialog id="first-task-market" aria-labelledby="first-task-market-title" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border bg-white p-5 text-dark backdrop:bg-black/35">
        <form className="space-y-4" onSubmit={event => {
          event.preventDefault();
          const market = String(new FormData(event.currentTarget).get("market") || "").trim();
          if (!market) return;
          event.currentTarget.closest("dialog")?.close();
          const next = { ...draft, market };
          change(next);
          void saveAndComplete(next);
        }}>
          <h3 id="first-task-market-title" className="font-bold">{w("選擇原市場", "Choose your original market")}</h3>
          <label className="block text-sm">{w("目標市場／國家", "Target market / country")}
            <input name="market" required maxLength={200} className="mt-1 min-h-11 w-full rounded-xl border px-3" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={button} onClick={event => event.currentTarget.closest("dialog")?.close()}>{w("取消", "Cancel")}</button>
            <button type="submit" className={button + " bg-black text-white"}>{w("儲存紀錄", "Save conversation")}</button>
          </div>
        </form>
      </dialog>}
              {isEvidenceStep && (!readOnly || repairStep === selected) && (step.id === "05-2" && step.data.kind === "outreach"
                ? <details className="rounded-xl border border-dark/15 px-4">
                    <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{w("上傳付款證明", "Upload payment evidence")}</summary>
                    <div className="pb-4"><Proofs userId={userId} view={view} paidOnly companiesForEvidence={step.data.contacts.filter(row => row.status === "conversation")} onChanged={() => void load(view.plan.id, true)} /></div>
                  </details>
                : <Proofs userId={userId} view={view} paidOnly={step.id === "04-1"} companiesForEvidence={step.id === "02-2" ? view.steps.flatMap(entry => entry.id === "02-1" && entry.data.kind === "outreach" ? entry.data.contacts.filter(contact => contact.status !== "draft") : []) : undefined} onChanged={() => void load(view.plan.id, true)} />)}
              {!readOnly && step.id === "01-4" && draft.kind === "organize" && (view.leads.length < 10 || view.tiers.filter(t => t.confirmed && t.tier === "A").length < 3) && <button type="button" className={button} disabled={disabled || !saved || view.leads.some(l => !view.tiers.some(t => t.leadId === l.id && t.confirmed)) || Boolean(draft.supplements?.some(r => r.records.length < 3 || !view.leads.some(l => l.id === r.records[0]?.id)))} onClick={() => void startSupplement()}>{w("補做三次對話", "Add three supplemental conversations")}</button>}
              {!readOnly && saved && !step.ready && (weeklyStep ? !canConfirmWeekly : !firstTask && !proofOnly) && step.reasons.length > 0 && <p role="status" className="text-sm text-dark/70">{weeklyStep ? step.reasons[0] : step.reasons.join(" · ")}</p>}
              {!readOnly && !editorSaves && <div className="flex flex-wrap items-start justify-end gap-3 border-t border-dark/10 pt-3">
                {firstTask && <details className="min-w-0 flex-1">
                  <summary className="min-h-11 cursor-pointer py-3 text-xs text-dark/60">{w("貼上會議紀錄或語音轉寫", "Paste meeting notes or transcribe audio")}</summary>
                  <TaskAssist embedded key={view.plan.id+":"+step.id} userId={userId} step={step.id} view={view} locale={locale} disabled={disabled} onBusy={value => { busyRef.current = value; setBusy(value); }} onView={next => { setView(next); onChanged(next.plan); }} onRefresh={() => void load(view.plan.id, true)} onApply={data => { change(data); setSavedVersion(v => v + 1); }} />
                </details>}
                {firstTask ? <button type="button" className={button + " rounded-full! bg-black text-white"} disabled={disabled} onClick={saveConversation}>{w("儲存紀錄", "Save conversation")}</button>
                  : weeklyStep && draft.kind === "organize" ? <div className="flex flex-wrap items-center justify-end gap-3">
                    {canConfirmWeekly && view.weekly.assumed && <p className="text-xs text-dark/65">{w("調整的比率為待驗證假設。", "Adjusted rates are unverified assumptions.")}</p>}
                    <button type="button" className={button + " rounded-full! bg-black text-white"} disabled={disabled} onClick={() => {
                      if (canConfirmWeekly) void saveAndComplete({ ...draft, confirmed: ["target", "activity", ...(view.weekly.assumed ? ["assumption"] : [])] });
                      else void mutate({ action: "save", step: step.id, data: draft });
                    }}>{canConfirmWeekly ? w("確認並完成", "Confirm and complete") : w("計算每週開發量", "Calculate weekly activity")}</button>
                  </div>
                  : proofOnly
                    ? <button type="button" className={button + " rounded-full! bg-black text-white"} disabled={disabled || !step.ready} onClick={() => void saveAndComplete(draft)}>{w("確認並完成", "Confirm and complete")}</button>
                    : <button type="button" className={button + " rounded-full! bg-black text-white"} disabled={disabled} onClick={() => void saveCurrentStep()}>{step.id === "05-3" ? w("產生報告", "Generate report") : step.id === "03-1" ? w("儲存紀錄", "Save outreach") : w("儲存", "Save")}</button>}
              </div>}
            </section>
            <aside className="min-w-0 space-y-4 rounded-2xl border border-dark/10 bg-white p-5 sm:p-6" aria-label={w("方法指引", "Method guide")}>
              <div>
                <p className="text-[10px] tracking-wider text-dark/55">{w("方法指引", "METHOD GUIDE")}</p>
                {firstTask && <h3 className="mt-2 text-sm font-bold">{w("如何進行一次有效的客戶對話", "How to run an effective customer conversation")}</h3>}
              </div>
              <LearningResources kind={firstTask ? "interview" : step.id === "02-1" ? "pilot" : null} question={words(spec.title, locale)} visual />
              {firstTask ? <><h4 className="text-xs font-bold">{w("建議提問", "Suggested questions")}</h4><ol className="list-decimal space-y-1 pl-5 text-xs leading-6">
                <li>{w("對方是否符合你的目標客群？", "Does this person fit your target customer profile?")}</li>
                <li>{w("他目前如何解決這個問題？", "How do they solve the problem today?")}</li>
                <li>{w("最近一次遇到這個問題是什麼時候？", "When did they last encounter the problem?")}</li>
                <li>{w("這個問題耗費多少時間或金錢？", "How much time or money does the problem cost?")}</li>
                <li>{w("如果有解法，他願意付多少？", "What would they pay for a solution?")}</li>
              </ol></> : <p className="text-xs leading-6">{words(spec.guide, locale)}</p>}
            </aside>
          </div>
        </div>
        {firstTask ? <CurrentFindings view={view} locale={locale} reference /> : <TaskResults step={step} view={view} locale={locale} updateProposal={step.id === "02-1" && step.done && view.current && !view.archived && !disabled
          ? (contactId, status) => void mutate({ action: "followup", sourceActionId: step.actionId, update: { id: crypto.randomUUID(), contactId, status, date: today(), note: "" } })
          : undefined}>
          {(step.id === "03-3" || step.id === "05-3" && !report) && step.done && <a className={button} href={pathForLocale("/task-report/" + step.actionId, locale)} target="_blank" rel="noopener noreferrer">{w("預覽／列印為 PDF", "Preview / print to PDF")}</a>}
          {report && <div id="flow-report" className="scroll-mt-6 space-y-3">
            <div className="flex flex-wrap gap-3">
              <a className={button} href={pathForLocale("/task-report/" + step.actionId, locale)} target="_blank" rel="noopener noreferrer">{w("預覽／列印為 PDF", "Preview / print to PDF")}</a>
              {(!view.shared || !link) && <button className={button} disabled={disabled || view.integrity.length > 0} type="button" onClick={() => void mutate({ action: "share", enabled: true })}>{w("建立報告分享連結", "Create report sharing link")}</button>}
              {view.shared && <button className={button} disabled={disabled} type="button" onClick={() => void mutate({ action: "share", enabled: false }).then(next => { if (next) setLink(""); })}>{w("撤銷報告分享", "Revoke report sharing")}</button>}
            </div>
            {linkPanel}
          </div>}
        </TaskResults>}
      </>}
      {prospects && !positioningProspects && <section data-task-section="companies" className="space-y-3"><TaskSection number="04" title={step.id === "03-1" ? w("本週建議聯絡的公司", "Companies to contact this week") : step.id === "04-1" ? w("建議接觸的 A 級公司", "Suggested A-tier companies") : step.id === "05-2" ? w("建議聯絡的公司", "Suggested companies") : w("建議優先聯絡的 5 家公司", "5 companies to contact first")} />{prospects}</section>}
      <TaskRoadmap view={view} selected={step.id} locale={locale} onSelect={selectStep} />
    </article>}
  </section>;
}
