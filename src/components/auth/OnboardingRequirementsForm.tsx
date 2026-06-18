"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import AuthButton from "./AuthButton";
import { resolveAuthError } from "./error-codes";
import { MARKETS, NEEDS, TIMELINES, BUDGETS } from "./onboarding-options";

type Initial = {
  targetMarkets?: string[];
  needs?: string[];
  timeline?: string | null;
  budgetRange?: string | null;
  notes?: string | null;
};

const selectClass =
  "w-full rounded-xl border border-dark/10 bg-dark/[0.03] px-4 py-3 text-sm text-dark outline-none transition focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]";

function ChipGroup({
  options,
  selected,
  onToggle,
  renderLabel,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (slug: string) => void;
  renderLabel: (slug: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((slug) => {
        const active = selected.includes(slug);
        return (
          <button
            key={slug}
            type="button"
            onClick={() => onToggle(slug)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors font-[family-name:var(--font-heading)] ${
              active
                ? "border-primary bg-primary text-white"
                : "border-dark/15 bg-white text-dark/70 hover:border-primary/40"
            }`}
          >
            {renderLabel(slug)}
          </button>
        );
      })}
    </div>
  );
}

export default function OnboardingRequirementsForm({
  initial,
}: {
  initial: Initial;
}) {
  const t = useTranslations("Auth.requirements");
  const tStep = useTranslations("Auth.steps");
  const tErr = useTranslations("Auth.errors");
  const tOpt = useTranslations("Auth.options");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [markets, setMarkets] = useState<string[]>(initial.targetMarkets ?? []);
  const [needs, setNeeds] = useState<string[]>(initial.needs ?? []);
  const [timeline, setTimeline] = useState(initial.timeline ?? "");
  const [budgetRange, setBudgetRange] = useState(initial.budgetRange ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const toggle =
    (set: React.Dispatch<React.SetStateAction<string[]>>) => (slug: string) =>
      set((prev) =>
        prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug],
      );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "requirements",
          data: {
            targetMarkets: markets,
            needs,
            timeline,
            budgetRange,
            notes,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          resolveAuthError(json.code, json.error || tErr("generic"), (k) =>
            tErr(k),
          ),
        );
      }
      router.push(pathForLocale("/quiz", locale));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : tErr("generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="font-[family-name:var(--font-body)]">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary font-[family-name:var(--font-heading)]">
        {tStep("stepLabel", { current: 3, total: 3 })}
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)] md:text-[2rem]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
            {t("targetMarkets")}
          </span>
          <ChipGroup
            options={MARKETS}
            selected={markets}
            onToggle={toggle(setMarkets)}
            renderLabel={(s) => tOpt(`markets.${s}`)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
            {t("needs")}
          </span>
          <ChipGroup
            options={NEEDS}
            selected={needs}
            onToggle={toggle(setNeeds)}
            renderLabel={(s) => tOpt(`needs.${s}`)}
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
            {t("timeline")}
          </span>
          <select
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            className={selectClass}
          >
            <option value="">{t("timelinePlaceholder")}</option>
            {TIMELINES.map((s) => (
              <option key={s} value={s}>
                {tOpt(`timeline.${s}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
            {t("budgetRange")}
          </span>
          <select
            value={budgetRange}
            onChange={(e) => setBudgetRange(e.target.value)}
            className={selectClass}
          >
            <option value="">{t("budgetRangePlaceholder")}</option>
            {BUDGETS.map((s) => (
              <option key={s} value={s}>
                {tOpt(`budget.${s}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
            {t("notes")}
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            rows={3}
            className={`${selectClass} resize-none placeholder:text-dark/35`}
          />
        </label>

        {error && (
          <p className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-1 flex items-center gap-3">
          <a
            href={pathForLocale("/onboarding/company", locale)}
            className="shrink-0 rounded-xl border border-dark/15 px-5 py-3.5 text-sm font-semibold text-dark/70 transition-colors hover:bg-dark/[0.03] font-[family-name:var(--font-heading)]"
          >
            {t("back")}
          </a>
          <div className="flex-1">
            <AuthButton loading={loading}>
              {loading ? t("submitting") : t("finish")}
            </AuthButton>
          </div>
        </div>
      </form>
    </div>
  );
}
