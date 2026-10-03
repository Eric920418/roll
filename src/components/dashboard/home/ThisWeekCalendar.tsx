"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useDashboardUser } from "../DashboardUserProvider";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { addCalendarDays, calendarWeek, type CalendarEntry, type CalendarTask, type WeekMutation, type WeekPlan } from "@/lib/week-plan/schema";

type Panel = { kind: "day"; date: string } | { kind: "plan" } | { kind: "schedule"; taskId: string };
type Draft = { id?: string; revision?: number; requestId: string; date: string; title: string; note: string; done: boolean };
const outline = "min-h-11 rounded-xl border border-current/20 px-4 py-2 text-sm font-semibold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2";
const field = "mt-1 min-h-11 w-full rounded-xl border border-dark/20 bg-white px-3 py-2 text-sm text-dark focus-visible:outline-2";
async function readResponse<T>(res: Response): Promise<T> {
  let body: { data: T; error?: string; code?: string };
  try { body = await res.json(); } catch { throw new Error(`HTTP ${res.status} ${res.statusText}`); }
  if (!res.ok) throw new Error(`${body.error || `HTTP ${res.status}`}${body.code ? ` (${body.code})` : ""}`);
  return body.data;
}
const dragMedia = "(min-width: 768px) and (hover: hover) and (pointer: fine)";
function subscribeDrag(callback: () => void) { const media = window.matchMedia(dragMedia); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); }
function canDrag() { return window.matchMedia(dragMedia).matches; }
function newDraft(date: string): Draft { return { requestId: crypto.randomUUID(), date, title: "", note: "", done: false }; }

