"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";
import type { GettingStartedView } from "@/lib/getting-started/state";
import { useDashboardUser } from "./DashboardUserProvider";
import { notifyPlanChanged } from "./PlanRefresh";

export function useGettingStarted(initial: GettingStartedView | null = null) {
  const [view, setView] = useState(initial), [error, setError] = useState("");
  const userId = useDashboardUser(), request = useRef(0);
  const accept = useCallback((next: GettingStartedView) => { request.current++; setView(next); }, []);
  const reload = useCallback(async () => {
    const current = ++request.current;
    try {
      const res = await fetch("/api/account/getting-started", { cache: "no-store" });
      const json = await res.json(); if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (current === request.current) { setView(json.data); setError(""); }
    } catch (cause) { if (current === request.current) setError(cause instanceof Error ? cause.message : String(cause)); }
  }, []);
  useEffect(() => {
    void reload();
    const channel = userId && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`nova-plan:${userId}`) : null;
    if (channel) channel.onmessage = () => void reload();
    window.addEventListener("focus", reload); window.addEventListener("nova-plan-changed", reload);
    return () => { channel?.close(); window.removeEventListener("focus", reload); window.removeEventListener("nova-plan-changed", reload); };
  }, [reload, userId]);
  return { view, setView: accept, error, setError, reload };
}
const button = "inline-flex min-h-11 items-center justify-center rounded-xl bg-dark px-5 py-3 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

