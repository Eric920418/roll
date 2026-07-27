"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type Q = { id: string; question: string; options: string[] };
type Dual = { en: string; "zh-tw": string };
type ResultItem = {
  questionId: string;
  correct: boolean;
  chosen: number;
  answerIndex: number;
  explanation: Dual | null;
};
type QuizResp = { score: number; total: number; results: ResultItem[] };

// 本期雙週問答作答（單選、可回看正解）。借用 quiz 互動概念但獨立實作，不綁 onboarding。
export default function PlaybookQuizClient({ questions }: { questions: Q[] }) {
  const t = useTranslations("Dashboard.playbooks.quiz");
  const locale = useLocale();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<QuizResp | null>(null);

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);
  const resultById = result ? new Map(result.results.map((r) => [r.questionId, r])) : null;

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/playbooks/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: Object.entries(answers).map(([questionId, choice]) => ({ questionId, choice })),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || t("error"));
      setResult(j.data as QuizResp);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      {result && (
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.03] p-6">
          <p className="text-lg font-extrabold text-dark font-[family-name:var(--font-heading)]">
            {t("score", { score: result.score, total: result.total })}
          </p>
        </div>
      )}

      {questions.map((q, qi) => {
        const r = resultById?.get(q.id);
        return (
          <div key={q.id} className="rounded-2xl border border-dark/10 bg-white p-6">
            <p className="text-sm font-semibold text-dark">
              {qi + 1}. {q.question}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {q.options.map((opt, oi) => {
                const chosen = answers[q.id] === oi;
                let cls = "border-dark/15 text-dark/80 hover:bg-dark/[0.03]";
                if (r) {
                  if (oi === r.answerIndex) cls = "border-green-500 bg-green-50 text-dark";
                  else if (oi === r.chosen) cls = "border-red-400 bg-red-50 text-dark";
                  else cls = "border-dark/10 text-dark/50";
                } else if (chosen) {
                  cls = "border-primary bg-primary/5 text-dark";
                }
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={!!result}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    className={`rounded-xl border px-4 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${cls}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {r && (
              <p className="mt-2 text-xs leading-relaxed text-dark/60">
                <span className={r.correct ? "font-bold text-green-600" : "font-bold text-red-500"}>
                  {r.correct ? `✓ ${t("correct")}` : `✗ ${t("wrong")}`}
                </span>
                {r.explanation
                  ? ` — ${locale === "zh-tw" ? r.explanation["zh-tw"] : r.explanation.en}`
                  : ""}
              </p>
            )}
          </div>
        );
      })}

      {!result && (
        <div>
          {error && (
            <p className="mb-2 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !allAnswered}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50 font-[family-name:var(--font-heading)]"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
        </div>
      )}
    </div>
  );
}
