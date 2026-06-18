"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import AuthInput from "./AuthInput";
import AuthButton from "./AuthButton";
import { resolveAuthError } from "./error-codes";
import { INDUSTRIES, COMPANY_SIZES } from "./onboarding-options";

type Initial = {
  companyName?: string | null;
  industry?: string | null;
  companySize?: string | null;
  website?: string | null;
  country?: string | null;
};

const selectClass =
  "w-full rounded-xl border border-dark/10 bg-dark/[0.03] px-4 py-3 text-sm text-dark outline-none transition focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]";

export default function OnboardingCompanyForm({
  initial,
}: {
  initial: Initial;
}) {
  const t = useTranslations("Auth.company");
  const tStep = useTranslations("Auth.steps");
  const tErr = useTranslations("Auth.errors");
  const tOpt = useTranslations("Auth.options");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [companyName, setCompanyName] = useState(initial.companyName ?? "");
  const [industry, setIndustry] = useState(initial.industry ?? "");
  const [companySize, setCompanySize] = useState(initial.companySize ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "company",
          data: { companyName, industry, companySize, website, country },
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
      router.push(pathForLocale("/onboarding/requirements", locale));
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
        {tStep("stepLabel", { current: 2, total: 3 })}
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)] md:text-[2rem]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <AuthInput
          label={t("companyName")}
          name="companyName"
          value={companyName}
          onChange={setCompanyName}
          placeholder={t("companyNamePlaceholder")}
          autoComplete="organization"
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
            {t("industry")}
          </span>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className={selectClass}
          >
            <option value="">{t("industryPlaceholder")}</option>
            {INDUSTRIES.map((s) => (
              <option key={s} value={s}>
                {tOpt(`industry.${s}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
            {t("companySize")}
          </span>
          <select
            value={companySize}
            onChange={(e) => setCompanySize(e.target.value)}
            className={selectClass}
          >
            <option value="">{t("companySizePlaceholder")}</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {tOpt(`companySize.${s}`)}
              </option>
            ))}
          </select>
        </label>

        <AuthInput
          label={t("website")}
          name="website"
          type="url"
          value={website}
          onChange={setWebsite}
          placeholder={t("websitePlaceholder")}
          autoComplete="url"
        />
        <AuthInput
          label={t("country")}
          name="country"
          value={country}
          onChange={setCountry}
          placeholder={t("countryPlaceholder")}
          autoComplete="country-name"
        />

        {error && (
          <p className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-1">
          <AuthButton loading={loading}>
            {loading ? t("submitting") : t("continue")}
          </AuthButton>
        </div>
      </form>
    </div>
  );
}