export default function GettingStartedHome({ initial, overview, copilot, investor, events, podcast, rewards }: {
  initial: GettingStartedView; overview: ReactNode; copilot: ReactNode; investor: ReactNode; events: ReactNode; podcast: ReactNode; rewards?: ReactNode;
}) {
  const { view: state, setView, error, setError, reload } = useGettingStarted(initial);
  const view = state || initial, t = useTranslations("Dashboard.gettingStarted"), locale = useLocale() as Locale;
  const userId = useDashboardUser(), router = useRouter(), mutation = useRef(false);
  const [busy, setBusy] = useState(false), [toast, setToast] = useState(false), [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    if (!userId || !view.completedAt) return;
    const key = `nova:guide-complete:${userId}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { if (localStorage.getItem(key) !== view.completedAt) { localStorage.setItem(key, view.completedAt); timer = setTimeout(() => setToast(true), 0); } }
    catch { timer = setTimeout(() => setStorageWarning(true), 0); }
    return () => clearTimeout(timer);
  }, [userId, view.completedAt]);
  async function preference(action: "dismiss" | "reopen") {
    if (mutation.current) return; mutation.current = true; setBusy(true); setError("");
    try {
      const res = await fetch("/api/account/getting-started", { method: "PATCH", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const json = await res.json(); if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setView(json.data); notifyPlanChanged(userId || undefined); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { mutation.current = false; setBusy(false); }
  }
  const agenda = pathForLocale("/dashboard/agenda", locale), build = `${agenda}?guide=build`, account = pathForLocale("/dashboard/account?guide=profile#profile", locale);
  const primaryHref = !view.canGenerate && view.currentStep !== 1 ? pathForLocale("/dashboard/account#plan", locale)
    : view.currentStep === 1 ? account : view.currentStep === 2 ? build
    : view.nextTask ? `${agenda}#action-${view.nextTask.id}` : `${agenda}${view.blocked === "outcome" || view.blocked === "next_stage" ? "#goal-roadmap" : "#action-plan-list"}`;
  const primaryLabel = !view.canGenerate && view.currentStep !== 1 ? t("viewPlanOptions") : view.currentStep === 1 ? t("completeProfile")
    : view.currentStep === 2 ? t("buildPlan") : view.nextTask ? t("openFirstTask") : t("resolveBlocker");
  const extras = <div className="grid min-w-0 gap-6 lg:grid-cols-2">{investor}{events}{podcast}</div>;
  const daily = <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-2">
    <div className="order-3 min-w-0 lg:order-1 lg:col-start-1 lg:row-start-1">{investor}</div>
    <div className="order-1 min-w-0 lg:order-2 lg:col-start-1 lg:row-start-2">{rewards}</div>
    <div className="order-2 min-w-0 lg:order-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-stretch">{copilot}</div>
  </div>;
  return <div className="mt-5 space-y-6">
    <div className="flex justify-end"><button className="min-h-11 rounded-xl px-3 text-sm font-semibold underline underline-offset-4 disabled:opacity-50" disabled={busy} onClick={() => void preference(view.visible ? "dismiss" : "reopen")}>{view.visible ? t("later") : t("reopen")}</button></div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}<button onClick={() => void reload()} className="ml-3 min-h-11 underline">{t("retry")}</button></div>}
    {storageWarning && <p role="status" className="text-sm text-amber-800">{t("storageWarning")}</p>}
    {toast && <div role="status" className="flex items-center justify-between gap-3 rounded-xl bg-green-50 p-4 text-sm text-green-900"><p>{t("firstTaskComplete")}</p><button className="min-h-11 min-w-11" aria-label={t("close")} onClick={() => setToast(false)}>×</button></div>}
    {view.visible && <section id="getting-started" aria-labelledby="getting-started-title" className="min-w-0 rounded-3xl border border-sky-200 bg-sky-50/50 p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-sky-800">{t("eyebrow")}</p>{!view.hasPlan && <span className="text-xs text-dark/60">{t("progress", { done: view.missingFields.length ? 0 : 1, total: 3 })}</span>}</div>
      <h2 id="getting-started-title" className="mt-2 text-2xl font-extrabold">{view.hasPlan ? t("firstMoveTitle") : t("title")}</h2>
      <p className="mt-2 text-sm text-dark/65">{view.hasPlan ? t("firstMoveBody") : t("intro")}</p>
      {!view.hasPlan && <ol className="mt-5 grid gap-3 md:grid-cols-3">{[1, 2, 3].map(step => <li key={step} className={`rounded-2xl border p-4 ${step === view.currentStep ? "border-sky-400 bg-white" : "border-dark/10 bg-white/60"}`} aria-current={step === view.currentStep ? "step" : undefined}>
        <p className="text-xs font-bold text-sky-800">{t("step", { number: step })}{step === 1 && !view.missingFields.length ? ` · ${t("done")}` : ""}</p>
        {step === 1 && !view.missingFields.length ? <details className="mt-2"><summary className="min-h-11 cursor-pointer font-bold">{t("step1Title")}</summary><p className="mt-2 text-sm text-dark/60">{t("step1Body")}</p><Link href={account} className="mt-2 inline-flex min-h-11 items-center text-sm underline">{t("reviewProfile")}</Link></details>
          : <><h3 className="mt-2 font-bold">{t(`step${step}Title`)}</h3><p className="mt-2 text-sm text-dark/60">{t(`step${step}Body`)}</p></>}
      </li>)}</ol>}
      {view.hasPlan && view.nextTask && <div className="mt-4 rounded-2xl bg-white p-4"><p className="text-xs font-bold text-green-800">{t("ready")}</p><h3 className="mt-1 font-bold">#{view.nextTask.displayNumber} · {view.nextTask.title}</h3><p className="mt-2 text-sm text-dark/60">{t("realCompletion")}</p></div>}
      {view.hasPlan && !view.nextTask && view.canGenerate && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p>{t(`blocked.${view.blocked || "no_tasks"}`)}</p>{view.blockers.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{view.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul>}</div>}
      {!view.canGenerate && <p className="mt-4 text-sm text-dark/65">{t("accessHint")}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-4"><Link className={button} href={primaryHref}>{primaryLabel} →</Link>{view.currentStep === 1 && <Link href={view.canGenerate ? build : pathForLocale("/dashboard/account#plan", locale)} className="inline-flex min-h-11 items-center text-sm underline">{t("startWithoutProfile")}</Link>}</div>
      <Link href={pathForLocale("/dashboard/profile", locale)} className="mt-3 inline-flex min-h-11 items-center text-sm text-dark/60 underline">{t("optionalIcp")}</Link>
    </section>}
    {view.visible && !view.hasPlan ? <>{rewards}<details className="rounded-2xl border border-dark/10 p-4"><summary className="min-h-11 cursor-pointer font-semibold">{t("optionalPolaris")}</summary>{copilot}</details><details id="explore-more" className="rounded-2xl border border-dark/10 p-4"><summary className="min-h-11 cursor-pointer font-semibold">{t("explore")}</summary><div className="mt-4">{extras}</div></details></>
      : <>{daily}{overview}<div className="grid min-w-0 gap-6 lg:grid-cols-2">{events}{podcast}</div></>}
  </div>;
}
