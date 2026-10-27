"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ReferralSummary } from "@/lib/referrals/service";
import { memberFetch } from "@/lib/member-fetch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
const button = "min-h-11 rounded-xl border border-dark/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2";
export default function ReferralPanel() {
  const t = useTranslations("Referrals"), locale = useLocale() as Locale;
  const [data, setData] = useState<ReferralSummary | null>(null), [page, setPage] = useState(1), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const writing = useRef(false), generation = useRef(0);
  const load = useCallback((signal?: AbortSignal) => {
    const current = ++generation.current;
    return memberFetch<ReferralSummary>(`/api/referrals?page=${page}`, { signal })
      .then(result => { if (!signal?.aborted && current === generation.current) { setData(result); setError(""); } })
      .catch(cause => { if (!signal?.aborted && current === generation.current) setError(cause instanceof Error ? cause.message : String(cause)); });
  }, [page]);
  useEffect(() => { const abort = new AbortController(); void load(abort.signal); return () => abort.abort(); }, [load]);
  const link = data?.code && typeof window !== "undefined" ? `${window.location.origin}${pathForLocale("/signup", locale)}?ref=${data.code}` : "";
  async function create() {
    if (writing.current) return; writing.current = true; setBusy(true); setError("");
    try { const result = await memberFetch<ReferralSummary>("/api/referrals", { method: "POST", body: "{}" }); generation.current++; setData(result); setPage(1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { writing.current = false; setBusy(false); }
  }
  async function copy() {
    setError(""); setNotice("");
    try { if (!navigator.clipboard) throw new Error(t("copyFallback")); await navigator.clipboard.writeText(link); setNotice(t("copied")); }
    catch (cause) { setError(`${t("copyFallback")}\n${cause instanceof Error ? cause.message : String(cause)}`); }
  }
  const date = (value: string) => new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(value));
  return <section className="mt-8 min-w-0 rounded-2xl border border-dark/15 bg-white p-5 sm:p-8" aria-labelledby="referral-title">
    <h2 id="referral-title" className="text-xl font-bold">{t("title")}</h2><p className="mt-3 text-sm leading-6 text-dark/70">{t("rules")}</p><p className="mt-2 text-sm leading-6 text-dark/70">{t("refundRules")}</p>
    {error && <div role="alert" className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button className={button+" mt-3"} onClick={() => void load()}>{t("retry")}</button></div>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    {!data ? <p role="status" className="mt-5 text-sm">{t("loading")}</p> : <>
      <p className="mt-5 text-sm">{t("monthly", { month: data.month, used: data.used, limit: data.rules.monthlyLimit })}</p>{data.debt > 0 && <p className="mt-2 text-sm">{t("debt", { count: data.debt })}</p>}
      {data.code ? <div className="mt-4 grid min-w-0 gap-3"><label className="text-sm font-semibold">{t("code")}<input readOnly value={data.code} onFocus={event => event.currentTarget.select()} className="mt-2 block min-h-11 w-full rounded-xl border border-dark/20 p-3 font-mono" /></label><label className="text-sm font-semibold">{t("link")}<input readOnly value={link} onFocus={event => event.currentTarget.select()} className="mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-dark/20 p-3 font-normal" /></label><button className={button+" justify-self-start"} onClick={() => void copy()}>{t("copy")}</button></div> : <button className={button+" mt-4"} disabled={busy} onClick={() => void create()}>{busy ? t("loading") : t("create")}</button>}
      <h3 className="mt-7 font-semibold">{t("history")}</h3>{!data.rows.length ? <p className="mt-3 text-sm text-dark/60">{t("empty")}</p> : <ul className="mt-3 divide-y divide-dark/10">{data.rows.map(row => <li key={row.id} className="space-y-2 py-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{t(`direction.${row.direction}`)}</span><strong>{t(`status.${row.status}`)}</strong></div><time dateTime={row.createdAt} className="block text-dark/60">{date(row.createdAt)}</time>{row.reason && <p>{t(`reason.${row.reason}`)}</p>}{row.errorRequestId && <p role="alert" className="break-words">{t("verificationFailure", { requestId: row.errorRequestId })}</p>}{row.eligibleAt && <p>{t("eligible", { date: date(row.eligibleAt) })}</p>}{row.entries.map(entry => <p key={entry.kind}>{t(`entry.${entry.kind}`, { credits: entry.credits, offset: entry.offset, debt: entry.debtDelta })}</p>)}</li>)}</ul>}
      <div className="mt-4 flex items-center gap-3"><button className={button} disabled={page === 1 || busy} onClick={() => { setData(null); setPage(value => value - 1); }}>{t("previous")}</button><span className="text-sm">{page}</span><button className={button} disabled={!data.hasMore || busy} onClick={() => { setData(null); setPage(value => value + 1); }}>{t("next")}</button></div>
    </>}
  </section>;
}
