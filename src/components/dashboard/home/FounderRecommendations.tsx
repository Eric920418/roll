"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useNetwork } from "../network/NetworkPanels";
import CardView from "../matchmaking/CardView";
import { memberFetch } from "@/lib/member-fetch";
import type { PublicCard } from "@/lib/matchmaking/schema";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export default function FounderRecommendations() {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const { value, error: accessError, load: reloadAccess } = useNetwork();
  const [cards, setCards] = useState<PublicCard[] | null>(null), [error, setError] = useState("");
  const canBrowse = value !== null && (!value.enabled || value.network);
  const href = pathForLocale("/dashboard/matchmaking?tab=recommendations", locale);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await memberFetch<{ cards: PublicCard[] }>("/api/matchmaking?view=recommendations&page=1", { signal });
      if (!signal?.aborted) { setCards(result.cards.slice(0, 3)); setError(""); }
    } catch (cause) { if (!signal?.aborted) { setCards(null); setError(cause instanceof Error ? cause.message : String(cause)); } }
  }, []);
  useEffect(() => { if (!canBrowse) return; const abort = new AbortController(); void Promise.resolve().then(() => { if (!abort.signal.aborted) return load(abort.signal); }); return () => abort.abort(); }, [canBrowse, load]);
  return <section aria-labelledby="home-members-title" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold tracking-widest text-dark/55">{zh ? "商機媒合" : "BUSINESS MATCHING"}</p><h2 id="home-members-title" className="mt-2 text-2xl font-semibold">{zh ? "找到能幫你前進的人" : "Meet people who move you forward"}</h2></div><Link className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4" href={href}>{zh ? "查看推薦" : "View recommendations"} →</Link></div>
    {accessError || error ? <div role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{accessError || error}</p><button type="button" className="mt-2 min-h-11 underline" onClick={() => void (accessError ? reloadAccess() : load())}>{zh ? "重試" : "Retry"}</button></div>
      : !value ? <p role="status" className="text-sm text-dark/65">{zh ? "正在確認會員權益…" : "Checking member access…"}</p>
      : !canBrowse ? <div className="rounded-2xl border border-dark/15 bg-white p-6"><p className="text-base leading-7 text-dark/70">{zh ? "探索創辦人、導師與合作夥伴。會員瀏覽依目前方案開放，你仍可回覆既有交流邀請。" : "Discover founders, mentors and partners. Browsing follows your plan; existing invitations remain available."}</p><Link href={href} className="mt-4 inline-flex min-h-11 items-center font-semibold underline">{zh ? "查看商機媒合" : "Open business matching"} →</Link></div>
      : cards === null ? <p role="status" className="text-sm text-dark/65">{zh ? "載入推薦中…" : "Loading recommendations…"}</p>
      : cards.length === 0 ? <div className="rounded-2xl border border-dark/15 bg-white p-6"><p className="text-dark/70">{zh ? "目前沒有符合的推薦。補充公司資料，或先探索所有會員。" : "No matching recommendations yet. Complete your company profile or explore all members."}</p><Link href={pathForLocale("/dashboard/matchmaking?tab=all", locale)} className="mt-3 inline-flex min-h-11 items-center font-semibold underline">{zh ? "探索所有會員" : "Explore all members"} →</Link></div>
      : <div className="grid min-w-0 gap-4 md:grid-cols-3">{cards.map(card => <div key={card.id} className="flex min-w-0 flex-col"><CardView card={card} /><Link href={pathForLocale(`/dashboard/matchmaking/${card.id}`, locale)} className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/15 bg-white px-4 text-sm font-semibold">{zh ? "查看檔案" : "View profile"} →</Link></div>)}</div>}
  </section>;
}
