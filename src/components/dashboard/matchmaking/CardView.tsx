"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
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
export default function CardView({ card, detail = false }: { card: PublicCard; detail?: boolean }) {
  const t = useTranslations("Matchmaking");
  return <article className="min-w-0 flex-1 rounded-2xl border border-dark/15 bg-white p-4">
    <div className={card.activity === "inactive" ? "opacity-55" : ""}>{card.photo ? <PrivatePhoto url={card.photo} alt={t("blurredPhoto")} /> : <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-[#e9e9e6] text-sm text-dark/65">{t("noPhoto")}</div>}</div>
    <p className="mt-4 text-xs text-dark/65">{t(`roles.${card.role}`)}{card.country ? ` · ${card.country}` : ""}{card.industry ? ` · ${card.industry}` : ""}</p>
    <h2 className="mt-2 break-words text-xl font-semibold [overflow-wrap:anywhere]">{card.companyPitch || card.slogan || t(`roles.${card.role}`)}</h2>
    {card.companyPitch && <p className="mt-1 text-xs text-dark/65">{t("profileSource")}</p>}
    {card.icp && <p className="mt-3 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]"><span className="font-semibold">ICP · </span>{card.icp}</p>}
    {card.markets?.length ? <p className="mt-2 break-words text-sm">{t("fields.markets")} · {card.markets.join(" · ")}</p> : null}
    <div className="mt-3 flex flex-wrap gap-2 text-xs">
      <span className="rounded border border-dark/15 px-2 py-1"><span aria-hidden="true" className={card.activity === "week" ? "text-green-700" : card.activity === "month" ? "text-amber-700" : "text-gray-600"}>● </span>{t(`activity.${card.activity}`)}</span>
      {card.verified && <span className="rounded border border-dark/20 px-2 py-1">{t(card.role === "investor" ? "verifiedInvestor" : "verifiedBuyer")}</span>}
      {card.recommended && <span className="rounded border border-dark/20 px-2 py-1">Roll On Recommended</span>}
    </div>
    {card.stats && <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-dark/10 pt-3 text-sm">
      <div><dt className="text-xs text-dark/65">{t("interviews")}</dt><dd className="mt-1 text-xl font-semibold">{card.stats.interviews}</dd></div>
      <div><dt className="text-xs text-dark/65">{t("milestones")}</dt><dd className="mt-1 text-xl font-semibold">{card.stats.milestones}</dd></div>
      {card.stats.payingCustomers !== null && <div className="col-span-2"><dt className="text-xs text-dark/65">{t("payingCustomers")}</dt><dd>{card.stats.payingCustomers} · {t("selfReported")}</dd></div>}
      <p className="col-span-2 text-xs text-dark/65">{t("recordSource")}</p>
    </dl>}
    {card.reasons.map(reason => <p key={reason} className="mt-3 text-sm text-dark/70">{t(`reasons.${reason}`)}</p>)}
    {detail && <dl className="mt-5 space-y-4 border-t border-dark/10 pt-4 text-sm">
      {card.offers && <div><dt className="font-semibold">{t("fields.offers")}</dt><dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{card.offers}</dd></div>}
      {card.looksFor && <div><dt className="font-semibold">{t("fields.looksFor")}</dt><dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{card.looksFor}</dd></div>}
      {(card.offers || card.looksFor || card.slogan) && <p className="text-xs text-dark/65">{t("selfReported")}</p>}
    </dl>}
  </article>;
}
