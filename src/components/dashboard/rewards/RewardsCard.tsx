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
  return <section aria-labelledby="home-rewards-heading" className="min-w-0 rounded-2xl border border-dark/10 bg-white p-5">
    <div className="flex items-center justify-between gap-3">
      <h2 id="home-rewards-heading" className="text-lg font-extrabold tracking-normal font-[family-name:var(--font-heading)]">{t("title")}</h2>
      <Link href={pathForLocale("/dashboard/rewards", locale)} className="inline-flex min-h-11 items-center text-xs font-semibold text-dark/60 hover:text-dark">{t("view")} →</Link>
    </div>
    <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
      <p className="flex min-w-0 items-baseline gap-2"><span className="text-[4.5rem] leading-none font-extrabold tracking-[-0.04em] tabular-nums [overflow-wrap:anywhere]">{data ? data.balance.toLocaleString() : "—"}</span><span className="text-sm text-dark/50">{t("points")}</span></p>
      <p className="pb-1 text-xs text-dark/60">{data ? data.balance >= 100 ? t("ready") : t("toNext", { points: 100 - data.balance }) : t("loading")}</p>
    </div>
    <div role="progressbar" aria-label={t("progressAria")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={data ? Math.min(data.balance, 100) : 0} className="mt-3 h-2 overflow-hidden rounded-full bg-dark/10"><div className="h-full rounded-full bg-dark transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
    <div className="mt-2 flex justify-between gap-2 text-[11px] text-dark/50"><span>{t("nextReward")}</span><span>{t("rewardPack")}</span></div>
    <div className="mt-3 border-t border-dark/10 pt-3">
      <div className="flex justify-between gap-2 text-xs font-bold"><span>{t("today")}</span><span className="text-dark/50">{data?.visitedToday ? t("visitClaimed") : t("visitPending")}</span></div>
      {data?.opportunities[0] ? <Link href={pathForLocale(data.opportunities[0].href, locale)} className="mt-2 flex min-h-11 items-center justify-between gap-3 rounded-xl bg-dark/[0.035] px-3 py-2 text-sm font-semibold hover:bg-dark/[0.065]"><span className="min-w-0 truncate">{data.opportunities[0].kind === "action" ? data.opportunities[0].title : t(`opportunity.${data.opportunities[0].kind}`)}</span><span className="shrink-0 text-xs">+{data.opportunities[0].points} →</span></Link> : data ? <p className="mt-2 text-xs leading-5 text-dark/55">{t("allDone")}</p> : null}
      <Link href={pathForLocale("/dashboard/rewards#reminder", locale)} className="inline-flex min-h-11 items-center text-xs font-semibold text-dark/55 hover:text-dark">◷ {data?.reminder?.enabled ? t("reminderActive", { time: data.reminder.time }) : t("setReminder")} →</Link>
    </div>
    {(error || visitError) && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700"><p className="whitespace-pre-wrap break-words">{visitError || error}</p><button type="button" onClick={() => void (visitError ? retry() : refresh())} className="mt-1 min-h-11 underline">{t("retry")}</button></div>}
  </section>;
}
