"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import type { RewardSummary } from "@/lib/rewards/service";
import { REWARD_RULES } from "@/lib/rewards/policy";
import { rewardRequest, useRewards } from "./RewardsProvider";
export default function RewardsCard() {
  const t = useTranslations("Rewards"), locale = useLocale() as Locale;
  const { data, error, update, refresh } = useRewards();
  const [visitError, setVisitError] = useState("");
  useEffect(() => {
    let active = true;
    rewardRequest<RewardSummary>("/api/rewards/visit", { method: "POST" }).then(summary => { if (active) update(summary); }).catch(cause => { if (active) setVisitError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [update]);
  async function retry() {
    try { update(await rewardRequest<RewardSummary>("/api/rewards/visit", { method: "POST" })); setVisitError(""); } catch (cause) { setVisitError(cause instanceof Error ? cause.message : String(cause)); }
  }
  const progress = data ? Math.min(data.balance / REWARD_RULES.redemptionPoints * 100, 100) : 0;
  return <section aria-labelledby="home-rewards-heading" className="min-w-0 rounded-2xl border border-dark/10 bg-white px-5 py-3">
    <Link href={pathForLocale("/dashboard/rewards", locale)} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2">
      <h2 id="home-rewards-heading" className="text-base font-bold">{t("title")} · <span className="tabular-nums">{data ? data.balance.toLocaleString() : "—"}</span> <span className="text-sm font-normal text-dark/60">{t("points")}</span></h2>
      <span className="text-xs text-dark/60">{data ? data.balance >= REWARD_RULES.redemptionPoints ? t("ready") : t("toNext", { points: REWARD_RULES.redemptionPoints - data.balance }) : t("loading")} →</span>
    </Link>
    <div role="progressbar" aria-label={t("progressAria")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="mt-1 h-1.5 overflow-hidden rounded-full bg-dark/5"><div className="h-full rounded-full bg-dark transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
    {(error || visitError) && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700"><p className="whitespace-pre-wrap break-words">{visitError || error}</p><button type="button" onClick={() => void (visitError ? retry() : refresh())} className="mt-1 min-h-11 underline">{t("retry")}</button></div>}
  </section>;
}
