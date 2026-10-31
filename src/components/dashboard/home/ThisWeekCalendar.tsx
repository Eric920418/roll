"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useDashboardUser } from "../DashboardUserProvider";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { addCalendarDays, calendarWeek, calendarTime, durationTimes, savedDuration, interviewEnded, weekMutationSchema, type CalendarEntry, type CalendarTask, type WeekMutation, type WeekPlan } from "@/lib/week-plan/schema";

import { calendarIcs, googleCalendarUrl } from "@/lib/week-plan/export";

type Panel = { kind: "day"; date: string } | { kind: "plan" } | { kind: "schedule"; taskId: string } | { kind: "export" };
type Draft = { id?: string; revision?: number; requestId: string; date: string; title: string; note: string; done: boolean; startTime: string; duration: number; alertEmail: boolean };
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
function newDraft(date: string): Draft { return { requestId: crypto.randomUUID(), date, title: "", note: "", done: false, startTime: "", duration: 60, alertEmail: false }; }

export default function ThisWeekCalendar() {
  const t = useTranslations("Dashboard.weekCalendar"), locale = useLocale() as Locale, userId = useDashboardUser();
  const [data, setData] = useState<WeekPlan | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [week, setWeek] = useState(""), [panel, setPanel] = useState<Panel | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const [chosenDate, setChosenDate] = useState(""), [dragging, setDragging] = useState<string | null>(null), [over, setOver] = useState<string | null>(null), [notice, setNotice] = useState("");
  const [selectedDate, setSelectedDate] = useState(""), [now, setNow] = useState<number | null>(null);
  const [startTime, setStartTime] = useState(""), [duration, setDuration] = useState(60), [alertEmail, setAlertEmail] = useState(false);
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
    const clock = setTimeout(() => setNow(Date.now()), 0);
    const calendar = userId && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`nova-week:${userId}`) : null;
    const plans = userId && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`nova-plan:${userId}`) : null;
    if (calendar) calendar.onmessage = () => void reload(); if (plans) plans.onmessage = () => void reload();
    const refresh = () => void reload(), timer = setInterval(() => { setNow(Date.now()); if (document.visibilityState === "visible" && dataRef.current?.today !== calendarWeek().today) refresh(); }, 60000);
    window.addEventListener("focus", refresh); window.addEventListener("nova-plan-changed", refresh);
    return () => { invalidate(); clearTimeout(clock); clearInterval(timer); calendar?.close(); plans?.close(); window.removeEventListener("focus", refresh); window.removeEventListener("nova-plan-changed", refresh); };
  }, [reload, userId, invalidate]);
  useEffect(() => {
    const scheduleFromCard = async (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const fresh = await reload();
      const task = fresh?.tasks.find(item => item.id === id);
      if (!fresh || !task || task.dependency.blocked) { setMutationError(t("taskChanged")); return; }
      setNotice(""); setMutationError(""); setChosenDate(task.scheduled?.date || fresh.today); setStartTime(calendarTime(task.scheduled?.startsAt ?? null)); setDuration(savedDuration(task.scheduled)); setAlertEmail(task.scheduled?.alertEmail ?? false); setPanel({ kind: "schedule", taskId: id });
    };
    window.addEventListener("nova-schedule-task", scheduleFromCard);
    return () => window.removeEventListener("nova-schedule-task", scheduleFromCard);
  }, [reload, t]);
  useEffect(() => { if (panel && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [panel]);
  const dateLabel = (date: string, full = false) => new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en", { timeZone: "UTC", month: "short", day: "numeric", ...(full ? { weekday: "long" } : {}) }).format(new Date(`${date}T00:00:00Z`));
  function openDay(date: string) { setDraft(newDraft(date)); setPanel({ kind: "day", date }); setNotice(""); setMutationError(""); }
  function openTask(task: CalendarTask) {
    if (task.dependency.blocked || !data) return;
    setChosenDate(task.scheduled?.date || (data.today >= data.weekStart && data.today <= addCalendarDays(data.weekStart, 6) ? data.today : data.weekStart));
    setStartTime(calendarTime(task.scheduled?.startsAt ?? null)); setDuration(savedDuration(task.scheduled)); setAlertEmail(task.scheduled?.alertEmail ?? false);
    setPanel({ kind: "schedule", taskId: task.id }); setNotice(""); setMutationError("");
  }
  function waiting(task: CalendarTask) {
    const refs = task.dependency.actionRefs.filter(ref => !(ref.resolved ?? ref.done)).map(ref => `#${ref.displayNumber ?? ref.clientKey}`);
    return refs.length ? t("waiting", { tasks: refs.join(", ") }) : task.dependency.milestoneTitle ? t("milestone", { title: task.dependency.milestoneTitle }) : t("missingLink");
  }
  async function write(input: WeekMutation) {
    if (mutation.current) return false;
    const validated = weekMutationSchema.safeParse(input);
    if (!validated.success) { setMutationError(validated.error.issues.map(issue => issue.message).join("\n")); return false; }
    mutation.current = true; request.current++; setBusy(true); setMutationError(""); setNotice("");
    try {
      await readResponse<{ id: string }>(await fetch("/api/week-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validated.data) }));
      setNotice(t("saved"));
      if (userId && typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel(`nova-week:${userId}`); channel.postMessage("changed"); channel.close(); }
      await reload(); return true;
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : String(cause)); return false; }
    finally { mutation.current = false; setBusy(false); }
  }
  async function schedule(task: CalendarTask, date: string, times?: ReturnType<typeof durationTimes> & { durationMinutes?: number | null; alertEmail?: boolean; locale?: "en" | "zh-tw" }) {
    const current = dataRef.current; if (!current?.planId || current.planRevision == null || task.dependency.blocked) return;
    if (await write({ operation: "schedule", requestId: crypto.randomUUID(), actionId: task.id, planId: current.planId, planRevision: current.planRevision, entryRevision: task.scheduled?.revision ?? null, date, ...times })) {
      if (panel?.kind === "schedule") dialog.current?.close();
    }
  }
  async function savePersonal(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    const input: WeekMutation = draft.id ? { operation: "edit", id: draft.id, revision: draft.revision!, date: draft.date, title: draft.title, note: draft.note, done: draft.done, ...durationTimes(draft.date, draft.startTime, draft.duration), durationMinutes: Number.isInteger(draft.duration) ? draft.duration : null, alertEmail: draft.alertEmail, locale }
      : { operation: "add", requestId: draft.requestId, date: draft.date, title: draft.title, note: draft.note, ...durationTimes(draft.date, draft.startTime, draft.duration), durationMinutes: Number.isInteger(draft.duration) ? draft.duration : null, alertEmail: draft.alertEmail, locale };
    if (await write(input)) { setPanel({ kind: "day", date: draft.date }); setDraft(newDraft(draft.date)); }
  }
  function edit(entry: CalendarEntry) { setDraft({ ...entry, startTime: calendarTime(entry.startsAt), duration: savedDuration(entry), alertEmail: entry.alert.enabled, requestId: crypto.randomUUID() }); setNotice(""); }
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
  function durationLabel(minutes: number) { return minutes === 30 ? t("halfHour") : t("durationHours", { hours: new Intl.NumberFormat(locale).format(minutes / 60) }); }
  function durationOptions(value: number) { const options = Array.from({ length: 48 }, (_, i) => (i + 1) * 30); if (!options.includes(value)) options.unshift(value); return options.map(minutes => <option key={minutes} value={minutes}>{durationLabel(minutes)}</option>); }
  function alertControl(checked: boolean, change: (value: boolean) => void) { return <div><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-dark" checked={checked} disabled={busy || (!data?.emailAlertsAvailable && !checked)} onChange={event => change(event.target.checked)} />{t("alertEmail")}</label><p className="text-xs text-dark/60">{data?.emailAlertsAvailable ? t("alertHint") : t("alertUnavailable")}</p></div>; }
  const days = data ? Array.from({ length: 7 }, (_, i) => addCalendarDays(data.weekStart, i)) : [];
  const dayEntries = panel?.kind === "day" ? data?.entries.filter(entry => entry.date === panel.date) || [] : [];
  const selectedTask = panel?.kind === "schedule" ? data?.tasks.find(task => task.id === panel.taskId) : null;
  const activeDate = days.includes(selectedDate) ? selectedDate : data && days.includes(data.today) ? data.today : data?.weekStart;
  const cards = data?.entries.filter(entry => entry.date === activeDate) ?? [];
  const exports = data?.entries.filter(entry => entry.available) ?? [];
  const progress = data?.interviewProgress;
  function logInterview(entry: CalendarEntry) { window.dispatchEvent(new CustomEvent("nova-home-interview", { detail: entry.actionId })); }
  function downloadCalendar() {
    try {
      const url = URL.createObjectURL(new Blob([calendarIcs(exports)], { type: "text/calendar;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `nova-${data!.weekStart}.ics`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : String(cause)); }
  }
  const agenda = pathForLocale("/dashboard/agenda", locale);
  return <section id="this-week" aria-labelledby="this-week-title" className="min-w-0 rounded-3xl bg-[#111111] p-4 text-white sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/50">{t("title")}</p><div className="mt-1 flex flex-wrap items-center gap-3"><h2 id="this-week-title" className="text-2xl font-bold tracking-tight sm:text-3xl">{activeDate ? dateLabel(activeDate, true) : t("loading")}</h2>{data && activeDate === data.today && <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-dark">{t("today")}</span>}</div></div>
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-white/60">{data && t("itemCount", { count: cards.length, done: cards.filter(entry => entry.done).length })}</span><button className={`${outline} border-white/30 bg-white/5 hover:bg-white/10`} disabled={!data || busy} onClick={() => { setPanel({ kind: "plan" }); setNotice(""); }}>{t("planWeek")} ↗</button></div></div>
    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-white/60"><span>{data ? `${dateLabel(data.weekStart)} – ${dateLabel(addCalendarDays(data.weekStart, 6))}` : t("loading")} · {t("timezone")}</span>
      <div className="flex items-center gap-1"><button className="min-h-11 min-w-11 rounded-lg hover:bg-white/10" aria-label={t("previous")} disabled={!data || busy} onClick={() => setWeek(addCalendarDays(data!.weekStart, -7))}>←</button>{week && <button className="min-h-11 rounded-lg px-2 underline underline-offset-4" disabled={busy} onClick={() => setWeek("")}>{t("today")}</button>}<button className="min-h-11 min-w-11 rounded-lg hover:bg-white/10" aria-label={t("next")} disabled={!data || busy} onClick={() => setWeek(addCalendarDays(data!.weekStart, 7))}>→</button></div></div>
    {!data && !displayedError && <div className="mt-3 grid grid-cols-7 gap-1" aria-busy="true">{Array.from({ length: 7 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/5" />)}</div>}
    <div className="mt-2 overflow-x-auto"><div className="grid min-w-[308px] grid-cols-7 gap-0 sm:gap-2">{days.map((date, i) => {
      const entries = data!.entries.filter(entry => entry.date === date), isToday = date === data!.today;
      return <button key={date} type="button" data-calendar-date={date} disabled={busy} aria-current={isToday ? "date" : undefined} aria-label={t("dayLabel", { date: dateLabel(date, true), count: entries.length })}
        aria-pressed={activeDate === date} onClick={() => { setSelectedDate(date); setNotice(""); if (!entries.length) openDay(date); }}
        className={`relative flex min-h-20 min-w-0 flex-col items-center rounded-2xl border px-0.5 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-h-20 sm:px-2 ${isToday ? "border-white bg-white/10" : "border-transparent bg-white/[0.035] hover:bg-white/10"} ${activeDate === date && !isToday ? "bg-white/10" : ""} ${over === date ? "ring-2 ring-white bg-white/20" : ""}`}>
        <span className="text-[10px] font-semibold text-white/60 sm:text-xs">{t(`days.${i}`)}</span><span className="mt-2 text-lg font-semibold tabular-nums sm:text-2xl">{Number(date.slice(-2))}</span>
        {entries.length ? <span aria-hidden="true" className="mt-auto flex min-h-6 items-center justify-center gap-1">{entries.slice(0, 3).map(entry => <span key={entry.id} className={`h-1.5 w-1.5 rounded-full ${entry.done ? "border border-white/50" : entry.kind === "action" ? "bg-white" : "bg-white/50"}`} />)}{entries.length > 3 && <span className="text-[9px]">+{entries.length - 3}</span>}</span>
          : <span className="mt-auto pt-2 text-[10px] text-white/55 sm:text-xs">{t("addShort")}</span>}
      </button>;
    })}</div></div>
    {data && <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap">
      {cards.map(entry => {
        const ended = now !== null && interviewEnded(entry, now);
        return <article key={entry.id} className={`flex min-w-0 flex-col rounded-3xl border p-4 lg:min-w-[220px] lg:flex-1 ${ended ? "border-white bg-white text-dark" : "border-white/25 bg-white/[0.025]"}`}>
          <div className="flex items-center justify-between gap-2"><p className={`text-sm ${ended ? "text-dark/60" : "text-white/60"}`}>{entry.startsAt ? `${calendarTime(entry.startsAt)} · ${durationLabel(savedDuration(entry))}` : `${t("anyTime")}${entry.durationMinutes != null ? ` · ${durationLabel(entry.durationMinutes)}` : ""}`}{ended ? ` · ${t("ended")}` : ""}</p>{entry.kind === "personal" && <label className="flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" aria-label={t("completeItem", { title: entry.title })} checked={entry.done} disabled={busy} className="h-6 w-6 accent-white" onChange={() => void write({ operation: "edit", id: entry.id, revision: entry.revision, date: entry.date, title: entry.title, note: entry.note, done: !entry.done })} /></label>}</div>
          <h3 className={`mt-2 break-words text-lg font-bold ${entry.done ? "opacity-60 line-through" : ""}`}>{entry.title}</h3>
          {entry.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm opacity-65">{entry.note}</p>}
          {ended && <p className="mt-3 text-sm text-dark/60">{t("howDidItGo")}</p>}
          {entry.alert.enabled && <p className="mt-2 text-xs opacity-65">{t(entry.alert.status === "accepted" ? "alertAccepted" : entry.alert.status === "failed" || entry.alert.status === "expired" || entry.alert.status === "skipped" ? "alertStopped" : "alertPending")}</p>}
          {entry.alert.error && <p role="alert" className="mt-2 whitespace-pre-wrap break-words text-xs text-red-500">{entry.alert.error}</p>}
          {!entry.available && <p className="mt-3 text-sm text-white/60">{t("unavailable")}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
            {entry.interview && entry.available && !entry.done && <button className={`${outline} ${ended ? "bg-dark text-white" : "bg-white text-dark"}`} onClick={() => logInterview(entry)}>{ended ? t("logIt") : t("logInterview")}</button>}
            {entry.kind === "personal" ? <button className={`${outline} opacity-70`} disabled={busy} onClick={() => { openDay(entry.date); edit(entry); }}>{t("edit")}</button> : entry.available && entry.actionId && !ended ? <Link className={`${outline} inline-flex items-center`} href={`${agenda}#action-${entry.actionId}`}>{t("openTask")}</Link> : null}
            {entry.kind === "action" && <button aria-label={t("details", { title: entry.title })} className="min-h-11 px-3 text-sm underline opacity-60" onClick={() => openDay(entry.date)}>{t("viewDetails")}</button>}
          </div>
        </article>;
      })}
      <button aria-label={t("addShort")} className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-3xl lg:w-24 lg:shrink-0 bg-white/5 p-5 text-white/65 hover:bg-white/10" disabled={busy || !activeDate} onClick={() => openDay(activeDate!)}><span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl" aria-hidden="true">+</span>{t("add")}</button>
    </div>}
    <div className="mt-5 border-t border-white/10 pt-4">
      {progress && <div className="flex flex-wrap items-center gap-3"><p className="text-sm font-semibold">{progress.target ? t("interviewProgress", { current: progress.current, target: progress.target }) : t("interviewCount", { current: progress.current })} · <span title={t("commitmentHint")}>{t("commitments", { count: progress.commitments })}</span></p>{progress.target != null && progress.target > 0 && <div role="progressbar" aria-label={t("interviewProgress", { current: progress.current, target: progress.target })} aria-valuemin={0} aria-valuemax={progress.target} aria-valuenow={Math.min(progress.current, progress.target)} className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(progress.current / progress.target * 100, 100)}%` }} /></div>}</div>}
      <div className="mt-2 flex flex-wrap gap-x-4 text-sm text-white/60"><button className="min-h-11 text-left hover:text-white disabled:opacity-40" disabled={!exports.length} onClick={() => { setPanel({ kind: "export" }); setNotice(""); }}>{t("googleCalendar")}</button><button className="min-h-11 text-left hover:text-white disabled:opacity-40" disabled={!exports.length} onClick={downloadCalendar}>{t("appleCalendar")}</button></div>
      <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-white/60">{t("taskHeading")} · {t(desktopDrag ? "dragHint" : "tapHint")}</summary>{data?.tasks.length ? <div className="grid gap-2 lg:grid-cols-3">{data.tasks.slice(0, 3).map(task => taskPill(task))}</div> : data && <p className="text-sm text-white/55">{data.planId ? t("allDone") : t("noPlan")}</p>}<p className="mt-3 text-[11px] text-white/50">{t("pointsHint")}</p></details>
    </div>
    {notice && !panel && <p role="status" className="mt-3 text-sm text-white/80">{notice}</p>}
    {displayedError && !panel && <div role="alert" className="mt-3 rounded-xl border border-red-300/30 bg-red-950/30 p-3 text-sm text-red-200"><p className="whitespace-pre-wrap">{displayedError}</p><button className="mt-1 min-h-11 underline" onClick={() => void reviewLatest()}>{t("reload")}</button></div>}
    <dialog ref={dialog} onClose={() => { setPanel(null); setDraft(null); }} onCancel={event => { if (busy) event.preventDefault(); }} aria-labelledby="week-dialog-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl bg-white p-5 text-dark shadow-xl backdrop:bg-black/60 sm:p-7">
      {panel && <><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-dark/50">{t("title")} · {t("timezone")}</p><h3 id="week-dialog-title" className="mt-1 text-xl font-bold">{panel.kind === "day" ? dateLabel(panel.date, true) : panel.kind === "plan" ? t("planWeek") : panel.kind === "export" ? t("googleCalendar") : t("chooseDate")}</h3></div><button autoFocus className="min-h-11 min-w-11 rounded-full hover:bg-dark/5" aria-label={t("close")} disabled={busy} onClick={() => dialog.current?.close()}>×</button></div>
        {displayedError && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><p className="whitespace-pre-wrap">{displayedError}</p><button disabled={busy} className="min-h-11 underline" onClick={() => void reviewLatest()}>{t("reload")}</button></div>}
        {notice && <p role="status" className="mt-3 text-sm text-green-800">{notice}</p>}
        {panel.kind === "export" && <div className="mt-5 space-y-3"><p className="text-sm text-dark/60">{t("exportHint")}</p>{exports.map(entry => <a key={entry.id} href={googleCalendarUrl(entry)} target="_blank" rel="noopener noreferrer" className="block min-h-11 rounded-xl border border-dark/10 p-3 text-sm hover:bg-dark/5"><span className="block font-semibold">{entry.title} ↗</span><span className="text-dark/50">{dateLabel(entry.date)} · {entry.startsAt ? calendarTime(entry.startsAt) : t("anyTime")}</span></a>)}</div>}
        {panel.kind === "schedule" && <div className="mt-5 space-y-4">{selectedTask ? <><p className="font-semibold">#{selectedTask.displayNumber} · {selectedTask.title}</p>{selectedTask.dependency.blocked ? <p className="text-sm text-amber-800">{waiting(selectedTask)}</p> : <><label className="block text-sm font-semibold">{t("date")}<input type="date" className={field} min="2000-01-01" max="2099-12-31" value={chosenDate} onInput={event => setChosenDate(event.currentTarget.value)} /></label><div className="grid grid-cols-7 gap-1">{days.map(date => <button key={date} className={`min-h-11 rounded-xl border text-sm ${chosenDate === date ? "border-dark bg-dark text-white" : "border-dark/10"}`} onClick={() => setChosenDate(date)}>{Number(date.slice(-2))}</button>)}</div><div className="grid grid-cols-2 gap-3"><label className="block text-sm">{t("startTime")}<input type="time" className={field} value={startTime} onInput={event => setStartTime(event.currentTarget.value)} /></label><label className="block text-sm">{t("duration")}<select className={field} value={duration} onChange={event => setDuration(Number(event.target.value))}>{durationOptions(duration)}</select></label></div>{alertControl(alertEmail, setAlertEmail)}<button className={`${outline} w-full bg-dark text-white`} disabled={busy || !chosenDate} onClick={() => void schedule(selectedTask, chosenDate, ({ ...durationTimes(chosenDate, startTime, duration), durationMinutes: Number.isInteger(duration) ? duration : null, alertEmail, locale }))}>{busy ? t("saving") : t("schedule")}</button></>}</> : <p className="text-sm">{t("taskChanged")}</p>}</div>}
        {panel.kind === "plan" && <div className="mt-5 space-y-4"><div className="grid grid-cols-7 gap-1">{days.map((date, i) => <button key={date} className="flex min-h-16 flex-col items-center justify-center rounded-xl border border-dark/15 text-xs hover:bg-dark/5" onClick={() => openDay(date)}><span>{t(`days.${i}`)}</span><span className="mt-1 text-lg font-bold">{Number(date.slice(-2))}</span></button>)}</div>
          {data?.tasks.length ? <div className="space-y-2 rounded-2xl bg-[#111111] p-3 text-white">{data.tasks.map(task => taskPill(task, true))}</div> : <p className="text-sm text-dark/60">{t("noPlan")}</p>}</div>}
        {panel.kind === "day" && <><ul className="mt-5 space-y-3">{dayEntries.map(entry => <li key={entry.id} className="rounded-2xl border border-dark/10 p-4"><p className={`break-words font-semibold ${entry.done ? "text-dark/50 line-through" : ""}`}>{entry.title}</p><p className="mt-1 text-xs text-dark/50">{entry.kind === "action" ? t("actionType") : t("personalType")}{entry.done ? ` · ${t("done")}` : ""}</p>{entry.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-dark/60">{entry.note}</p>}
          {entry.kind === "action" && !entry.available && <p className="mt-2 text-sm text-amber-800">{t("unavailable")}</p>}
          <div className="mt-2 flex flex-wrap gap-2">{entry.kind === "personal" ? <button className={outline} disabled={busy} onClick={() => edit(entry)}>{t("edit")}</button> : entry.available && entry.actionId ? <Link className={`${outline} inline-flex items-center`} href={`${agenda}#action-${entry.actionId}`}>{t("openTask")} ↗</Link> : null}<button className={`${outline} text-dark/60`} disabled={busy} onClick={() => void write({ operation: "remove", id: entry.id, revision: entry.revision })}>{t("remove")}</button></div></li>)}</ul>
          {!dayEntries.length && <p className="mt-4 text-sm text-dark/55">{t("emptyDay")}</p>}
          {draft && <form onSubmit={savePersonal} className="mt-5 space-y-4 border-t border-dark/10 pt-5"><div className="flex items-center justify-between"><h4 className="font-bold">{draft.id ? t("edit") : t("add")}</h4>{draft.id && <button type="button" className="min-h-11 px-2 text-sm underline" disabled={busy} onClick={() => setDraft(newDraft(panel.date))}>{t("cancelEdit")}</button>}</div>
            <label className="block text-sm font-semibold">{t("itemTitle")}<input autoComplete="off" required maxLength={200} className={field} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
            <label className="block text-sm font-semibold">{t("note")}<textarea rows={3} maxLength={2000} className={field} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-semibold">{t("startTime")}<input type="time" required={draft.alertEmail} className={field} value={draft.startTime} onInput={event => setDraft({ ...draft, startTime: event.currentTarget.value })} /></label><label className="block text-sm font-semibold">{t("duration")}<select className={field} value={draft.duration} onChange={event => setDraft({ ...draft, duration: Number(event.target.value) })}>{durationOptions(draft.duration)}</select></label></div>{alertControl(draft.alertEmail, value => setDraft({ ...draft, alertEmail: value }))}
            {draft.id && <><label className="block text-sm font-semibold">{t("date")}<input required type="date" min="2000-01-01" max="2099-12-31" className={field} value={draft.date} onInput={event => setDraft({ ...draft, date: event.currentTarget.value })} /></label><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={draft.done} onChange={event => setDraft({ ...draft, done: event.target.checked })} className="h-5 w-5 accent-dark" />{t("markDone")}</label></>}
            <button type="submit" className={`${outline} w-full bg-dark text-white`} disabled={busy || !draft.title.trim()}>{busy ? t("saving") : draft.id ? t("save") : t("add")}</button></form>}
        </>}
      </>}
    </dialog>
  </section>;
}
