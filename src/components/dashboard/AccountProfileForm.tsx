"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { resolveAuthError } from "@/components/auth/error-codes";
import {
  INDUSTRIES,
  COMPANY_SIZES,
  MARKETS,
  NEEDS,
  TIMELINES,
  BUDGETS,
} from "@/components/auth/onboarding-options";

export type ProfileInitial = {
  companyName?: string | null;
  industry?: string | null;
  companySize?: string | null;
  website?: string | null;
  country?: string | null;
  targetMarkets?: string[];
  needs?: string[];
  timeline?: string | null;
  budgetRange?: string | null;
  notes?: string | null;
};

const fieldClass =
  "w-full rounded-xl border border-dark/10 bg-dark/[0.03] px-4 py-3 text-sm text-dark outline-none transition focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]";

const labelClass =
  "text-sm font-semibold text-dark font-[family-name:var(--font-heading)]";

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

export default function AccountProfileForm({
  initial,
}: {
  initial: ProfileInitial;
}) {
  const t = useTranslations("Dashboard.account");
  const tOpt = useTranslations("Auth.options");
  const tErr = useTranslations("Auth.errors");
  const router = useRouter();

  const [companyName, setCompanyName] = useState(initial.companyName ?? "");
  const [industry, setIndustry] = useState(initial.industry ?? "");
  const [companySize, setCompanySize] = useState(initial.companySize ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [markets, setMarkets] = useState<string[]>(initial.targetMarkets ?? []);
  const [needs, setNeeds] = useState<string[]>(initial.needs ?? []);
  const [timeline, setTimeline] = useState(initial.timeline ?? "");
  const [budgetRange, setBudgetRange] = useState(initial.budgetRange ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");

  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle =
    (set: React.Dispatch<React.SetStateAction<string[]>>) => (slug: string) =>
      set((prev) =>
        prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug],
      );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            companyName,
            industry,
            companySize,
            website,
            country,
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
      setSaved(true);
      router.refresh(); // 讓 server component（側欄/總覽）重新讀取最新資料
    } catch (err) {
      setError(err instanceof Error ? err.message : tErr("generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-8">
      {/* 公司資訊 */}
      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
          {t("companySection")}
        </h2>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t("companyName")}</span>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className={fieldClass}
          />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{t("industry")}</span>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className={fieldClass}
            >
              <option value="">{t("selectPlaceholder")}</option>
              {INDUSTRIES.map((s) => (
                <option key={s} value={s}>
                  {tOpt(`industry.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{t("companySize")}</span>
            <select
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              className={fieldClass}
            >
              <option value="">{t("selectPlaceholder")}</option>
              {COMPANY_SIZES.map((s) => (
                <option key={s} value={s}>
                  {tOpt(`companySize.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{t("website")}</span>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://"
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{t("country")}</span>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={fieldClass}
            />
          </label>
        </div>
      </section>

      {/* 進入需求 */}
      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
          {t("requirementsSection")}
        </h2>
        <div className="flex flex-col gap-2">
          <span className={labelClass}>{t("targetMarkets")}</span>
          <ChipGroup
            options={MARKETS}
            selected={markets}
            onToggle={toggle(setMarkets)}
            renderLabel={(s) => tOpt(`markets.${s}`)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className={labelClass}>{t("needs")}</span>
          <ChipGroup
            options={NEEDS}
            selected={needs}
            onToggle={toggle(setNeeds)}
            renderLabel={(s) => tOpt(`needs.${s}`)}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{t("timeline")}</span>
            <select
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              className={fieldClass}
            >
              <option value="">{t("selectPlaceholder")}</option>
              {TIMELINES.map((s) => (
                <option key={s} value={s}>
                  {tOpt(`timeline.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{t("budgetRange")}</span>
            <select
              value={budgetRange}
              onChange={(e) => setBudgetRange(e.target.value)}
              className={fieldClass}
            >
              <option value="">{t("selectPlaceholder")}</option>
              {BUDGETS.map((s) => (
                <option key={s} value={s}>
                  {tOpt(`budget.${s}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t("notes")}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            rows={3}
            className={`${fieldClass} resize-none placeholder:text-dark/35`}
          />
        </label>
      </section>

      {error && (
        <p className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {t("saved")}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60 font-[family-name:var(--font-heading)]"
        >
          {loading ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
