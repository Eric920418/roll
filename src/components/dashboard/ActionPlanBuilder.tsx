"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { BOTTLENECKS, COMPANY_STAGES, type BottleneckGroup } from "@/lib/action-plan/constants";
import type { Diagnosis } from "@/lib/action-plan/schemas";
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
    throw new Error([fallback, status, body.trim()].filter(Boolean).join("\n"));
  }
}

export default function ActionPlanBuilder({
  messages = [],
  variant = "build",
  onGenerated,
  triggerClassName,
}: {
  messages?: Message[];
  variant?: "build" | "regenerate";
  onGenerated?: () => void;
  triggerClassName?: string;
}) {
  const t = useTranslations("Dashboard.actionPlan.builder");
  const locale = useLocale() === "zh-tw" ? "zh-tw" : "en";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState("");

  const group = (diagnosis?.bottleneckGroup ?? "Product") as BottleneckGroup;
  const bottlenecks = useMemo(() => BOTTLENECKS[group], [group]);

  async function callDiagnose(nextAnswers: Answer[]) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/action-plans/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, messages: messages.slice(-30), answers: nextAnswers }),
      });
      const json = await readApiResponse<DiagnoseData>(response, t("genericError"));
      if (!response.ok) throw new Error(json.error || t("genericError"));
      if (!json.data) throw new Error(t("genericError"));
      if (json.data.status === "needs_input") {
        setQuestion(json.data.question);
        setDiagnosis(null);
      } else {
        setQuestion("");
        setDiagnosis(json.data.diagnosis);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  function begin() {
    const id = crypto.randomUUID();
    setOpen(true);
    setQuestion("");
    setAnswer("");
    setAnswers([]);
    setDiagnosis(null);
    setRequestId(id);
    setError("");
    void callDiagnose([]);
  }

  async function submitAnswer(event: React.FormEvent) {
    event.preventDefault();
    const text = answer.trim();
    if (!text || !question) return;
    const next = [...answers, { question, answer: text }];
    setAnswers(next);
    setAnswer("");
    await callDiagnose(next);
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
    if (!diagnosis) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/action-plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          messages: messages.slice(-30),
          diagnosis,
          requestId,
          candidateCount: 24,
        }),
      });
      const json = await readApiResponse<unknown>(response, t("genericError"));
      if (!response.ok) throw new Error(json.error || t("genericError"));
      setOpen(false);
      onGenerated?.();
      router.push(pathForLocale("/dashboard/agenda", locale as Locale));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={begin}
        className={
          triggerClassName ??
          "inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-50 font-[family-name:var(--font-heading)]"
        }
      >
        {variant === "regenerate" ? t("regenerate") : t("build")}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-dark/45 p-3 backdrop-blur-sm sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
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
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label={t("close")}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-dark/10 text-xl text-dark/50 hover:bg-dark/[0.04] disabled:opacity-40"
              >
                ×
              </button>
            </div>

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
                  onChange={(event) => setAnswer(event.target.value)}
                  maxLength={4000}
                  required
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-dark/15 bg-white px-4 py-3 text-sm text-dark outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <button
                  type="submit"
                  disabled={busy || !answer.trim()}
                  className="mt-4 min-h-11 rounded-xl bg-dark px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? t("diagnosing") : t("continue")}
                </button>
              </form>
            )}

            {diagnosis && (
              <div className="mt-7">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold text-dark">
                    {t("stage")}
                    <select
                      value={diagnosis.companyStage}
                      onChange={(event) => changeStage(event.target.value as Diagnosis["companyStage"])}
                      className="mt-2 min-h-11 w-full rounded-xl border border-dark/15 bg-white px-3 text-sm font-normal"
                    >
                      {COMPANY_STAGES.map((stage) => <option key={stage}>{stage}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-bold text-dark">
                    {t("bottleneckGroup")}
                    <select
                      value={diagnosis.bottleneckGroup}
                      onChange={(event) => changeGroup(event.target.value as Diagnosis["bottleneckGroup"])}
                      className="mt-2 min-h-11 w-full rounded-xl border border-dark/15 bg-white px-3 text-sm font-normal"
                    >
                      {Object.keys(BOTTLENECKS).map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-bold text-dark sm:col-span-2">
                    {t("bottleneck")}
                    <select
                      value={diagnosis.bottleneckCode}
                      onChange={(event) => setDiagnosis({ ...diagnosis, bottleneckCode: event.target.value, bottleneckReason: t("userAdjusted"), bottleneckConfidence: 0 })}
                      className="mt-2 min-h-11 w-full rounded-xl border border-dark/15 bg-white px-3 text-sm font-normal"
                    >
                      {bottlenecks.map(([code, label]) => <option key={code} value={code}>{group} · {label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Evidence title={t("stageEvidence")} reason={diagnosis.stageReason} confidence={diagnosis.stageConfidence} confidenceLabel={t("confidence", { value: diagnosis.stageConfidence })} />
                  <Evidence title={t("bottleneckEvidence")} reason={diagnosis.bottleneckReason} confidence={diagnosis.bottleneckConfidence} confidenceLabel={t("confidence", { value: diagnosis.bottleneckConfidence })} />
                </div>
                <p className="mt-5 rounded-xl bg-accent/10 px-4 py-3 text-xs leading-5 text-dark/65">{t("confirmHint")}</p>
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy}
                  className="mt-5 min-h-11 w-full rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? t("generating") : t("confirm")}
                </button>
              </div>
            )}

            {error && (
              <div role="alert" className="mt-5 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Evidence({ title, reason, confidence, confidenceLabel }: { title: string; reason: string; confidence: number; confidenceLabel: string }) {
  return (
    <div className="rounded-2xl border border-dark/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-dark/45">{title}</p>
        {confidence > 0 && <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">{confidenceLabel}</span>}
      </div>
      <p className="mt-2 text-sm leading-6 text-dark/70">{reason}</p>
    </div>
  );
}
