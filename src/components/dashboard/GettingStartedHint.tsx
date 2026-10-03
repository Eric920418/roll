"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { useGettingStarted } from "./GettingStartedHome";
export default function GettingStartedHint({ mode }: { mode: "profile" | "next" }) {
  const { view, error, reload } = useGettingStarted(), t = useTranslations("Dashboard.gettingStarted"), locale = useLocale() as Locale;
  if (error) return <div role="alert" className="mt-4 text-sm text-red-700">{error}<button className="ml-3 min-h-11 underline" onClick={() => void reload()}>{t("retry")}</button></div>;
  if (!view?.visible || (mode === "next" && view.hasPlan)) return null;
  return <aside className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm">
    <p className="font-bold">{t(mode === "profile" ? "profileHintTitle" : "nextHintTitle")}</p>
    <p className="mt-2 text-dark/65">{t(mode === "profile" ? "profileHintBody" : "nextHintBody")}</p>
    {mode === "profile" && view.missingFields.length > 0 && <><p className="mt-2">{t("missing")}: {view.missingFields.map(field => t(`fields.${field}`)).join("、")}</p><Link className="mt-2 inline-flex min-h-11 items-center font-bold underline" href={pathForLocale("/dashboard/account?guide=profile#profile", locale)}>{t("completeProfile")} →</Link></>}
    {mode === "profile" && view.missingFields.length === 0 && !view.hasPlan && <Link className="mt-2 inline-flex min-h-11 items-center font-bold underline" href={pathForLocale(view.canGenerate ? "/dashboard/agenda?guide=build" : "/dashboard/account#plan", locale)}>{t(view.canGenerate ? "buildPlan" : "viewPlanOptions")} →</Link>}
  </aside>;
}
