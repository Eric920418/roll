"use client";
import { InvitePanel, VisitRecorder } from "../network/NetworkPanels";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { memberFetch } from "@/lib/member-fetch";
import type { PublicCard } from "@/lib/matchmaking/schema";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import CardView from "./CardView";
export default function MemberDetail({ id }: { id: string }) {
  const t = useTranslations("Matchmaking"), locale = useLocale() as Locale;
  const [card, setCard] = useState<PublicCard | null>(null), [error, setError] = useState("");
  const load = useCallback((signal?: AbortSignal) => memberFetch<PublicCard>(`/api/matchmaking/members/${encodeURIComponent(id)}`, { signal })
    .then(data => { if (!signal?.aborted) { setCard(data); setError(""); } })
    .catch(cause => { if (!signal?.aborted) { setCard(null); setError(cause instanceof Error ? cause.message : String(cause)); } }), [id]);
  useEffect(() => { const abort = new AbortController(); void load(abort.signal); return () => abort.abort(); }, [load]);
  return <div className="mx-auto max-w-2xl space-y-5"><Link href={pathForLocale("/dashboard/matchmaking", locale)} className="inline-flex min-h-11 items-center text-sm underline">{t("back")}</Link><h1 className="text-3xl font-semibold">{t("memberTitle")}</h1><p className="text-sm leading-6 text-dark/70">{t("intro")}</p>{error && <div role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button className="mt-3 min-h-11 underline" onClick={() => void load()}>{t("retry")}</button></div>}{card ? <><CardView card={card} detail /><VisitRecorder profileId={id} /><InvitePanel profileId={id} /></> : !error && <p role="status">{t("loading")}</p>}</div>;
}
