"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { memberFetch } from "@/lib/member-fetch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { matchCopy } from "@/lib/matchmaking/schema";
import Image from "next/image";
import { countryLabel, industryLabel } from "@/lib/member-options";
import { useLocale, useTranslations } from "next-intl";
import type { PublicCard } from "@/lib/matchmaking/schema";

export function PrivatePhoto({ url, alt }: { url: string; alt: string }) {
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
  return <div className="relative aspect-square overflow-hidden rounded-xl bg-[#e9e9e6]">
    {src && <Image src={src} alt={alt} width={480} height={480} unoptimized className="h-full w-full object-cover object-center" />}
    {!src && !error && <p role="status" className="absolute inset-0 flex items-center justify-center p-4 text-sm">{t("loadingPhoto")}</p>}
    {error && <div role="alert" className="absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-4 text-xs text-red-800"><p>{error}</p><button type="button" className="mt-3 min-h-11 rounded-lg border border-dark/20 bg-white px-4 text-sm" onClick={() => setAttempt(value => value + 1)}>{t("retry")}</button></div>}
  </div>;
}
const actionButton = "inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-dark/20 bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
export function CardChatAction({ card, network }: { card: PublicCard; network: { enabled: boolean; invite: boolean } | null }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const [connection, setConnection] = useState(card.chat), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  if (!network?.enabled) return null;
  if (connection?.status === "blocked") return <p className="text-sm">{zh ? "此連結無法聊天" : "Chat unavailable"}</p>;
  if (connection?.status === "accepted" || connection?.status === "pending" && !connection.outgoing) return <Link className={actionButton} href={pathForLocale(`/dashboard/messages?connection=${connection.id}`, locale)}>{connection.status === "accepted" ? (zh ? "開啟聊天" : "Open chat") : (zh ? "回覆邀請" : "Respond to invitation")}</Link>;
  if (connection?.status === "pending") return <p role="status" className="flex min-h-11 items-center text-sm">{zh ? "等待對方接受" : "Chat request pending"}</p>;
  if (!network.invite) return <Link className={actionButton} href={pathForLocale("/dashboard/account#plan", locale)}>{zh ? "升級 NOVA 以邀請聊天" : "Upgrade to NOVA to request a chat"}</Link>;
  return <div>{error && <p role="alert" className="mb-2 whitespace-pre-wrap break-words text-sm text-red-800">{error}</p>}<button type="button" className={actionButton} disabled={busy} onClick={async () => { if (busy) return; setBusy(true); setError(""); try { const result = await memberFetch<{ id: string; status: string }>("/api/network/connections", { method: "POST", body: JSON.stringify({ profileId: card.id, conditions: [] }) }); const state = await memberFetch<{ connection: PublicCard["chat"] }>(`/api/network/profiles/${encodeURIComponent(card.id)}/connection`); setConnection(state.connection || { ...result, outgoing: true }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }}>{busy ? (zh ? "送出中…" : "Sending…") : "Request to chat"}</button></div>;
}
export default function CardView({ card, detail = false }: { card: PublicCard; detail?: boolean }) {
  const t = useTranslations("Matchmaking"), locale = useLocale(), zh = locale === "zh-tw";
  const copy = matchCopy(card, zh);
  return <article className="min-w-0 flex-1 rounded-2xl border border-dark/15 bg-white p-5">
    <div className={card.activity === "inactive" ? "opacity-60" : ""}>{card.photo ? <PrivatePhoto url={card.photo} alt={t("blurredPhoto")} /> : <div className="flex aspect-square items-center justify-center rounded-xl bg-neutral-100 text-4xl font-semibold" aria-label={t("noPhoto")}>{(card.displayName || card.companyName || t(`roles.${card.role}`)).slice(0, 1)}</div>}</div>
    <h2 className="mt-4 break-words text-xl font-semibold">{card.displayName || card.companyName || t(`roles.${card.role}`)}</h2>
    {card.displayName && card.companyName && <p className="mt-1 break-words text-sm">{card.companyName}</p>}
    <p className="mt-2 text-sm text-dark/65">{t(`roles.${card.role}`)}{card.country ? ` · ${countryLabel(card.country, locale)}` : ""}{card.verified ? " · ✓" : ""}</p>
    <p className="mt-4 text-sm font-semibold">{t("fields.looksFor")}</p><div className="mt-2 flex flex-wrap gap-2">{card.categories.map(c => <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs" key={c}>{t(`categories.${c}`)}</span>)}</div>
    {copy.reasons[0] && <p className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm">NOVA · {copy.reasons[0]}</p>}
    {detail && <dl className="mt-5 space-y-4 border-t border-dark/10 pt-4 text-sm">
      {card.industry && <div><dt className="font-semibold">{t("fields.industry")}</dt><dd>{industryLabel(card.industry, locale)}</dd></div>}
      {card.stage && <div><dt className="font-semibold">{zh ? "公司階段" : "Company stage"}</dt><dd>{card.stage}</dd></div>}
      {(["companyPitch", "slogan", "icp", "offers", "looksFor"] as const).map(k => card[k] ? <div key={k}><dt className="font-semibold">{t(`fields.${k}`)}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{card[k]}</dd></div> : null)}
      {card.markets?.length ? <div><dt className="font-semibold">{t("fields.markets")}</dt><dd>{card.markets.join(" · ")}</dd></div> : null}
      {card.stats && <div><dt className="font-semibold">{t("selfReported")}</dt><dd>{card.stats.interviews} {t("interviews")} · {card.stats.milestones} {t("milestones")}</dd></div>}
    </dl>}
  </article>;
}