export default function ThisWeekCalendar() {
  const t = useTranslations("Dashboard.weekCalendar"), locale = useLocale() as Locale, userId = useDashboardUser();
  const [data, setData] = useState<WeekPlan | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [week, setWeek] = useState(""), [panel, setPanel] = useState<Panel | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const [chosenDate, setChosenDate] = useState(""), [dragging, setDragging] = useState<string | null>(null), [over, setOver] = useState<string | null>(null), [notice, setNotice] = useState("");
  const desktopDrag = useSyncExternalStore(subscribeDrag, canDrag, () => false);
  const [mutationError, setMutationError] = useState("");
  const displayedError = mutationError || error;
  const pointerDrag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null), suppressClick = useRef(false);
  const request = useRef(0), mutation = useRef(false), dialog = useRef<HTMLDialogElement>(null), dataRef = useRef<WeekPlan | null>(null);
  const reload = useCallback(async () => {
    const current = ++request.current;
    try {
      const next = await readResponse<WeekPlan>(await fetch(`/api/week-plan${week ? `?weekStart=${week}` : ""}`, { cache: "no-store" }));
      if (current === request.current) { dataRef.current = next; setData(next); setError(""); }
      return next;
    } catch (cause) { if (current === request.current) setError(cause instanceof Error ? cause.message : String(cause)); return null; }
  }, [week]);
  const invalidate = useCallback(() => { request.current++; }, []);
  useEffect(() => {
    void reload();
    const calendar = userId && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`nova-week:${userId}`) : null;
    const plans = userId && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`nova-plan:${userId}`) : null;
    if (calendar) calendar.onmessage = () => void reload(); if (plans) plans.onmessage = () => void reload();
    const refresh = () => void reload(), timer = setInterval(() => { if (document.visibilityState === "visible" && dataRef.current?.today !== calendarWeek().today) refresh(); }, 60000);
    window.addEventListener("focus", refresh); window.addEventListener("nova-plan-changed", refresh);
    return () => { invalidate(); clearInterval(timer); calendar?.close(); plans?.close(); window.removeEventListener("focus", refresh); window.removeEventListener("nova-plan-changed", refresh); };
  }, [reload, userId, invalidate]);
  useEffect(() => { if (panel && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [panel]);
  const dateLabel = (date: string, full = false) => new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en", { timeZone: "UTC", month: "short", day: "numeric", ...(full ? { weekday: "long" } : {}) }).format(new Date(`${date}T00:00:00Z`));
  function openDay(date: string) { setDraft(newDraft(date)); setPanel({ kind: "day", date }); setNotice(""); }
  function openTask(task: CalendarTask) {
    if (task.dependency.blocked || !data) return;
    setChosenDate(task.scheduled?.date || (data.today >= data.weekStart && data.today <= addCalendarDays(data.weekStart, 6) ? data.today : data.weekStart));
    setPanel({ kind: "schedule", taskId: task.id }); setNotice("");
  }
  function waiting(task: CalendarTask) {
    const refs = task.dependency.actionRefs.filter(ref => !ref.done).map(ref => `#${ref.displayNumber ?? ref.clientKey}`);
    return refs.length ? t("waiting", { tasks: refs.join(", ") }) : task.dependency.milestoneTitle ? t("milestone", { title: task.dependency.milestoneTitle }) : t("missingLink");
  }
  async function write(input: WeekMutation) {
    if (mutation.current) return false;
    mutation.current = true; request.current++; setBusy(true); setMutationError("");
    try {
      await readResponse<{ id: string }>(await fetch("/api/week-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
      setNotice(t("saved"));
      if (userId && typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel(`nova-week:${userId}`); channel.postMessage("changed"); channel.close(); }
      await reload(); return true;
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : String(cause)); return false; }
    finally { mutation.current = false; setBusy(false); }
  }
  async function schedule(task: CalendarTask, date: string) {
    const current = dataRef.current; if (!current?.planId || current.planRevision == null || task.dependency.blocked) return;
    if (await write({ operation: "schedule", requestId: crypto.randomUUID(), actionId: task.id, planId: current.planId, planRevision: current.planRevision, entryRevision: task.scheduled?.revision ?? null, date })) {
      if (panel?.kind === "schedule") dialog.current?.close();
    }
  }
  async function savePersonal(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    const input: WeekMutation = draft.id ? { operation: "edit", id: draft.id, revision: draft.revision!, date: draft.date, title: draft.title, note: draft.note, done: draft.done }
      : { operation: "add", requestId: draft.requestId, date: draft.date, title: draft.title, note: draft.note };
    if (await write(input)) { setPanel({ kind: "day", date: draft.date }); setDraft(newDraft(draft.date)); }
  }
  function edit(entry: CalendarEntry) { setDraft({ ...entry, requestId: crypto.randomUUID() }); setNotice(""); }
  async function reviewLatest() {
    const next = await reload(); if (next) setMutationError("");
    if (next && draft?.id) { const latest = next.entries.find(entry => entry.id === draft.id); if (latest) { setDraft({ ...draft, revision: latest.revision }); setNotice(t("review")); } }
  }
  function taskPill(task: CalendarTask, compact = false) {
    const locked = task.dependency.blocked;
    return <button key={task.id} type="button" disabled={busy} aria-disabled={locked || undefined}
      draggable={false}
      onPointerDown={event => { if (!desktopDrag || locked || busy || event.button !== 0 || event.pointerType !== "mouse") return; suppressClick.current = false; pointerDrag.current = { id: task.id, x: event.clientX, y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const drag = pointerDrag.current; if (!drag || drag.id !== task.id) return; if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6 && !drag.moved) return; drag.moved = true; setDragging(task.id); const day = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("#this-week [data-calendar-date]"); setOver(day?.dataset.calendarDate || null); }}
      onPointerUp={event => { const drag = pointerDrag.current; if (!drag || drag.id !== task.id) return; pointerDrag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDragging(null); setOver(null); if (!drag.moved) return; suppressClick.current = true; const date = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("#this-week [data-calendar-date]")?.dataset.calendarDate; if (date) void schedule(task, date); }}
      onPointerCancel={() => { pointerDrag.current = null; setDragging(null); setOver(null); }}
      onClick={event => { if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; } suppressClick.current = false; if (locked) { setNotice(waiting(task)); return; } openTask(task); }}
      className={`group select-none flex min-h-14 min-w-0 items-center gap-3 rounded-full border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 ${locked ? "border-white/25 bg-transparent text-white/65" : "border-white bg-white text-dark hover:bg-white/90 cursor-grab active:cursor-grabbing"} ${dragging === task.id ? "opacity-70" : ""} ${compact ? "w-full" : ""}`}>
      <span className={`flex h-8 min-w-8 items-center justify-center rounded-full text-xs font-bold ${locked ? "bg-white/10" : "bg-dark text-white"}`}>#{task.displayNumber}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold" title={task.title}>{task.title}</span><span className="mt-0.5 block truncate text-xs">{locked ? waiting(task) : task.scheduled?.date ? t("scheduled", { date: dateLabel(task.scheduled.date) }) : t("ready")}</span></span>
      {!locked && task.metric?.target != null && <span className="shrink-0 text-sm font-bold tabular-nums" title={task.metric.unit || undefined}>{task.metric.current ?? "—"}/{task.metric.target}</span>}
      {!locked && task.metric?.target == null && <span aria-hidden="true" className="text-lg">↗</span>}
    </button>;
  }
  const days = data ? Array.from({ length: 7 }, (_, i) => addCalendarDays(data.weekStart, i)) : [];
  const dayEntries = panel?.kind === "day" ? data?.entries.filter(entry => entry.date === panel.date) || [] : [];
  const selectedTask = panel?.kind === "schedule" ? data?.tasks.find(task => task.id === panel.taskId) : null;
  const agenda = pathForLocale("/dashboard/agenda", locale);
  return <section id="this-week" aria-labelledby="this-week-title" className="min-w-0 rounded-3xl bg-[#111111] p-4 text-white sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/50">{t("eyebrow")}</p><h2 id="this-week-title" className="mt-1 text-2xl font-bold tracking-tight font-[family-name:var(--font-heading)]">{t("title")}</h2></div>
      <button className={`${outline} border-white/30 bg-white/5 hover:bg-white/10`} disabled={!data || busy} onClick={() => { setPanel({ kind: "plan" }); setNotice(""); }}>{t("planWeek")} <span aria-hidden="true">↗</span></button></div>
    <div className="mt-4 flex items-center justify-between gap-2 text-xs text-white/60"><span>{data ? `${dateLabel(data.weekStart)} – ${dateLabel(addCalendarDays(data.weekStart, 6))}` : t("loading")} · {t("timezone")}</span>
      <div className="flex items-center gap-1"><button className="min-h-11 min-w-11 rounded-lg hover:bg-white/10" aria-label={t("previous")} disabled={!data || busy} onClick={() => setWeek(addCalendarDays(data!.weekStart, -7))}>←</button>{week && <button className="min-h-11 rounded-lg px-2 underline underline-offset-4" disabled={busy} onClick={() => setWeek("")}>{t("today")}</button>}<button className="min-h-11 min-w-11 rounded-lg hover:bg-white/10" aria-label={t("next")} disabled={!data || busy} onClick={() => setWeek(addCalendarDays(data!.weekStart, 7))}>→</button></div></div>
    {!data && !displayedError && <div className="mt-3 grid grid-cols-7 gap-1" aria-busy="true">{Array.from({ length: 7 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/5" />)}</div>}
    <div className="mt-2 overflow-x-auto"><div className="grid min-w-[308px] grid-cols-7 gap-0 sm:gap-2">{days.map((date, i) => {
      const entries = data!.entries.filter(entry => entry.date === date), isToday = date === data!.today;
      return <button key={date} type="button" data-calendar-date={date} disabled={busy} aria-current={isToday ? "date" : undefined} aria-label={t("dayLabel", { date: dateLabel(date, true), count: entries.length })}
        onClick={() => openDay(date)}
        className={`relative flex min-h-28 min-w-0 flex-col items-center rounded-2xl border px-0.5 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-h-32 sm:px-2 ${isToday ? "border-white bg-white/10" : "border-transparent bg-white/[0.035] hover:bg-white/10"} ${over === date ? "ring-2 ring-white bg-white/20" : ""}`}>
        <span className="text-[10px] font-semibold text-white/60 sm:text-xs">{t(`days.${i}`)}</span><span className="mt-2 text-lg font-semibold tabular-nums sm:text-2xl">{Number(date.slice(-2))}</span>
        {entries.length ? <span aria-hidden="true" className="mt-auto flex min-h-6 items-center justify-center gap-1">{entries.slice(0, 3).map(entry => <span key={entry.id} className={`h-1.5 w-1.5 rounded-full ${entry.done ? "border border-white/50" : entry.kind === "action" ? "bg-white" : "bg-white/50"}`} />)}{entries.length > 3 && <span className="text-[9px]">+{entries.length - 3}</span>}</span>
          : <span className="mt-auto pt-2 text-[10px] text-white/55 sm:text-xs">{t("addShort")}</span>}
      </button>;
    })}</div></div>
    <div className="mt-5 border-t border-white/10 pt-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-white/70">{t("taskHeading")}</p><p className="text-xs text-white/55">{t(desktopDrag ? "dragHint" : "tapHint")}</p></div>
      {data && data.tasks.length ? <div className="grid gap-2 lg:grid-cols-3">{data.tasks.slice(0, 3).map(task => taskPill(task))}</div> : data && <p className="text-sm text-white/55">{data.planId ? t("allDone") : t("noPlan")}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-white/50">{t("pointsHint")}</p></div>
    {notice && !panel && <p role="status" className="mt-3 text-sm text-white/80">{notice}</p>}
    {displayedError && !panel && <div role="alert" className="mt-3 rounded-xl border border-red-300/30 bg-red-950/30 p-3 text-sm text-red-200"><p className="whitespace-pre-wrap">{displayedError}</p><button className="mt-1 min-h-11 underline" onClick={() => void reviewLatest()}>{t("reload")}</button></div>}
    <dialog ref={dialog} onClose={() => { setPanel(null); setDraft(null); }} onCancel={event => { if (busy) event.preventDefault(); }} aria-labelledby="week-dialog-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl bg-white p-5 text-dark shadow-xl backdrop:bg-black/60 sm:p-7">
      {panel && <><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-dark/50">{t("title")} · {t("timezone")}</p><h3 id="week-dialog-title" className="mt-1 text-xl font-bold">{panel.kind === "day" ? dateLabel(panel.date, true) : panel.kind === "plan" ? t("planWeek") : t("chooseDate")}</h3></div><button autoFocus className="min-h-11 min-w-11 rounded-full hover:bg-dark/5" aria-label={t("close")} disabled={busy} onClick={() => dialog.current?.close()}>×</button></div>
        {displayedError && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><p className="whitespace-pre-wrap">{displayedError}</p><button disabled={busy} className="min-h-11 underline" onClick={() => void reviewLatest()}>{t("reload")}</button></div>}
        {notice && <p role="status" className="mt-3 text-sm text-green-800">{notice}</p>}
        {panel.kind === "schedule" && <div className="mt-5 space-y-4">{selectedTask ? <><p className="font-semibold">#{selectedTask.displayNumber} · {selectedTask.title}</p>{selectedTask.dependency.blocked ? <p className="text-sm text-amber-800">{waiting(selectedTask)}</p> : <><label className="block text-sm font-semibold">{t("date")}<input type="date" className={field} min="2000-01-01" max="2099-12-31" value={chosenDate} onChange={event => setChosenDate(event.target.value)} /></label><div className="grid grid-cols-7 gap-1">{days.map(date => <button key={date} className={`min-h-11 rounded-xl border text-sm ${chosenDate === date ? "border-dark bg-dark text-white" : "border-dark/10"}`} onClick={() => setChosenDate(date)}>{Number(date.slice(-2))}</button>)}</div><button className={`${outline} w-full bg-dark text-white`} disabled={busy || !chosenDate} onClick={() => void schedule(selectedTask, chosenDate)}>{busy ? t("saving") : t("schedule")}</button></>}</> : <p className="text-sm">{t("taskChanged")}</p>}</div>}
        {panel.kind === "plan" && <div className="mt-5 space-y-4"><p className="text-sm text-dark/60">{t("planHint")}</p><div className="grid grid-cols-7 gap-1">{days.map((date, i) => <button key={date} className="flex min-h-16 flex-col items-center justify-center rounded-xl border border-dark/15 text-xs hover:bg-dark/5" onClick={() => openDay(date)}><span>{t(`days.${i}`)}</span><span className="mt-1 text-lg font-bold">{Number(date.slice(-2))}</span></button>)}</div>
          {data?.tasks.length ? <div className="space-y-2 rounded-2xl bg-[#111111] p-3 text-white">{data.tasks.map(task => taskPill(task, true))}</div> : <p className="text-sm text-dark/60">{t("noPlan")}</p>}</div>}
        {panel.kind === "day" && <><ul className="mt-5 space-y-3">{dayEntries.map(entry => <li key={entry.id} className="rounded-2xl border border-dark/10 p-4"><p className={`break-words font-semibold ${entry.done ? "text-dark/50 line-through" : ""}`}>{entry.title}</p><p className="mt-1 text-xs text-dark/50">{entry.kind === "action" ? t("actionType") : t("personalType")}{entry.done ? ` · ${t("done")}` : ""}</p>{entry.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-dark/60">{entry.note}</p>}
          {entry.kind === "action" && !entry.available && <p className="mt-2 text-sm text-amber-800">{t("unavailable")}</p>}
          <div className="mt-2 flex flex-wrap gap-2">{entry.kind === "personal" ? <button className={outline} disabled={busy} onClick={() => edit(entry)}>{t("edit")}</button> : entry.available && entry.actionId ? <Link className={`${outline} inline-flex items-center`} href={`${agenda}#action-${entry.actionId}`}>{t("openTask")} ↗</Link> : null}<button className={`${outline} text-dark/60`} disabled={busy} onClick={() => void write({ operation: "remove", id: entry.id, revision: entry.revision })}>{t("remove")}</button></div></li>)}</ul>
          {!dayEntries.length && <p className="mt-4 text-sm text-dark/55">{t("emptyDay")}</p>}
          {draft && <form onSubmit={savePersonal} className="mt-5 space-y-4 border-t border-dark/10 pt-5"><div className="flex items-center justify-between"><h4 className="font-bold">{draft.id ? t("edit") : t("add")}</h4>{draft.id && <button type="button" className="min-h-11 px-2 text-sm underline" disabled={busy} onClick={() => setDraft(newDraft(panel.date))}>{t("cancelEdit")}</button>}</div>
            <label className="block text-sm font-semibold">{t("itemTitle")}<input autoComplete="off" required maxLength={200} className={field} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
            <label className="block text-sm font-semibold">{t("note")}<textarea rows={3} maxLength={2000} className={field} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
            {draft.id && <><label className="block text-sm font-semibold">{t("date")}<input required type="date" min="2000-01-01" max="2099-12-31" className={field} value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={draft.done} onChange={event => setDraft({ ...draft, done: event.target.checked })} className="h-5 w-5 accent-dark" />{t("markDone")}</label></>}
            <button type="submit" className={`${outline} w-full bg-dark text-white`} disabled={busy || !draft.title.trim()}>{busy ? t("saving") : draft.id ? t("save") : t("add")}</button></form>}
        </>}
      </>}
    </dialog>
  </section>;
}
