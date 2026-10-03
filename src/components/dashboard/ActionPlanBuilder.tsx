"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { BOTTLENECKS, COMPANY_STAGES, type BottleneckGroup } from "@/lib/action-plan/constants";
import { diagnosisSchema, type Diagnosis } from "@/lib/action-plan/schemas";
import { useDashboardUser } from "./DashboardUserProvider";
import { notifyPlanChanged } from "./PlanRefresh";
import { builderStorageKey, readBuilderDraft, newBuilderDraft, draftChanged, DIAGNOSTIC_QUESTIONS, type BuilderDraft } from "@/lib/action-plan/builder-draft";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

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
}: {
  messages?: Message[];
  variant?: "build" | "regenerate";
  onGenerated?: () => void;
  triggerClassName?: string;
  autoOpen?: boolean;
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
  const [confirmed, setConfirmed] = useState(false), [correcting, setCorrecting] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [conflict, setConflict] = useState(false);
  const { question = "", answer = "", answers = [], diagnosis = null } = draft || {};
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
  function setAnswer(value: string) { writeChange({ answer: value }); }
  function setDiagnosis(value: Diagnosis) { writeChange({ diagnosis: value }); }
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
    if (open && question && !busy) dialogRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }, [open, question, busy]);
  useEffect(() => {
    if (!storageKey) return;
    const changed = (event: StorageEvent) => { if (opened.current && event.key === storageKey && draftRef.current && draftChanged(draftRef.current, readBuilderDraft(event.newValue))) { setConflict(true); setError(tGuide("draftChanged")); } };
    window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
  }, [storageKey, tGuide]);

  const group = (diagnosis?.bottleneckGroup ?? "Product") as BottleneckGroup;
  const bottlenecks = useMemo(() => BOTTLENECKS[group], [group]);

  async function callDiagnose(nextAnswers: Answer[]) {
    if (busyRef.current || conflict || !draftRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    // Save submitted answers before any network or AI call; a failure never loses them.
    if (!writeChange({ answers: nextAnswers, answer: "", question: DIAGNOSTIC_QUESTIONS[locale][nextAnswers.length] || "", diagnosis: null })) { busyRef.current = false; setBusy(false); return; }
    try {
      const response = await fetch("/api/action-plans/diagnose", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, messages: draftRef.current!.messages, answers: nextAnswers }) });
      const json = await readApiResponse<DiagnoseData>(response, t("genericError"));
      if (!response.ok) throw new Error(json.error || t("genericError"));
      if (!json.data || json.data.status === "ready" && nextAnswers.length !== 3 || json.data.status === "needs_input" && nextAnswers.length >= 3) throw new Error(t("answerAllThree"));
      if (!alive.current) return;
      if (json.data.status === "needs_input") writeChange({ question: json.data.question });
      else { const checked = diagnosisSchema.safeParse(json.data.diagnosis); if (!checked.success) throw new Error(t("genericError")); writeChange({ question: "", diagnosis: checked.data }); setConfirmed(false); setCorrecting(false); }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : t("genericError")); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  async function begin() {
    if (busyRef.current || !storageKey) return;
    setOpen(true); opened.current = true; setError(""); setNotice(""); setConflict(false); setConfirmed(false); setCorrecting(false);
    let restored: BuilderDraft | null = null;
    try { restored = readBuilderDraft(localStorage.getItem(storageKey)); } catch { setNotice(tGuide("storageWarning")); }
    const next = restored || newBuilderDraft(locale, crypto.randomUUID(), messages);
    if (next.generatingAt && Date.now() - next.generatingAt >= 300000) next.generatingAt = null;
    draftRef.current = next; setDraft(next);
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
  async function submitAnswer(event: React.FormEvent) {
    event.preventDefault(); const text = answer.trim(); if (!text || !question || blocked) return;
    await callDiagnose([...answers, { question, answer: text }]);
  }

  function changeStage(companyStage: Diagnosis["companyStage"]) {
    if (!diagnosis) return;
    setDiagnosis({ ...diagnosis, companyStage, stageReason: t("userAdjusted"), stageConfidence: 0 });
  }

  function changeGroup(bottleneckGroup: Diagnosis["bottleneckGroup"]) {
    if (!diagnosis) return;
    setDiagnosis({
      ...diagnosis,
      bottleneckGroup,
      bottleneckCode: BOTTLENECKS[bottleneckGroup][0][0],
      bottleneckReason: t("userAdjusted"),
      bottleneckConfidence: 0,
    });
  }

  async function generate() {
    if (busyRef.current || blocked || !diagnosis || !confirmed || !draftRef.current) return;
    if (answers.length !== 3) { setError(t("answerAllThree")); return; }
    busyRef.current = true; setBusy(true); setError("");
    const requestId = draftRef.current.requestId; let received = false;
    try {
      if (await resultFor(requestId)) { finish(requestId); return; }
      if (!writeChange({ generatingAt: Date.now() })) return;
      const response = await fetch("/api/action-plans/generate", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, messages: draftRef.current.messages, answers, diagnosis, requestId, candidateCount: 5 }) });
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
                <p className="mt-2 text-sm leading-6 text-dark/60">{t("intro")}</p>
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

            {notice && <p role="status" className="mt-4 text-sm text-sky-800">{notice}</p>}
            {draft?.generatingAt && <p role="status" className="mt-4 text-sm text-sky-800">{tGuide("pendingRequest")}</p>}
            {busy && !diagnosis && !question && (
              <div className="mt-8 rounded-2xl border border-primary/15 bg-primary/[0.04] p-6 text-sm font-semibold text-primary">
                {t("diagnosing")}
              </div>
            )}

            {question && (
              <form onSubmit={submitAnswer} className="mt-7">
                <div className="rounded-2xl border border-primary/20 bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                    {t("questionCount", { count: answers.length + 1 })}
                  </p>
                  <p className="mt-2 text-base font-semibold leading-7 text-dark">{question}</p>
                </div>
                <label className="mt-5 block text-sm font-bold text-dark" htmlFor="nova-diagnostic-answer">
                  {t("answerLabel")}
                </label>
                <textarea
                  id="nova-diagnostic-answer"
                  value={answer}
                  disabled={blocked}
                  onChange={(event) => setAnswer(event.target.value)}
                  maxLength={4000}
                  required
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-dark/15 bg-white px-4 py-3 text-sm text-dark outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <button
                  type="submit"
                  disabled={blocked || !answer.trim()}
                  className="mt-4 min-h-11 rounded-xl bg-dark px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? t("diagnosing") : t("continue")}
                </button>
              </form>
            )}

            {diagnosis && (
              <div className="mt-7">
                <h3 className="text-lg font-bold text-dark">{t("yourDiagnosis")}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Evidence title={t("stageEvidence")} reason={diagnosis.stageReason} />
                  <Evidence title={t("bottleneckEvidence")} reason={diagnosis.bottleneckReason} />
                </div>
                {correcting && <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold text-dark">
                    {t("stage")}
                    <select
                      disabled={blocked} value={diagnosis.companyStage}
                      onChange={(event) => changeStage(event.target.value as Diagnosis["companyStage"])}
                      className="mt-2 min-h-11 w-full rounded-xl border border-dark/15 bg-white px-3 text-sm font-normal"
                    >
                      {COMPANY_STAGES.map((stage) => <option key={stage}>{stage}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-bold text-dark">
                    {t("bottleneckGroup")}
                    <select
                      disabled={blocked} value={diagnosis.bottleneckGroup}
                      onChange={(event) => changeGroup(event.target.value as Diagnosis["bottleneckGroup"])}
                      className="mt-2 min-h-11 w-full rounded-xl border border-dark/15 bg-white px-3 text-sm font-normal"
                    >
                      {Object.keys(BOTTLENECKS).map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-bold text-dark sm:col-span-2">
                    {t("bottleneck")}
                    <select
                      disabled={blocked} value={diagnosis.bottleneckCode}
                      onChange={(event) => setDiagnosis({ ...diagnosis, bottleneckCode: event.target.value, bottleneckReason: t("userAdjusted"), bottleneckConfidence: 0 })}
                      className="mt-2 min-h-11 w-full rounded-xl border border-dark/15 bg-white px-3 text-sm font-normal"
                    >
                      {bottlenecks.map(([code, label]) => <option key={code} value={code}>{group} · {label}</option>)}
                    </select>
                  </label>
                </div>}
                {!confirmed && <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" disabled={blocked} onClick={() => { setConfirmed(true); setCorrecting(false); }} className="min-h-11 rounded-xl bg-dark px-5 py-2.5 text-sm font-bold text-white">{t("confirmDiagnosis")}</button>
                  <button type="button" disabled={blocked} onClick={() => setCorrecting(true)} className="min-h-11 rounded-xl border border-dark/15 px-5 py-2.5 text-sm font-bold text-dark">{t("correctDiagnosis")}</button>
                </div>}
                {confirmed && <button
                  type="button"
                  onClick={generate}
                  disabled={blocked}
                  className="mt-5 min-h-11 w-full rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? t("generating") : t("confirm")}
                </button>}
                {confirmed && <button type="button" disabled={blocked} onClick={() => { setConfirmed(false); setCorrecting(true); }} className="mt-3 text-sm font-semibold text-primary">{t("correctDiagnosis")}</button>}
              </div>
            )}

            {conflict && <button type="button" onClick={() => void begin()} className="mt-4 min-h-11 rounded-xl border px-4">{tGuide("reloadDraft")}</button>}
            {error && (
              <div role="alert" className="mt-5 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {!question && !diagnosis && !busy && !conflict && answers.length === 3 && (
              <button type="button" disabled={blocked} onClick={() => void callDiagnose(answers)} className="mt-3 min-h-11 rounded-xl bg-dark px-5 py-2.5 text-sm font-bold text-white">
                {t("continue")}
              </button>
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
