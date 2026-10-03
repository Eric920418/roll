"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardUser } from "./DashboardUserProvider";
import { notifyPlanChanged } from "./PlanRefresh";
import { missingGuideFields } from "@/lib/getting-started/state";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { COMPANY_STAGES } from "@/lib/action-plan/constants";
import { PRIMARY_NEEDS } from "@/lib/icp/schema";
import { resolveAuthError } from "@/components/auth/error-codes";
import {
  INDUSTRIES,
  COMPANY_SIZES,
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
  oneLinePitch?: string | null;
  companyStage?: string | null;
  primaryNeed?: string | null;
  needs?: string[];
  timeline?: string | null;
  budgetRange?: string | null;
  notes?: string | null;
};

const fieldClass =
  "w-full rounded-xl border border-dark/10 bg-dark/[0.03] px-4 py-3 text-sm text-dark outline-none transition focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]";

const labelClass =
  "text-sm font-semibold text-dark font-[family-name:var(--font-heading)]";

// needs（服務需求）仍保留在帳號頁：Tools 落地清單依此欄位個人化生成。
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
  initial, guided = false, canGenerate = false,
}: {
  initial: ProfileInitial; guided?: boolean; canGenerate?: boolean;
}) {
  const t = useTranslations("Dashboard.account");
  const tGuide = useTranslations("Dashboard.gettingStarted");
  const userId = useDashboardUser();
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  const tIcp = useTranslations("Dashboard.icp");
  const locale = useLocale() as Locale;
  const tOpt = useTranslations("Auth.options");
  const tErr = useTranslations("Auth.errors");
  const router = useRouter();

  const [companyName, setCompanyName] = useState(initial.companyName ?? "");
  const [industry, setIndustry] = useState(initial.industry ?? "");
  const [companySize, setCompanySize] = useState(initial.companySize ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [oneLinePitch, setOneLinePitch] = useState(initial.oneLinePitch ?? "");
  const [companyStage, setCompanyStage] = useState(initial.companyStage ?? "");
  const [primaryNeed, setPrimaryNeed] = useState(initial.primaryNeed ?? "");
  const [needs, setNeeds] = useState<string[]>(initial.needs ?? []);
  const [timeline, setTimeline] = useState(initial.timeline ?? "");
  const [budgetRange, setBudgetRange] = useState(initial.budgetRange ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");

  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!guided) return;
    const field = missingGuideFields(initial)[0];
    const target = formRef.current?.querySelector<HTMLElement>(`[name="${field || "companyName"}"]`);
    target?.focus(); target?.scrollIntoView({ block: "center" });
  }, [guided, initial]);

  const toggle =
    (set: React.Dispatch<React.SetStateAction<string[]>>) => (slug: string) =>
      set((prev) =>
        prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug],
      );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return; savingRef.current = true;
    setError("");
    setSaved(false);
    setLoading(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: guided ? { companyName, oneLinePitch, companyStage, primaryNeed } : {
            companyName,
            industry,
            companySize,
            website,
            country,
            oneLinePitch,
            companyStage,
            primaryNeed,
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
      notifyPlanChanged(userId || undefined);
      router.refresh(); // 讓 server component（側欄/總覽）重新讀取最新資料
    } catch (err) {
      setError(err instanceof Error ? err.message : tErr("generic"));
    } finally {
      savingRef.current = false; setLoading(false);
    }
  }

  if (guided) return <form ref={formRef} id="profile" onSubmit={handleSubmit} className="mt-7 space-y-5 rounded-3xl border border-sky-200 bg-sky-50/50 p-5 sm:p-7">
    <div><p className="text-xs font-bold text-sky-800">{tGuide("step", { number: 1 })}</p><h2 className="mt-2 text-2xl font-bold">{tGuide("step1Title")}</h2><p className="mt-2 text-sm text-dark/65">{tGuide("profileHintBody")}</p></div>
    <label className="block"><span className={labelClass}>{t("companyName")}</span><input name="companyName" value={companyName} onChange={e => { setCompanyName(e.target.value); setSaved(false); }} className={`${fieldClass} mt-2`} /></label>
    <label className="block"><span className={labelClass}>{tIcp("pitch")}</span><input name="oneLinePitch" maxLength={300} value={oneLinePitch} onChange={e => { setOneLinePitch(e.target.value); setSaved(false); }} className={`${fieldClass} mt-2`} /></label>
    <div className="grid gap-5 sm:grid-cols-2">
      <label><span className={labelClass}>{tIcp("companyStage")}</span><select name="companyStage" value={companyStage} onChange={e => { setCompanyStage(e.target.value); setSaved(false); }} className={`${fieldClass} mt-2`}><option value="">{t("selectPlaceholder")}</option>{COMPANY_STAGES.map(stage => <option key={stage} value={stage}>{tIcp(`stages.${stage}`)}</option>)}</select></label>
      <label><span className={labelClass}>{tIcp("primaryNeed")}</span><select name="primaryNeed" value={primaryNeed} onChange={e => { setPrimaryNeed(e.target.value); setSaved(false); }} className={`${fieldClass} mt-2`}><option value="">{t("selectPlaceholder")}</option>{PRIMARY_NEEDS.map(need => <option key={need} value={need}>{tIcp(`needs.${need}`)}</option>)}</select></label>
    </div>
    {error && <p role="alert" className="whitespace-pre-wrap rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {saved && <p role="status" className="text-sm text-green-800">{tGuide("profileSaved")}</p>}
    <div className="flex flex-wrap items-center gap-4"><button type="submit" disabled={loading} className="min-h-11 rounded-xl bg-dark px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{loading ? t("saving") : t("save")}</button>{saved && <Link className="inline-flex min-h-11 items-center text-sm font-bold underline" href={pathForLocale(canGenerate ? "/dashboard/agenda?guide=build" : "/dashboard/account#plan", locale)}>{tGuide(canGenerate ? "buildPlan" : "viewPlanOptions")} →</Link>}</div>
    <Link className="inline-flex min-h-11 items-center text-sm underline" href={pathForLocale("/dashboard/account#profile", locale)}>{tGuide("otherDetails")}</Link>
  </form>;

  return (
    <form id="profile" onSubmit={handleSubmit} className="mt-7 flex flex-col gap-8">
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
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{tIcp("pitch")}</span>
          <textarea aria-label={tIcp("pitch")} value={oneLinePitch} onChange={event => setOneLinePitch(event.target.value)} maxLength={500} rows={2} className={fieldClass} />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5"><span className={labelClass}>{tIcp("companyStage")}</span>
            <select aria-label={tIcp("companyStage")} value={companyStage} onChange={event => setCompanyStage(event.target.value)} className={fieldClass}>
              <option value="">{t("selectPlaceholder")}</option>{COMPANY_STAGES.map(stage => <option key={stage} value={stage}>{tIcp(`stages.${stage}`)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5"><span className={labelClass}>{tIcp("primaryNeed")}</span>
            <select aria-label={tIcp("primaryNeed")} value={primaryNeed} onChange={event => setPrimaryNeed(event.target.value)} className={fieldClass}>
              <option value="">{t("selectPlaceholder")}</option>{PRIMARY_NEEDS.map(need => <option key={need} value={need}>{tIcp(`needs.${need}`)}</option>)}
            </select>
          </label>
        </div>
        <Link href={pathForLocale("/dashboard/profile", locale)} className="text-sm font-semibold text-primary underline">{tIcp("editLink")}</Link>
      </section>

      {/* 進入需求 */}
      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
          {t("requirementsSection")}
        </h2>
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
