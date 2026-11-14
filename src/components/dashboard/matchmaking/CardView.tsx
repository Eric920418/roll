"use client";
import { memberRoles } from "@/lib/matchmaking/roles";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { matchCopy } from "@/lib/matchmaking/schema";
import Image from "next/image";
import { countryLabel, industryLabel } from "@/lib/member-options";
import { useLocale, useTranslations } from "next-intl";
import type { PublicCard } from "@/lib/matchmaking/schema";

export function PrivatePhoto({ url, alt, avatar = false }: { url: string; alt: string; avatar?: boolean }) {
  const t = useTranslations("Matchmaking");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ url: "", attempt: -1, src: "", error: "" });
  const { src, error } = result.url === url && result.attempt === attempt ? result : { src: "", error: "" };
  useEffect(() => {
    const abort = new AbortController(); let objectUrl = "";
    void (async () => {
      try {
        const response = await fetch(url, { cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}\n${await response.text()}`);
        objectUrl = URL.createObjectURL(await response.blob());
        if (!abort.signal.aborted) setResult({ url, attempt, src: objectUrl, error: "" }); else URL.revokeObjectURL(objectUrl);
      } catch (cause) { if (!abort.signal.aborted) setResult({ url, attempt, src: "", error: cause instanceof Error ? cause.message : String(cause) }); }
    })();
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, attempt]);
  return <div className={avatar ? "relative size-11 rounded-full bg-[#e9e9e6]" : "relative aspect-square overflow-hidden rounded-xl bg-[#e9e9e6]"}>
    {src && <Image src={src} alt={alt} width={480} height={480} unoptimized className={"h-full w-full object-cover object-center " + (avatar ? "rounded-full" : "")} />}
    {!src && !error && <p role="status" className={avatar ? "sr-only" : "absolute inset-0 flex items-center justify-center p-4 text-sm"}>{t("loadingPhoto")}</p>}
    {error && <div role="alert" className={avatar ? "absolute left-0 top-0 z-20 max-h-64 w-64 max-w-[70vw] overflow-auto rounded-xl border border-red-200 bg-white p-3 whitespace-pre-wrap break-words text-xs text-red-800" : "absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-4 text-xs text-red-800"}><p>{error}</p><button type="button" className="mt-3 min-h-11 rounded-lg border border-dark/20 bg-white px-4 text-sm" onClick={() => setAttempt(value => value + 1)}>{t("retry")}</button></div>}
  </div>;
}
const actionButton = "inline-flex min-h-11 items-center justify-center rounded-full border border-dark/20 bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
export function CardChatAction({ card, network, compact = false }: { compact?: boolean; card: PublicCard; network: { enabled: boolean; invite: boolean; pricing?: { inviteFee: number } } | null }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const connection = card.chat;
  if (!network?.enabled) return null;
  if (connection?.status === "blocked") return <p className="text-sm">{zh ? "此連結無法聊天" : "Chat unavailable"}</p>;
  if (connection?.status === "accepted" || connection?.status === "pending") return <Link className={actionButton} href={pathForLocale(`/dashboard/messages?connection=${connection.id}`, locale)}>{connection.status === "accepted" ? (zh ? "開啟聊天" : "Open chat") : (zh ? "查看邀請" : "View invitation")}</Link>;
  return <Link className={actionButton} href={pathForLocale(network.invite ? `/dashboard/matchmaking/${card.id}` : "/dashboard/account#plan", locale)}>{network.invite ? (zh ? "提出交流" : (compact ? "Connect" : "Request to chat")) : (zh ? "查看 NOVA 方案" : "View NOVA plans")}</Link>;
}
export default function CardView({ card, detail = false, footer, row = false }: { card: PublicCard; detail?: boolean; footer?: ReactNode; row?: boolean }) {
  const t = useTranslations("Matchmaking"), locale = useLocale(), zh = locale === "zh-tw";
  const copy = matchCopy(card, zh);
  if (!detail) return <article className={row ? "flex min-w-0 items-center gap-3 border-t border-dark/10 py-2" : "flex min-w-0 flex-1 flex-col rounded-xl border border-dark/10 bg-white p-4"}>
    <div className={row ? "flex min-w-0 flex-1 items-center gap-3" : "flex items-start gap-3"}>
      <div className="w-11 shrink-0 rounded-full" aria-label={card.photo ? undefined : t("noPhoto")}>{card.photo ? <PrivatePhoto url={card.photo} alt={t("blurredPhoto")} avatar /> : <div className="flex size-11 items-center justify-center rounded-full bg-neutral-200 text-base font-semibold">{(card.displayName || card.companyName || t(`roles.${card.role}`)).slice(0, 1)}</div>}</div>
      <div className="min-w-0 flex-1"><h2 className="break-words text-sm font-semibold">{card.displayName || card.companyName || t(`roles.${card.role}`)}</h2><p className="mt-1 text-[11px] text-dark/55">{memberRoles(card).map(role => t(`roles.${role}`)).join(" · ")}{card.country ? ` · ${countryLabel(card.country, locale)}` : ""}</p></div>
      {!row && card.activity && card.activity !== "inactive" && <span className="text-[10px] text-green-800">{card.activity === "week" ? (zh ? "一週內活躍" : "Active this week") : (zh ? "本月活躍" : "Active this month")}</span>}
    </div>
    {!row && <><p className="mt-4 line-clamp-3 whitespace-pre-wrap break-words text-[11px] leading-5 text-dark/70">{card.slogan || card.companyPitch || (zh ? "介紹尚未公開" : "Introduction not public")}</p>{card.mentorCertified && <p className="mt-1 text-[11px] font-semibold">{zh ? "導師" : "Mentor"}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-3 text-[11px] leading-5">{([['looksFor', zh ? '正在尋找' : 'Looking for'], ['offers', zh ? '可以提供' : 'Can offer']] as const).map(([key,label]) => <div className="min-w-0" key={key}><dt className="text-dark/45">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words font-semibold">{card[key] || (zh ? '未公開' : 'Not public')}</dd></div>)}</dl>
      <div className="mt-3 rounded-lg bg-dark/[0.035] p-3 text-[11px] leading-5"><p className="text-dark/50">{zh ? "為何適合交流" : "Why connect"}</p>{copy.reasons.length ? <ul className="list-disc pl-4">{copy.reasons.slice(0,3).map(reason => <li key={reason}>{reason}</li>)}</ul> : <p>{zh ? "查看公開檔案，確認交流方向。" : "Review the public profile to explore a connection."}</p>}</div></>}
    {footer && <div className={row ? "max-w-[48%] shrink-0" : "mt-auto flex flex-wrap items-center justify-between gap-2 pt-3"}>{footer}</div>}
  </article>;
  return <article className="min-w-0 flex-1 rounded-2xl border border-dark/15 bg-white p-5">
    <div className={card.activity === "inactive" ? "opacity-60" : ""}>{card.photo ? <PrivatePhoto url={card.photo} alt={t("blurredPhoto")} /> : <div className="flex aspect-square items-center justify-center rounded-xl bg-neutral-100 text-4xl font-semibold" aria-label={t("noPhoto")}>{(card.displayName || card.companyName || t(`roles.${card.role}`)).slice(0, 1)}</div>}</div>
    <h2 className="mt-4 break-words text-xl font-semibold">{card.displayName || card.companyName || t(`roles.${card.role}`)}</h2>
    {card.displayName && card.companyName && <p className="mt-1 break-words text-sm">{card.companyName}</p>}
    <p className="mt-2 text-sm text-dark/65">{memberRoles(card).map(role => t(`roles.${role}`)).join(" · ")}{card.country ? ` · ${countryLabel(card.country, locale)}` : ""}{card.verified ? " · ✓" : ""}{card.mentorCertified ? (locale === "zh-tw" ? " · 導師" : " · Mentor") : ""}</p>
    <p className="mt-4 text-sm font-semibold">{t("fields.looksFor")}</p><div className="mt-2 flex flex-wrap gap-2">{card.categories.map(c => <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs" key={c}>{t(`categories.${c}`)}</span>)}</div>
    {copy.reasons[0] && <p className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm">{zh ? "為何適合交流" : "Why connect"} · {copy.reasons.join(zh ? "；" : "; ")}</p>}
    {detail && <dl className="mt-5 space-y-4 border-t border-dark/10 pt-4 text-sm">
      {card.industry && <div><dt className="font-semibold">{t("fields.industry")}</dt><dd>{industryLabel(card.industry, locale)}</dd></div>}
      {card.stage && <div><dt className="font-semibold">{zh ? "公司階段" : "Company stage"}</dt><dd>{card.stage}</dd></div>}
      {(["companyPitch", "slogan", "icp", "offers", "looksFor"] as const).map(k => card[k] ? <div key={k}><dt className="font-semibold">{t(`fields.${k}`)}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{card[k]}</dd></div> : null)}
      {card.markets?.length ? <div><dt className="font-semibold">{t("fields.markets")}</dt><dd>{card.markets.join(" · ")}</dd></div> : null}
      {card.stats && <div><dt className="font-semibold">{t("selfReported")}</dt><dd>{card.stats.interviews} {t("interviews")} · {card.stats.milestones} {t("milestones")}</dd></div>}
    </dl>}
  </article>;
}
