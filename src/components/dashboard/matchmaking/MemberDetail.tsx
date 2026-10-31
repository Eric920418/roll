"use client";
import { track } from "@/lib/analytics";
import { InvitePanel, VisitRecorder } from "../network/NetworkPanels";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { memberFetch } from "@/lib/member-fetch";
import { matchCopy, type PublicCard } from "@/lib/matchmaking/schema";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import CardView from "./CardView";
export default function MemberDetail({ id }: { id: string }) {
  const t = useTranslations("Matchmaking"), locale = useLocale() as Locale;
  const [card, setCard] = useState<PublicCard | null>(null), [error, setError] = useState(""), [draft, setDraft] = useState(""), [notice, setNotice] = useState("");
  const load = useCallback((signal?: AbortSignal) => memberFetch<PublicCard>(`/api/matchmaking/members/${encodeURIComponent(id)}`, { signal })
    .then(data => { if (!signal?.aborted) { setCard(data); setDraft(matchCopy(data, locale === "zh-tw").draft); setError(""); track("card_open", { feature: "matchmaking" }); } })
    .catch(cause => { if (!signal?.aborted) { setCard(null); setError(cause instanceof Error ? cause.message : String(cause)); } }), [id, locale]);
  useEffect(() => { const abort = new AbortController(); void load(abort.signal); return () => abort.abort(); }, [load]);
  const zh = locale === "zh-tw", copy = card ? matchCopy(card, zh) : null;
  return <div className="mx-auto max-w-5xl space-y-5"><Link href={pathForLocale("/dashboard/matchmaking", locale)} className="inline-flex min-h-11 items-center text-sm underline">← {t("back")}</Link><h1 className="text-3xl font-semibold">{card?.displayName || card?.companyName || t("memberTitle")}</h1>{error && <div role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button className="mt-3 min-h-11 underline" onClick={() => void load()}>{t("retry")}</button></div>}{card && copy ? <><div className="grid items-start gap-6 md:grid-cols-2"><CardView card={card} detail /><aside className="space-y-5 rounded-2xl border border-dark/15 bg-white p-5 sm:p-7"><h2 className="text-2xl font-semibold">{zh ? "為何適合交流？" : "Why this match"}</h2>{copy.reasons.length ? <ul className="list-disc space-y-2 pl-5 text-sm">{copy.reasons.map(r => <li key={r}>{r}</li>)}</ul> : <p>{zh ? "目前沒有足夠的公開資料判斷適配，請先確認彼此需求。" : "There is not enough public information to establish a match. Confirm mutual relevance first."}</p>}<div><h3 className="font-semibold">{zh ? "下一步" : "Next step"}</h3><p className="mt-2 text-sm">{copy.next}</p></div><label className="block text-sm font-semibold">{zh ? "建議開場 · 可編輯" : "Suggested message · editable"}<textarea className="mt-3 min-h-44 w-full rounded-xl border border-dark/20 p-3 font-normal" maxLength={4000} value={draft} onChange={e => setDraft(e.target.value)} /></label><button className="min-h-11 rounded-xl border border-dark/20 px-4 py-3 text-sm font-semibold" onClick={async () => { try { await navigator.clipboard.writeText(draft); setNotice(zh ? "已複製，請自行確認後發送。" : "Copied. Review and send yourself."); } catch { setError(zh ? "複製失敗，請選取文字手動複製。" : "Copy failed. Select the text and copy manually."); } }}>{zh ? "複製訊息" : "Copy message"}</button>{notice && <p role="status" className="text-sm">{notice}</p>}<InvitePanel profileId={id} /></aside></div><VisitRecorder profileId={id} /></> : !error && <p role="status">{t("loading")}</p>}</div>;
}
