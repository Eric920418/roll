"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import NovaLogo from "@/components/brand/NovaLogo";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import type { Choice } from "@/lib/quiz/match";

export type QuizOptionView = { key: Choice; label: string; desc: string };
export type QuizQuestionView = {
  id: string;
  prompt: string;
  subtitle: string;
  options: QuizOptionView[];
};

const pad = (n: number) => String(n).padStart(2, "0");

export default function QuizClient({
  questions,
}: {
  questions: QuizQuestionView[];
}) {
  const t = useTranslations("Quiz");
  const tErr = useTranslations("Auth.errors");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const productHref = pathForLocale("/product", locale);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Choice>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const total = questions.length;
  const q = questions[step];
  const isLast = step === total - 1;
  const current = q ? answers[q.id] : undefined;

  function choose(choice: Choice) {
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: choice }));
  }

  async function submit() {
    setError("");
    setLoading(true);
    try {
      const payload = {
        answers: questions.map((qq) => ({
          questionId: qq.id,
          choice: answers[qq.id],
        })),
      };
      const res = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || tErr("generic"));
      router.push(pathForLocale("/quiz/result", locale));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : tErr("generic"));
    } finally {
      setLoading(false);
    }
  }

  if (!q) {
    return (
      <main
        className="nova-theme flex min-h-screen items-center justify-center bg-white px-5"
        data-brand="nova"
      >
        <div className="text-center">
          <a href={productHref} className="inline-flex" aria-label="NOVA">
            <NovaLogo
              variant="black"
              className="h-auto w-[150px]"
              sizes="150px"
            />
          </a>
          <p className="mt-6 text-sm text-dark/50">No questions available.</p>
        </div>
      </main>
    );
  }

  const progress = ((step + 1) / total) * 100;

  return (
    <main
      className="nova-theme flex min-h-screen items-center justify-center bg-white px-5 py-12 md:px-8"
      data-brand="nova"
    >
      <div className="w-full max-w-2xl font-[family-name:var(--font-body)]">
        <div className="mb-10 flex items-end justify-between border-b border-dark/10 pb-5">
          <a href={productHref} className="inline-flex" aria-label="NOVA">
            <NovaLogo
              variant="black"
              className="h-auto w-[136px] md:w-[156px]"
              sizes="(min-width: 768px) 156px, 136px"
            />
          </a>
          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-dark/35">
            {t("byline")}
          </span>
        </div>

        {/* 進度條 + 計數 */}
        <div className="flex items-center gap-4">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-dark/10">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </span>
          <span className="shrink-0 text-xs font-bold tracking-[0.12em] text-dark/40 font-[family-name:var(--font-heading)]">
            {pad(step + 1)} / {pad(total)}
          </span>
        </div>

        <h1 className="mt-8 text-2xl font-extrabold leading-tight tracking-[-0.03em] text-primary font-[family-name:var(--font-heading)] md:text-4xl">
          {q.prompt}
        </h1>
        {q.subtitle && (
          <p className="mt-3 text-sm text-dark/55 md:text-base">{q.subtitle}</p>
        )}

        {/* 選項列 */}
        <div className="mt-8 flex flex-col gap-3 md:mt-10">
          {q.options.map((o) => (
            <OptionRow
              key={o.key}
              option={o}
              selected={current === o.key}
              onSelect={() => choose(o.key)}
            />
          ))}
        </div>

        {error && (
          <p className="mt-6 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {/* 導覽 */}
        <div className="mt-10 flex items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-6 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/5 font-[family-name:var(--font-heading)]"
            >
              <ArrowIcon dir="left" />
              {t("back")}
            </button>
          ) : (
            <span />
          )}

          {isLast ? (
            <button
              type="button"
              onClick={submit}
              disabled={!current || loading}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40 font-[family-name:var(--font-heading)]"
            >
              {loading ? t("submitting") : t("seeResult")}
              {!loading && <ArrowIcon dir="right" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!current}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40 font-[family-name:var(--font-heading)]"
            >
              {t("next")}
              <ArrowIcon dir="right" />
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function OptionRow({
  option,
  selected,
  onSelect,
}: {
  option: QuizOptionView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all md:p-5 ${
        selected
          ? "border-primary bg-primary/[0.05] shadow-[0_14px_36px_-20px_rgba(0,0,0,0.35)]"
          : "border-dark/10 bg-white hover:border-primary/40 hover:bg-primary/[0.02]"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold transition-colors font-[family-name:var(--font-heading)] ${
          selected
            ? "bg-primary text-white"
            : "border-2 border-dark/15 text-dark/45 group-hover:border-primary/40 group-hover:text-primary"
        }`}
      >
        {option.key}
      </span>
      <span className="min-w-0">
        <span
          className={`block text-base font-bold tracking-[-0.01em] font-[family-name:var(--font-heading)] md:text-lg ${
            selected ? "text-primary" : "text-dark"
          }`}
        >
          {option.label}
        </span>
        {option.desc && (
          <span className="mt-0.5 block text-sm leading-snug text-dark/55">
            {option.desc}
          </span>
        )}
      </span>
    </button>
  );
}

function ArrowIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={dir === "right" ? "M5 12h14M13 6l6 6-6 6" : "M19 12H5M11 18l-6-6 6-6"}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
