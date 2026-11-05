"use client";
import { STEPS, MILESTONES, words } from "@/lib/action-plan/flow/catalog";

import PersonalizationQuestions, { PersonalizationSummary } from "./PersonalizationQuestions";
import { personalizationSchema, type Personalization } from "@/lib/action-plan/personalization";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { diagnosisSchema, type Diagnosis } from "@/lib/action-plan/schemas";
import { useDashboardUser } from "./DashboardUserProvider";
import { notifyPlanChanged } from "./PlanRefresh";
import { builderStorageKey, readBuilderDraft, newBuilderDraft, draftChanged, type BuilderDraft } from "@/lib/action-plan/builder-draft";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import type { DiscoverySetup } from "@/lib/discovery/policy";

type Message = { role: "user" | "assistant"; content: string };
type Answer = { question: string; answer: string };
type ApiResponse<T> = { data?: T; error?: string };
type DiagnoseData =
  | { status: "needs_input"; question: string }
  | { status: "ready"; diagnosis: Diagnosis };

async function readApiResponse<T>(response: Response, fallback: string): Promise<ApiResponse<T>> {
  const body = await response.text();
  try {
    return JSON.parse(body) as ApiResponse<T>;
  } catch {
    const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
    throw new Error([fallback, status].join("\n"));
  }
}

