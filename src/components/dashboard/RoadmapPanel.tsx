"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { correctionSchema, type StageCorrection } from "@/lib/roadmap/corrections";
import InterviewWorkspace, { InterviewInsights } from "./InterviewWorkspace";
import ActionTaskRow from "./ActionTaskRow";
import { ActionEditor } from "./ActionPlanManager";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
import { taskReference } from "@/lib/action-plan/ranking";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import type { RoadmapView } from "@/lib/roadmap/service";
import { roadmapDraftSchema, milestoneSchema, type RoadmapDraft, type MilestoneView } from "@/lib/roadmap/schema";

const button = "min-h-11 max-w-full whitespace-normal [overflow-wrap:anywhere] rounded-xl border border-dark/15 bg-white px-4 py-2 text-sm font-semibold text-dark hover:bg-dark/[0.04] disabled:opacity-50";
const input = "w-full rounded-xl border border-dark/15 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
// Local editors may temporarily contain empty required fields; only the server accepts a fully valid draft.
const editorSchema = z.object({ ...roadmapDraftSchema.shape, goal: z.string().max(2000), startsAt: z.string().max(10), deadline: z.string().max(10), milestones: z.array(z.object({ ...milestoneSchema.shape, title: z.string().max(200), expectedOutcome: z.string().max(1000), acceptanceCriteria: z.string().max(1000), targetDate: z.string().max(10) })).min(3).max(5), actions: z.array(z.object({ ...roadmapDraftSchema.shape.actions.element.shape, title: z.string().max(200), expectedOutcome: z.string().max(1000) })).length(5) });

