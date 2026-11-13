"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useNetwork } from "../network/NetworkPanels";
import CardView, { CardChatAction } from "../matchmaking/CardView";
import { MemberFetchError, memberFetch } from "@/lib/member-fetch";
import type { PublicCard } from "@/lib/matchmaking/schema";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export default function FounderRecommendations() {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const { value, error: accessError, load: reloadAccess } = useNetwork();
  const [cards, setCards] = useState<PublicCard[] | null>(null), [error, setError] = useState("");
  const readAbort = useRef<AbortController | null>(null);
  const canBrowse = value !== null && (!value.enabled || value.network);
  const href = pathForLocale("/dashboard/matchmaking?tab=recommendations", locale);
  const load = useCallback(async (callerSignal?: AbortSignal) => {
    readAbort.current?.abort(); const abort = new AbortController(); readAbort.current = abort;
    const signal = callerSignal ? AbortSignal.any([callerSignal, abort.signal]) : abort.signal;
    try {
      const result = await memberFetch<{ cards: PublicCard[] }>("/api/matchmaking?view=recommendations&page=1", { signal, timeoutMs: 20000 });
      if (!result || !Array.isArray(result.cards)) throw new MemberFetchError(`HTTP 200\n${zh ? "推薦名單回應格式不正確" : "Invalid recommendations response"}\ninvalid_response`, 200);
      if (!signal?.aborted) { setCards(result.cards.slice(0, 3)); setError(""); }
    } catch (cause) { if (!signal?.aborted) { setCards(null); setError(cause instanceof Error ? cause.message : String(cause)); } }
  }, [zh]);
  useEffect(() => { if (!canBrowse) return; const abort = new AbortController(); void Promise.resolve().then(() => { if (!abort.signal.aborted) return load(abort.signal); }); return () => { abort.abort(); readAbort.current?.abort(); }; }, [canBrowse, load]);
  return <section aria-labelledby="home-members-title" className="min-w-0 rounded-2xl border border-dark/10 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="home-members-title" className="text-xs text-dark/50">{zh ? "商機媒合 · 推薦交流" : "BUSINESS MATCHING · FOR YOU"}</h2><Link className="inline-flex min-h-11 items-center text-xs font-semibold underline" href={href}>{zh ? "查看全部" : "View all"} →</Link></div>
    {accessError || error ? <div role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{accessError || error}</p><button type="button" className="mt-2 min-h-11 underline" onClick={() => void (accessError ? reloadAccess() : load())}>{zh ? "重試" : "Retry"}</button></div>
      : !value ? <p role="status" className="text-sm text-dark/65">{zh ? "正在確認會員權益…" : "Checking member access…"}</p>
      : !canBrowse ? <div className="rounded-2xl border border-dark/15 bg-white p-6"><Link href={href} className="mt-4 inline-flex min-h-11 items-center font-semibold underline">{zh ? "查看商機媒合" : "Open business matching"} →</Link></div>
      : cards === null ? <p role="status" className="text-sm text-dark/65">{zh ? "載入推薦中…" : "Loading recommendations…"}</p>
      : cards.length === 0 ? <div className="rounded-2xl border border-dark/15 bg-white p-6"><p className="text-dark/70">{zh ? "目前沒有符合的推薦。補充公司資料，或先探索所有會員。" : "No matching recommendations yet. Complete your company profile or explore all members."}</p><Link href={pathForLocale("/dashboard/matchmaking?tab=all", locale)} className="mt-3 inline-flex min-h-11 items-center font-semibold underline">{zh ? "探索所有會員" : "Explore all members"} →</Link></div>
      : <div className="mt-3">{cards.map(card => <CardView key={card.id} card={card} row footer={<CardChatAction card={card} network={value} compact />} />)}</div>}
  </section>;
}