export default function ActionPlanBuilder({
  messages = [],
  variant = "build",
  onGenerated,
  triggerClassName, autoOpen = false,
  discoveryTrial = false, discoverySetup,
}: {
  messages?: Message[];
  variant?: "build" | "regenerate";
  onGenerated?: () => void;
  triggerClassName?: string;
  autoOpen?: boolean;
  discoveryTrial?: boolean;
  discoverySetup?: DiscoverySetup | null;
}) {
  const t = useTranslations("Dashboard.actionPlan.builder");
  const locale = useLocale() === "zh-tw" ? "zh-tw" : "en";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<BuilderDraft | null>(null);
  const draftRef = useRef<BuilderDraft | null>(null), busyRef = useRef(false), alive = useRef(true), opened = useRef(false), automatic = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null), triggerRef = useRef<HTMLButtonElement>(null);
  const userId = useDashboardUser(), storageKey = userId ? builderStorageKey(userId) : null;
  const [correcting, setCorrecting] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [conflict, setConflict] = useState(false);
  const { answers = [], diagnosis = null, personalization = {} } = draft || {};
  const blocked = busy || conflict || Boolean(draft?.generatingAt);
  const tGuide = useTranslations("Dashboard.gettingStarted");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function writeChange(change: Partial<BuilderDraft>) {
    const local = draftRef.current; if (!local || !alive.current) return false;
    try {
      if (storageKey && draftChanged(local, readBuilderDraft(localStorage.getItem(storageKey)))) { setConflict(true); setError(tGuide("draftChanged")); return false; }
      const next = { ...local, ...change, revision: local.revision + 1 };
      draftRef.current = next; setDraft(next);
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
    } catch { const next = { ...local, ...change, revision: local.revision + 1 }; draftRef.current = next; setDraft(next); setNotice(tGuide("storageWarning")); }
    return true;
  }
  async function resultFor(requestId: string) {
    const res = await fetch(`/api/action-plans/generate?requestId=${encodeURIComponent(requestId)}`, { cache: "no-store" });
    const json = await readApiResponse<{ planId: string | null }>(res, t("genericError"));
    if (!res.ok) throw new Error(json.error || t("genericError"));
    return json.data?.planId || null;
  }
  function finish(requestId: string) {
    try { if (storageKey && readBuilderDraft(localStorage.getItem(storageKey))?.requestId === requestId) localStorage.removeItem(storageKey); }
    catch { if (alive.current) setNotice(tGuide("storageWarning")); }
    if (!alive.current) return;
    notifyPlanChanged(userId || undefined);
    setOpen(false); opened.current = false; onGenerated?.();
    router.push(pathForLocale("/dashboard/agenda", locale as Locale)); router.refresh();
  }
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current, trigger = triggerRef.current; dialog.showModal();
    return () => { dialog.close(); trigger?.focus(); };
  }, [open]);
  useEffect(() => {
    if (open && !diagnosis && !busy) dialogRef.current?.querySelector<HTMLInputElement>("input[type=radio]")?.focus();
  }, [open, diagnosis, busy]);
  useEffect(() => {
    if (!storageKey) return;
    const changed = (event: StorageEvent) => { if (opened.current && event.key === storageKey && draftRef.current && draftChanged(draftRef.current, readBuilderDraft(event.newValue))) { setConflict(true); setError(tGuide("draftChanged")); } };
    window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
  }, [storageKey, tGuide]);

  async function callDiagnose(nextAnswers: Answer[]) {
    if (busyRef.current || conflict || !draftRef.current) return;
    const selected = personalizationSchema.safeParse(draftRef.current.personalization);
    if (!selected.success) { setError(locale === "zh-tw" ? "請完成五題單選。" : "Answer all five questions."); return; }
    busyRef.current = true; setBusy(true); setError("");
    // Save submitted answers before any network or AI call; a failure never loses them.
    if (!writeChange({ answers: nextAnswers, answer: "", question: "", diagnosis: null })) { busyRef.current = false; setBusy(false); return; }
    try {
      const response = await fetch("/api/action-plans/diagnose", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: draftRef.current!.locale, messages: draftRef.current!.messages, answers: nextAnswers, personalization: selected.data, requestId: draftRef.current!.requestId }) });
      const json = await readApiResponse<DiagnoseData>(response, t("genericError"));
      if (!response.ok) throw new Error(json.error || t("genericError"));
      if (!json.data || json.data.status !== "ready") throw new Error(t("genericError"));
      if (!alive.current) return;
      { const checked = diagnosisSchema.safeParse(json.data.diagnosis); if (!checked.success) throw new Error(t("genericError")); writeChange({ question: "", diagnosis: checked.data }); setCorrecting(false); }
    } catch (cause) { if (alive.current) { setCorrecting(true); setError(cause instanceof Error ? cause.message : t("genericError")); } }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  async function begin() {
    if (busyRef.current || !storageKey) return;
    setOpen(true); opened.current = true; setError(""); setNotice(""); setConflict(false); setCorrecting(false);
    let restored: BuilderDraft | null = null;
    try { restored = readBuilderDraft(localStorage.getItem(storageKey)); } catch { setNotice(tGuide("storageWarning")); }
    const recovered = discoverySetup ? { ...newBuilderDraft(discoverySetup.locale, discoverySetup.requestId), answers: discoverySetup.answers, personalization: discoverySetup.personalization || {}, diagnosis: discoverySetup.diagnosis, question: "" } : null;
    const next = restored || recovered || newBuilderDraft(locale, crypto.randomUUID(), messages);
    const hadPersonalization = personalizationSchema.safeParse(next.personalization).success;
    busyRef.current = true; setBusy(true);
    try {
      const response = await fetch("/api/action-plans/diagnose", { cache: "no-store" });
      const saved = await readApiResponse<{ openingAnswers: Answer[]; personalization: Personalization | null }>(response, t("genericError"));
      if (!response.ok || !saved.data) throw new Error(saved.error || t("genericError"));
      if (!next.answers.length) next.answers = saved.data.openingAnswers;
      if (!Object.keys(next.personalization).length && saved.data.personalization) next.personalization = saved.data.personalization;
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("genericError")); }
    finally { busyRef.current = false; setBusy(false); }
    if (!hadPersonalization || !personalizationSchema.safeParse(next.personalization).success) next.diagnosis = null;
    next.question = "";
    if (next.generatingAt && Date.now() - next.generatingAt >= 300000) next.generatingAt = null;
    draftRef.current = next; setDraft(next);
    setCorrecting(false);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { setNotice(tGuide("storageWarning")); }
    if (restored) {
      setNotice(tGuide(restored.diagnosis ? "diagnosisRestored" : "answersRestored"));
      busyRef.current = true; setBusy(true);
      try { if (await resultFor(next.requestId)) finish(next.requestId); }
      catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : t("genericError")); }
      finally { busyRef.current = false; if (alive.current) setBusy(false); }
    }
  }
  useEffect(() => {
    if (!autoOpen || automatic.current) return;
    automatic.current = true;
    const url = new URL(window.location.href); url.searchParams.delete("guide"); window.history.replaceState(null, "", url.toString());
    void begin();
    // Only an explicit guide link opens once. Restoring answers never invokes AI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);
  useEffect(() => {
    if (!open || !draft?.generatingAt) return;
    let cancelled = false, checking = false;
    const timer = setInterval(async () => {
      if (checking || cancelled) return; checking = true;
      try { const result = await resultFor(draft.requestId); if (!cancelled && result) finish(draft.requestId);
        else if (!cancelled && Date.now() - draft.generatingAt! >= 300000) { writeChange({ generatingAt: null }); setNotice(tGuide("requestExpired")); }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : t("genericError")); }
      finally { checking = false; }
    }, 3000);
    return () => { cancelled = true; clearInterval(timer); };
    // Polling only checks an owned request. It never resubmits AI work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft?.generatingAt]);

  async function generate() {
    if (busyRef.current || blocked || !diagnosis || correcting || !draftRef.current) return;
    const selected = personalizationSchema.safeParse(draftRef.current.personalization);
    if (!selected.success) { setCorrecting(true); return; }
    busyRef.current = true; setBusy(true); setError("");
    const requestId = draftRef.current.requestId; let received = false;
    try {
      if (await resultFor(requestId)) { finish(requestId); return; }
      if (!writeChange({ generatingAt: Date.now() })) return;
      const response = await fetch("/api/action-plans/generate", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: draftRef.current.locale, messages: draftRef.current.messages, answers, personalization: selected.data, diagnosis, requestId, candidateCount: 5 }) });
      received = true; const json = await readApiResponse<unknown>(response, t("genericError"));
      if (!response.ok) throw new Error(json.error || t("genericError"));
      finish(requestId);
    } catch (cause) {
      if (!alive.current) return;
      try { if (await resultFor(requestId)) { finish(requestId); return; } } catch { /* keep the original safe error */ }
      if (received) writeChange({ generatingAt: null });
      setError(cause instanceof Error ? cause.message : t("genericError"));
    } finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef} disabled={!userId || busy}
        onClick={() => void begin()}
        className={
          triggerClassName ??
          "inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-50 font-[family-name:var(--font-heading)]"
        }
      >
        {variant === "regenerate" ? t("regenerate") : t("build")}
      </button>

      {open && createPortal(
        <dialog aria-labelledby="action-plan-builder-title" ref={dialogRef} data-brand="nova" onCancel={event => { if (busy) event.preventDefault(); else { opened.current = false; setOpen(false); } }} className="nova-theme m-auto max-h-[94vh] w-[calc(100%_-_1.5rem)] max-w-2xl overflow-y-auto rounded-[1.75rem] bg-transparent p-0 backdrop:bg-dark/45 backdrop:backdrop-blur-sm">
          <div
            aria-labelledby="action-plan-builder-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-white/30 bg-[#fffdf8] p-5 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">NOVA</p>
                <h2 id="action-plan-builder-title" className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
                  {t("title")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => { opened.current = false; setOpen(false); }}
                disabled={busy}
                aria-label={t("close")}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-dark/10 text-xl text-dark/50 hover:bg-dark/[0.04] disabled:opacity-40"
              >
                ×
              </button>
            </div>

            {discoveryTrial && <p className="mt-4 text-sm">{locale === "zh-tw" ? "完成五題單選，確認適合你的起步任務。訪談、銷售與募資方向依答案安排；完整功能仍依原方案開放。" : "Answer five multiple-choice questions and confirm your starter steps. Interview, sales and fundraising priorities follow your answers; full features remain subject to your plan."}</p>}
            {notice && <p role="status" className="mt-4 text-sm text-sky-800">{notice}</p>}
            {draft?.generatingAt && <p role="status" className="mt-4 text-sm text-sky-800">{tGuide("pendingRequest")}</p>}
            {busy && <p role="status" className="mt-4 text-sm">{t("diagnosing")}</p>}
            {draft && (!diagnosis || correcting) && <form className="mt-6 space-y-5" onSubmit={event => { event.preventDefault(); void callDiagnose(answers); }}>
              <p className="text-sm">{locale === "zh-tw" ? "五題單選，約一分鐘。已保存的開場三題會一起使用，不必重填。" : "Five questions, about one minute. Your saved opening answers are reused."}</p>
              <PersonalizationQuestions value={personalization} locale={locale} disabled={blocked} onChange={value => writeChange({ personalization: value, diagnosis: null })} />
              <button type="submit" disabled={blocked || !personalizationSchema.safeParse(personalization).success} className="min-h-11 rounded-xl bg-dark px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? t("diagnosing") : (locale === "zh-tw" ? "檢視我的個人化方向" : "Review my personalized direction")}</button>
            </form>}
            {diagnosis && !correcting && <div className="mt-7 space-y-4">
              <h3 className="text-lg font-bold">{t("yourDiagnosis")}</h3>
              <div className="grid gap-3 sm:grid-cols-2"><Evidence title={t("stageEvidence")} reason={diagnosis.stageReason} /><Evidence title={t("bottleneckEvidence")} reason={diagnosis.bottleneckReason} /></div>
              {personalizationSchema.safeParse(personalization).success && <><PersonalizationSummary value={personalization as Personalization} locale={locale} showSteps={discoveryTrial} />{!discoveryTrial && <section className="space-y-3"><h3 className="text-lg font-bold">{locale === "zh-tw" ? "5 個里程碑、16 步，依實際成果依序開啟" : "Five milestones, sixteen steps unlocked by actual evidence"}</h3><p className="text-sm">{locale === "zh-tw" ? "自報客戶數不視為完成證據；新計畫由第一步開始。既有計畫會保留在歷史版本。" : "Reported customer counts are not completion evidence. New plans start at step one; existing plans are retained in history."}</p><details><summary className="min-h-11 cursor-pointer py-3 font-semibold">{locale === "zh-tw" ? "查看完整流程" : "View the full workflow"}</summary>{MILESTONES.map((m, i) => <div key={i} className="mt-4"><h4 className="font-bold">{i + 1}. {words(m, locale)}</h4><ul className="mt-2 space-y-2 text-sm">{STEPS.filter(s => s.milestone === i).map(s => <li key={s.id}>{s.id} {words(s.title, locale)}</li>)}</ul></div>)}</details></section>}</>}
              <div className="flex flex-wrap gap-3"><button type="button" disabled={blocked} onClick={() => void generate()} className="min-h-11 rounded-xl bg-dark px-5 py-3 font-bold text-white">{busy ? (locale === "zh-tw" ? "正在確認計畫…" : "Confirming plan…") : t("confirmDiagnosis")}</button><button type="button" disabled={blocked} onClick={() => { setCorrecting(true); writeChange({ diagnosis: null }); }} className="min-h-11 rounded-xl border px-5 py-3 text-sm font-bold">{t("correctDiagnosis")}</button></div>
            </div>}
            {draft && <details className="mt-5"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{locale === "zh-tw" ? "沿用的開場回答" : "Saved opening answers"}</summary>{answers.length ? answers.map((row, i) => <div key={i} className="mt-3 text-sm"><p className="font-semibold">{row.question}</p><p className="mt-1 whitespace-pre-wrap">{row.answer}</p></div>) : <p className="text-sm">{locale === "zh-tw" ? "未保存原始回答；本次將使用公司資料與五題選項規劃。" : "Original answers were not saved. This plan uses your company profile and five choices."}</p>}</details>}

            {conflict && <button type="button" onClick={() => void begin()} className="mt-4 min-h-11 rounded-xl border px-4">{tGuide("reloadDraft")}</button>}
            {error && (
              <div role="alert" className="mt-5 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

          </div>
        </dialog>,
        document.body,
      )}
    </>
  );
}

function Evidence({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="rounded-2xl border border-dark/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-dark/45">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-dark/70">{reason}</p>
    </div>
  );
}