export default function RoadmapPanel({ userId, initialPlan, onChanged }: { userId: string; initialPlan: ActionPlanDto | null; onChanged: (plan: ActionPlanDto | null) => void }) {
  const t = useTranslations("Dashboard.roadmap"), locale = useLocale() === "zh-tw" ? "zh-tw" : "en", router = useRouter();
  const planTrigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLElement | null>(null), busyRef = useRef(false);
  const [mounted, setMounted] = useState(false), [opened, setOpened] = useState(false), [busy, setBusy] = useState(false);
  const [correction, setCorrection] = useState<StageCorrection | null>(null);
  const [view, setView] = useState<RoadmapView | null>(null), [form, setForm] = useState<RoadmapDraft | null>(null);
  const [goal, setGoal] = useState(""), [deadline, setDeadline] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [note, setNote] = useState("");
  const [editing, setEditing] = useState<ActionPlanActionDto | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [insights, setInsights] = useState<{ id: string; title: string } | null>(null);
  const [historical, setHistorical] = useState<ActionPlanDto | null>(null);
  const cacheKey = `nova:roadmap:${userId}`, current = initialPlan?.roadmap?.milestones.find(m => !m.achievedAt);
  const currentId = current?.id;
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    try { setNote(currentId ? localStorage.getItem(`nova:roadmap-outcome:${userId}:${currentId}`) || "" : ""); } catch { setNotice(t("storageError")); }
  }, [currentId, userId, t]);
  function storeNote(value: string) {
    setNote(value);
    try { if (current) localStorage.setItem(`nova:roadmap-outcome:${userId}:${current.id}`, value); } catch { setNotice(t("storageError")); }
  }
  function store(nextGoal = goal, nextDeadline = deadline, draft = form, pendingRequestId?: string) {
    try { localStorage.setItem(cacheKey, JSON.stringify({ goal: nextGoal, deadline: nextDeadline, draft, correction, pendingRequestId })); } catch { setNotice(t("storageError")); }
  }
  function clearCache(expectedRequestId?: string) { try { if (expectedRequestId && JSON.parse(localStorage.getItem(cacheKey) || "null")?.pendingRequestId !== expectedRequestId) return; localStorage.removeItem(cacheKey); } catch { setNotice(t("storageError")); } }
  async function request(method = "GET", data?: object, path = "/api/action-plans/roadmap") {
    const response = await fetch(path, { method, cache: "no-store", ...(data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}) });
    let json; try { json = await response.json(); } catch { throw new Error(`HTTP ${response.status}: ${response.statusText || t("connectionError")}`); }
    if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
    return json.data;
  }
  function accept(fresh: RoadmapView) { setView(fresh); onChanged(fresh.active); }
  async function reload(preserve = true) {
    setBusy(true);
    try {
      const fresh: RoadmapView = await request(); accept(fresh);
      let cached; try { cached = JSON.parse(localStorage.getItem(cacheKey) || "null"); } catch { setNotice(t("storageError")); }
      if (!preserve || (!fresh.pending && view?.pending)) setCorrection(fresh.correction);
      if (cached?.pendingRequestId && cached.pendingRequestId === fresh.lastRequestId) { clearCache(cached.pendingRequestId); setForm(fresh.draft); setCorrection(fresh.correction); }
      else if (!preserve || (!fresh.pending && view?.pending) || (!form && fresh.draft && !cached?.draft)) setForm(fresh.draft);
      return fresh;
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(busyRef.current); }
  }
  useEffect(() => {
    if (!opened || !view?.pending) return;
    const timer = window.setInterval(() => { void reload(true); }, 3000);
    return () => clearInterval(timer);
    // Polling restores a workspace owned by a pending request; local edits remain intact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, view?.pending]);

  async function open() {
    trigger.current = document.activeElement as HTMLElement;
    setOpened(true); setHistorical(null); setError(""); setNotice(""); dialog.current?.showModal();
    let cached; try { cached = JSON.parse(localStorage.getItem(cacheKey) || "null"); } catch { setNotice(t("storageError")); }
    const fresh = await reload(false);
    if (fresh && cached?.pendingRequestId === fresh.lastRequestId) cached = null;
    setGoal(typeof cached?.goal === "string" ? cached.goal : (fresh?.input as { goal?: string } | null)?.goal || initialPlan?.roadmap?.goal || "");
    setDeadline(typeof cached?.deadline === "string" ? cached.deadline : (fresh?.input as { deadline?: string } | null)?.deadline || "");
    const restoredCorrection = correctionSchema.extend({ changes: z.array(correctionSchema.shape.changes.element.extend({ title: z.string().max(200), expectedOutcome: z.string().max(1000), whyNow: z.string().max(600) })).max(100) }).safeParse(cached?.correction);
    if (restoredCorrection.success && fresh?.correction?.milestoneId === restoredCorrection.data.milestoneId) setCorrection(restoredCorrection.data);
    const parsed = editorSchema.safeParse(cached?.draft);
    if (parsed.success && fresh?.draft && parsed.data.mode === fresh.draft.mode && parsed.data.milestoneId === fresh.draft.milestoneId) { setForm(parsed.data); setNotice(t("restored")); }
  }
  async function mutate(action: "generate" | "next" | "edit" | "activate" | "review" | "editCorrection" | "correct") {
    if (busyRef.current || !view || view.pending) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    const requestId = crypto.randomUUID(); store(goal, deadline, form, requestId);
    try {
      const data = { action, requestId, revision: view.revision, locale,
        ...(action === "generate" ? { goal, deadline: deadline || null } : action === "review" ? { planId: initialPlan!.id, planRevision: initialPlan!.revision } : action === "next" ? { planId: initialPlan!.id, planRevision: initialPlan!.revision, milestoneId: current!.id } : action === "correct" || action === "editCorrection" ? { correction } : { draft: form }),
      };
      const fresh: RoadmapView = await request(action === "generate" || action === "next" || action === "review" ? "POST" : "PATCH", data);
      accept(fresh); setForm(fresh.draft); setCorrection(fresh.correction); clearCache(requestId); setNotice(t(action === "activate" || action === "correct" ? "activated" : action === "edit" || action === "editCorrection" ? "draftSaved" : "generated"));
      if (action === "activate" || action === "correct") router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      try { const fresh: RoadmapView = await request(); accept(fresh); if (fresh.lastRequestId === requestId) { setCorrection(fresh.correction); setForm(fresh.draft); clearCache(requestId); } } catch { /* retain the original error and local input */ }
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function outcome(milestone: MilestoneView, achieved: boolean) {
    if (busyRef.current || !initialPlan) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const fresh: RoadmapView = await request("PATCH", { revision: initialPlan.revision, achieved, outcomeNote: note }, `/api/action-plans/milestones/${milestone.id}`);
      accept(fresh); setNote(""); try { localStorage.removeItem(`nova:roadmap-outcome:${userId}:${milestone.id}`); } catch { setNotice(t("storageError")); } router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function updateDraft(next: RoadmapDraft) { setForm(next); if (next.mode === "new") setGoal(next.goal); store(next.mode === "new" ? next.goal : goal, deadline, next); }
  async function changeTask(id: string, body: object, method = "PATCH", propagate = false) {
    if (busyRef.current || !initialPlan) return false;
    busyRef.current = true; setBusy(true); setError("");
    try { const next: ActionPlanDto = await request(method, { revision: initialPlan.revision, ...body }, `/api/action-plans/actions/${id}`); onChanged(next); router.refresh(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); if (propagate) throw cause; return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  function matches(a: ActionPlanActionDto) {
    return (!search.trim() || `${a.title} ${a.expectedOutcome.text}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) &&
      (filter === "all" || (filter === "done" ? a.done : filter === "blocked" ? !a.done && a.dependency.blocked : !a.done && !a.dependency.blocked));
  }
  const featuredId = initialPlan?.nextMoves[0]?.id ?? initialPlan?.actions.find(a => !a.done)?.id;
  function taskRow(a: ActionPlanActionDto, readOnly = false) {
    return <div key={a.id} id={readOnly ? undefined : `action-${a.id}`} tabIndex={-1} className="scroll-mt-24">
      <ActionTaskRow action={a} compact focusMode featured={!readOnly && a.id === featuredId} readOnly={readOnly} busy={busy} revision={initialPlan?.revision}
        onToggle={readOnly ? undefined : () => { void changeTask(a.id, { done: !a.done }).then(saved => { if (saved && !a.done && a.recordingMode === "interview") setInsights({ id: a.id, title: a.title }); }); }}
        onMetric={readOnly ? undefined : metric => changeTask(a.id, metric, "PATCH", true)}
        workspace={readOnly ? undefined : <InterviewWorkspace userId={userId} action={a} busy={busy} onConfigure={target => changeTask(a.id, { recordingMode: "interview", metricTarget: target }, "PATCH", true)} onChanged={onChanged} onInsights={() => setInsights({ id: a.id, title: a.title })} />}
        onDependencyChange={readOnly ? undefined : (dependencyThresholds, revision) => changeTask(a.id, { dependencyThresholds, revision: revision ?? initialPlan?.revision }, "PATCH", true)}
        onEdit={readOnly ? undefined : () => setEditing(a)}
        onDelete={readOnly ? undefined : () => { if (window.confirm(locale === "zh-tw" ? `刪除任務「${a.title}」？` : `Delete task “${a.title}”?`)) void changeTask(a.id, {}, "DELETE"); }} />
    </div>;
  }
  useEffect(() => {
    function revealTask() {
      if (!window.location.hash.startsWith("#action-")) return;
      const element = document.getElementById(window.location.hash.slice(1));
      if (!element) return;
      let parent = element.parentElement;
      while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
      element.querySelector<HTMLDetailsElement>("details")?.setAttribute("open", "");
      element.scrollIntoView({ block: "center" }); element.focus({ preventScroll: true });
    }
    revealTask(); window.addEventListener("hashchange", revealTask);
    return () => window.removeEventListener("hashchange", revealTask);
  }, [initialPlan?.id]);
  function milestoneCard(m: MilestoneView, readOnly = false) {
    const isCurrent = m.id === current?.id && !readOnly;
    return <details key={m.id} open={isCurrent || (!readOnly && (search.length > 0 || filter !== "all") && initialPlan?.actions.some(a => a.milestoneId === m.id && matches(a)))} className="min-w-0 rounded-xl border border-dark/15 p-3 sm:p-4">
      <summary className="cursor-pointer break-words [overflow-wrap:anywhere] text-sm font-semibold"><span>{m.position + 1}. {m.title}</span><span className="ml-3 text-xs text-dark/60">{t(`status.${m.status}`)} · {m.targetDate}</span></summary>
      <p className="mt-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">{m.expectedOutcome}</p><p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm text-dark/60">{t("criteria")}: {m.acceptanceCriteria}</p>
      <div className="mt-3 space-y-3">{(readOnly ? historical : initialPlan)?.actions.filter(a => a.milestoneId === m.id && (readOnly || matches(a))).map(a => taskRow(a, readOnly))}</div>
      {m.outcomeNote && <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">{t("actualResult")}: {m.outcomeNote}</p>}
      {!readOnly && m.status === "awaiting" && <form onSubmit={e => { e.preventDefault(); void outcome(m, true); }} className="mt-4 space-y-3"><label className="block text-sm">{t("actualResult")}<textarea aria-label={t("actualResult")} required maxLength={4000} rows={3} className={`${input} mt-1`} value={note} onChange={e => storeNote(e.target.value)} /></label><button className={button} disabled={busy || !note.trim()}>{t("confirmOutcome")}</button><p className="text-xs text-dark/60">{t("notAchievedHint")}</p></form>}
      {!readOnly && m.status === "unplanned" && <button type="button" className={`${button} mt-4`} disabled={busy} onClick={() => void open()}>{t("nextStage")}</button>}
      {!readOnly && m.achievedAt && <button type="button" className={`${button} mt-4`} disabled={busy} onClick={() => void outcome(m, false)}>{t("undoOutcome")}</button>}
    </details>;
  }
  function updateCorrection(next: StageCorrection) { setCorrection(next); try { localStorage.setItem(cacheKey, JSON.stringify({ goal, deadline, draft: form, correction: next })); } catch { setNotice(t("storageError")); } }
  const disabled = busy || Boolean(view?.pending) || !view;
  return <section id="goal-roadmap" className="min-w-0 rounded-2xl border border-dark/15 bg-white p-4 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{locale === "zh-tw" ? "現在開始的下一步" : "Your next step"}</h2><button ref={planTrigger} type="button" className={button} onClick={() => void open()}>+ {t("title")}</button></div>
    {initialPlan && <div id="action-plan-list" tabIndex={-1} className="mt-5 scroll-mt-6">
      <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer font-semibold">{locale === "zh-tw" ? "搜尋與篩選" : "Search and filter"}</summary><div className="mt-2 flex flex-wrap gap-2">
        <input aria-label={locale === "zh-tw" ? "搜尋任務" : "Search tasks"} placeholder={locale === "zh-tw" ? "搜尋任務" : "Search tasks"} value={search} onChange={e => setSearch(e.target.value)} className={`${input} min-h-11 sm:w-auto`} />
        <select aria-label={locale === "zh-tw" ? "任務狀態" : "Task status"} value={filter} onChange={e => setFilter(e.target.value)} className={`${input} min-h-11 sm:w-auto`}>{["all", "ready", "blocked", "done"].map((value, i) => <option key={value} value={value}>{(locale === "zh-tw" ? ["全部", "可執行", "受阻擋", "已完成"] : ["All", "Ready", "Blocked", "Done"])[i]}</option>)}</select>
      </div></details>
      {!initialPlan.actions.some(matches) && <p className="mt-3 text-sm text-dark/60">{locale === "zh-tw" ? "沒有符合條件的任務。" : "No matching tasks."}</p>}
      {!initialPlan.roadmap && <div className="mt-3 space-y-3">{initialPlan.actions.filter(matches).map(a => taskRow(a))}</div>}
    </div>}
    {initialPlan?.roadmap && <div className="mt-5 space-y-3"><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-bold">{initialPlan.roadmap.goal}</p><p className="text-sm text-dark/60">{initialPlan.roadmap.startsAt} → {initialPlan.roadmap.deadline}</p>{initialPlan.roadmap.assumptions.length > 0 && <details className="text-sm"><summary className="cursor-pointer">{t("assumptions")}</summary><ul className="mt-2 list-inside list-disc space-y-1 text-dark/60">{initialPlan.roadmap.assumptions.map((a, i) => <li key={i} className="break-words [overflow-wrap:anywhere]">{a}</li>)}</ul></details>}{initialPlan.roadmap.milestones.map(m => milestoneCard(m))}</div>}
    {initialPlan?.roadmap && initialPlan.actions.some(a => !a.milestoneId) && <div className="mt-4 space-y-3">{initialPlan.actions.filter(a => !a.milestoneId && matches(a)).map(a => taskRow(a))}</div>}
    {initialPlan && <button type="button" className={`${button} mt-4`} disabled={busy} onClick={() => setEditing("new")}>{locale === "zh-tw" ? "新增任務" : "Add task"}</button>}
    <button type="button" className={`${button} mt-4 ml-2`} onClick={() => void open()}>{t("history")}</button>
    {insights && <InterviewInsights actionId={insights.id} title={insights.title} onClose={() => setInsights(null)} />}
    {editing && initialPlan && <ActionEditor key={editing === "new" ? "new" : editing.id} action={editing === "new" ? null : editing} plan={initialPlan} onClose={() => setEditing(null)} onSaved={next => { onChanged(next); router.refresh(); setEditing(null); setError(""); }} />}
    {error && !opened && <div role="alert" className="mt-3 space-y-3 text-sm text-red-700"><p className="whitespace-pre-wrap">{error}</p><button type="button" className={button} disabled={busy} onClick={() => { setError(""); void reload(true); }}>{t("reload")}</button></div>}
    {mounted && createPortal(<dialog ref={dialog} aria-labelledby="roadmap-title" onClose={() => { setOpened(false); (trigger.current?.isConnected ? trigger.current : planTrigger.current)?.focus(); }} className="nova-theme fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-[920px] overflow-y-auto rounded-l-2xl border-0 bg-white p-0 text-dark shadow-2xl backdrop:bg-black/35">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-dark/10 bg-white p-5"><h2 id="roadmap-title" className="text-xl font-bold">✧ POLARIS · {t("title")}</h2><button type="button" className={button} onClick={() => dialog.current?.close()}>{t("close")}</button></header>
      <div className="space-y-5 p-5 sm:p-8">
        <p className="text-sm text-dark/60">{t("previewHint")}</p>
        <label className="block text-sm font-semibold">{t("goal")}<textarea aria-label={t("goal")} rows={3} maxLength={2000} value={goal} disabled={disabled} onChange={e => { setGoal(e.target.value); store(e.target.value); }} className={`${input} mt-1`} /></label>
        <label className="block text-sm font-semibold">{t("deadline")}<input aria-label={t("deadline")} type="date" value={deadline} disabled={disabled} onChange={e => { setDeadline(e.target.value); store(goal, e.target.value); }} className={`${input} mt-1`} /></label><p className="text-xs text-dark/60">{t("deadlineHint")}</p>
        <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={disabled || goal.trim().length < 3} onClick={() => void mutate("generate")}>{form ? t("regenerate") : t("generate")}</button>{current && ["active", "awaiting"].includes(current.status) && initialPlan?.actions.some(a => a.milestoneId === current.id && !a.done) && <button type="button" className={button} disabled={disabled} onClick={() => void mutate("review")}>{locale === "zh-tw" ? "檢查階段任務" : "Review stage tasks"}</button>}</div>
        {current?.status === "unplanned" && <button type="button" className={button} disabled={disabled} onClick={() => void mutate("next")}>{t("nextStage")}</button>}
        {(busy || view?.pending) && <p role="status" className="text-sm text-dark/60">{t("generating")}</p>}
        {form && <section className="space-y-4 rounded-2xl border border-sky-300 p-4">
          <h3 className="font-bold">{t("draftTitle")} · {t("proposed")}</h3><label className="block text-sm">{t("goal")}<textarea aria-label={t("draftGoal")} rows={2} className={`${input} mt-1`} maxLength={2000} disabled={disabled || form.mode === "next"} value={form.goal} onChange={e => updateDraft({ ...form, goal: e.target.value })} /></label>
          <label className="block text-sm">{t("deadline")}<input aria-label={t("draftDeadline")} className={`${input} mt-1`} type="date" disabled={disabled || form.mode === "next"} value={form.deadline} onChange={e => updateDraft({ ...form, deadline: e.target.value })} /></label>
          <p className="text-sm font-semibold">{t("assumptions")}</p>{form.assumptions.map((a, i) => <textarea key={i} aria-label={`${t("assumptions")} ${i + 1}`} rows={2} maxLength={1000} className={input} disabled={disabled || form.mode === "next"} value={a} onChange={e => updateDraft({ ...form, assumptions: form.assumptions.map((s, j) => i === j ? e.target.value : s) })} />)}
          {form.milestones.map((m, i) => <fieldset key={i} disabled={disabled || form.mode === "next"} className="space-y-3 rounded-xl border border-dark/10 p-4"><legend className="px-1 text-sm font-semibold">{t("milestoneNumber", { number: i + 1 })}</legend>{(["title", "expectedOutcome", "acceptanceCriteria", "targetDate"] as const).map(key => <label key={key} className="block text-sm">{t(`fields.${key}`)}<input aria-label={`${t("milestoneNumber", { number: i + 1 })} ${t(`fields.${key}`)}`} type={key === "targetDate" ? "date" : "text"} maxLength={key === "title" ? 200 : 1000} className={`${input} mt-1`} value={m[key]} onChange={e => updateDraft({ ...form, milestones: form.milestones.map((v, j) => i === j ? { ...v, [key]: e.target.value } : v) })} /></label>)}</fieldset>)}
          <h4 className="font-semibold">{locale === "zh-tw" ? "下一階段任務" : "Next-stage tasks"}</h4>{form.actions.map((a, i) => <fieldset key={a.clientKey} disabled={disabled} className="space-y-3 rounded-xl border border-dark/10 p-4"><legend className="text-sm font-semibold">#{i + 1}</legend>{(["title", "expectedOutcome"] as const).map(key => <label key={key} className="block text-sm">{t(`fields.${key}`)}<textarea aria-label={`${t("taskNumber", { number: i + 1 })} ${t(`fields.${key}`)}`} rows={2} maxLength={key === "title" ? 200 : 1000} className={`${input} mt-1`} value={a[key]} onChange={e => updateDraft({ ...form, actions: form.actions.map((v, j) => i === j ? { ...v, [key]: e.target.value } : v) })} /></label>)}<p className="text-xs text-dark/60">{t("fields.targetDate")}: {a.outcomeTime.min}–{a.outcomeTime.max} {locale === "zh-tw" ? "天" : "days"}</p><p className="text-xs text-dark/60">{locale === "zh-tw" ? "為何現在做" : "Why now"}: {a.bottleneckFit.reason}</p><p className="text-xs text-dark/60">{t("prerequisites")}: {a.dependsOnKeys.length ? a.dependsOnKeys.map(key => { const prior = form.actions.find(row => row.clientKey === key); return prior ? taskReference(prior) : key; }).join(", ") : t("none")}</p></fieldset>)}
          <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={disabled} onClick={() => void mutate("edit")}>{t("saveDraft")}</button><button type="button" className={`${button} bg-black! text-white!`} disabled={disabled} onClick={() => void mutate("activate")}>{t(form.mode === "next" ? "append" : "activate")}</button></div><p className="text-xs text-dark/60">{t("archiveHint")}</p>
        </section>}
        {correction && <section className="space-y-4 rounded-2xl border border-amber-300 p-4"><h3 className="font-bold">{locale === "zh-tw" ? "階段修正草稿，確認後才更新原任務" : "Stage correction draft; tasks change only after confirmation"}</h3>{!correction.changes.length && <p>{locale === "zh-tw" ? "沒有建議修正。" : "No changes suggested."}</p>}{correction.changes.map((c, i) => { const original = initialPlan?.actions.find(a => a.id === c.actionId); return <fieldset key={c.actionId} disabled={disabled} className="space-y-3 rounded-xl border border-dark/15 p-4"><legend className="font-semibold">#{original?.displayNumber}</legend><p className="whitespace-pre-wrap text-sm">{locale === "zh-tw" ? "原任務" : "Before"}: {original?.title}
{original?.expectedOutcome.text}</p><p className="whitespace-pre-wrap text-sm text-amber-900">{c.reason}</p>{(["title", "expectedOutcome", "whyNow"] as const).map(key => <label key={key} className="block text-sm">{key === "whyNow" ? (locale === "zh-tw" ? "為何現在做" : "Why now") : t(`fields.${key}`)}<textarea className={`${input} mt-1`} rows={2} maxLength={key === "title" ? 200 : key === "whyNow" ? 600 : 1000} value={c[key]} onChange={e => updateCorrection({ ...correction, changes: correction.changes.map((v, j) => i === j ? { ...v, [key]: e.target.value } : v) })} /></label>)}<p className="text-sm font-bold">{t("prerequisites")}</p>{initialPlan?.actions.filter(a => a.id !== c.actionId && (a.milestonePosition ?? -1) <= (current?.position ?? -1)).map(a => <label key={a.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={c.dependencyActionIds.includes(a.id)} onChange={e => updateCorrection({ ...correction, changes: correction.changes.map((v, j) => i === j ? { ...v, dependencyActionIds: e.target.checked ? [...v.dependencyActionIds, a.id] : v.dependencyActionIds.filter(id => id !== a.id) } : v) })} />{taskReference(a)}</label>)}</fieldset>; })}<div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={disabled} onClick={() => void mutate("editCorrection")}>{t("saveDraft")}</button><button type="button" className={`${button} bg-black! text-white!`} disabled={disabled || !correction.changes.length} onClick={() => void mutate("correct")}>{locale === "zh-tw" ? "確認修正未完成任務" : "Confirm corrections to unfinished tasks"}</button></div></section>}
        {(error || view?.error) && <div role="alert" className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{error || view?.error}</p><button type="button" className={button} disabled={busy} onClick={() => { setError(""); void reload(true); }}>{t("reload")}</button></div>}
        {notice && <p role="status" className="rounded-xl bg-dark/[0.04] p-3 text-sm">{notice}</p>}
        {view && view.history.length > 0 && <section><h3 className="font-bold">{t("history")}</h3><ul className="mt-3 space-y-2">{view.history.map(p => <li key={p.id}><button type="button" className={button} onClick={() => { void request("GET", undefined, `/api/action-plans/roadmap?planId=${encodeURIComponent(p.id)}`).then(data => setHistorical(data.plan)).catch(cause => setError(cause.message)); }}>{p.goal || t("oldPlan")} · {p.createdAt.slice(0, 10)}</button></li>)}</ul></section>}
        {historical && <section className="space-y-3 rounded-xl border border-dark/10 p-4"><h3 className="font-bold">{t("readOnly")}</h3>{historical.roadmap?.milestones.map(m => milestoneCard(m, true))}<ul className="list-inside list-disc space-y-2 text-sm">{historical.actions.filter(a => !historical.roadmap || !a.milestoneId).map(a => <li key={a.id} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{a.done ? "✓ " : "○ "}{a.title} — {a.expectedOutcome.text}</li>)}</ul></section>}
      </div>
    </dialog>, document.body)}
  </section>;
}
