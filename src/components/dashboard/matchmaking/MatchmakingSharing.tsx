"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { memberFetch, MemberFetchError } from "@/lib/member-fetch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import type { ownerPortalDto } from "@/lib/investor/portal";
import InvestorPortalManager from "../InvestorPortalManager";
import { InvestorProgress } from "../network/NetworkPanels";
type Sharing = { portal: ReturnType<typeof ownerPortalDto>; canHideFields: boolean; weeklyDraft: { id: string; revision: number; title: string; body: string } | null };
export default function MatchmakingSharing({ active }: { active: boolean }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const [data, setData] = useState<Sharing | null>(null), [error, setError] = useState(""), [upgrade, setUpgrade] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const id = new URLSearchParams(window.location.search).get("checkInId"); const next = await memberFetch<Sharing>(`/api/matchmaking/sharing${id ? `?checkInId=${encodeURIComponent(id)}` : ""}`, { signal }); if (!signal?.aborted) { setData(next); setError(""); setUpgrade(false); } }
    catch (e) { if (!signal?.aborted) { setUpgrade(e instanceof MemberFetchError && e.status === 403); setError(e instanceof Error ? e.message : String(e)); } }
  }, []);
  useEffect(() => { if (!active || data) return; const abort = new AbortController(); void Promise.resolve().then(() => load(abort.signal)); return () => abort.abort(); }, [active, data, load]);
  return <div className="space-y-6">{active && <InvestorProgress />}<Link className="inline-flex min-h-11 items-center underline" href={pathForLocale("/dashboard/messages", locale)}>{zh ? "聊天與個別分享同意" : "Chats & per-member sharing consent"}</Link>{error && <div role="alert" className="whitespace-pre-wrap rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}<button className="ml-3 min-h-11 underline" onClick={() => void load()}>{zh ? "重試" : "Retry"}</button>{upgrade && <Link className="ml-3 inline-flex min-h-11 items-center underline" href={pathForLocale("/dashboard/account#plan", locale)}>{zh ? "查看方案" : "View plans"}</Link>}</div>}{data ? <InvestorPortalManager locale={locale} initialPortal={data.portal} weeklyDraft={data.weeklyDraft} canHideFields={data.canHideFields} /> : !error && <p role="status">{zh ? "載入分享設定…" : "Loading sharing settings…"}</p>}</div>;
}
