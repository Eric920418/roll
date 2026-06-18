"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export type QuizOptionView = { label: string; desc: string; icon: string };
export type QuizQuestionView = {
  id: string;
  prompt: string;
  subtitle: string;
  optionA: QuizOptionView;
  optionB: QuizOptionView;
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

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, "A" | "B">>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const total = questions.length;
  const q = questions[step];
  const isLast = step === total - 1;
  const current = answers[q.id];

  function choose(choice: "A" | "B") {
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-12 md:px-8">
      <div className="w-full max-w-3xl font-[family-name:var(--font-body)]">
        {/* 進度點 */}
        <div className="flex items-center gap-2">
          {questions.map((_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                i === step ? "bg-primary" : "bg-dark/15"
              }`}
            />
          ))}
        </div>

        <p className="mt-6 text-sm font-semibold tracking-[0.1em] text-dark/40 font-[family-name:var(--font-heading)]">
          {pad(step + 1)} / {pad(total)}
        </p>

        <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-[-0.03em] text-primary font-[family-name:var(--font-heading)] md:text-5xl">
          {q.prompt}
        </h1>
        <p className="mt-3 text-sm text-dark/55 md:text-base">{q.subtitle}</p>

        {/* 選項卡 */}
        <div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-2">
          <OptionCard
            option={q.optionA}
            selected={current === "A"}
            onSelect={() => choose("A")}
          />
          <OptionCard
            option={q.optionB}
            selected={current === "B"}
            onSelect={() => choose("B")}
          />
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
              className="inline-flex items-center gap-2 rounded-full border border-primary px-6 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/5 font-[family-name:var(--font-heading)]"
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
              className="inline-flex items-center gap-2 rounded-full border border-primary px-7 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40 font-[family-name:var(--font-heading)]"
            >
              {loading ? t("submitting") : t("seeResult")}
              {!loading && <ArrowIcon dir="right" filled />}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!current}
              className="inline-flex items-center gap-2 rounded-full border border-primary px-7 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40 font-[family-name:var(--font-heading)]"
            >
              {t("next")}
              <ArrowIcon dir="right" filled />
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function OptionCard({
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
      className={`flex flex-col items-start rounded-2xl border-2 p-6 text-left transition-all ${
        selected
          ? "border-primary bg-primary text-white shadow-[0_18px_40px_-18px_rgba(123,26,44,0.5)]"
          : "border-primary/20 bg-white text-dark hover:border-primary/50"
      }`}
    >
      <span
        className={`mb-5 inline-flex h-10 w-10 items-center justify-center ${
          selected ? "text-white" : "text-primary"
        }`}
      >
        <OptionIcon name={option.icon} />
      </span>
      <span className="text-xl font-bold tracking-[-0.01em] font-[family-name:var(--font-heading)]">
        {option.label}
      </span>
      <span
        className={`mt-2 text-sm leading-snug ${
          selected ? "text-white/85" : "text-dark/60"
        }`}
      >
        {option.desc}
      </span>
    </button>
  );
}

function ArrowIcon({
  dir,
  filled,
}: {
  dir: "left" | "right";
  filled?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
        filled ? "bg-primary text-white" : ""
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={dir === "right" ? "M5 12h14M13 6l6 6-6 6" : "M19 12H5M11 18l-6-6 6-6"}
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

// 選項圖示（對齊設計圖：doc/bolt/flame/layers/telescope/target），未知回退圓點。
function OptionIcon({ name }: { name: string }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "doc":
      return (
        <svg {...common}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6M8 13h8M8 17h6" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
      );
    case "flame":
      return (
        <svg {...common}>
          <path d="M12 2c2 3 5 5 5 9a5 5 0 0 1-10 0c0-1.5.5-2.5 1.5-3.5C9 9 9.5 7 12 2z" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="M12 3 2 8l10 5 10-5z" />
          <path d="M2 13l10 5 10-5" />
        </svg>
      );
    case "telescope":
      return (
        <svg {...common}>
          <path d="m3 14 7-2 1 4-7 2zM10 12l8-3 2 4-8 3zM13 17l3 4M9 19l-2 3" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="0.5" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="6" />
        </svg>
      );
  }
}
