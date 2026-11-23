"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReferralSummary } from "@/lib/referrals/service";
import { memberFetch } from "@/lib/member-fetch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
const button = "min-h-11 rounded-xl border border-dark/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2";
export default function ReferralPanel({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
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
  const credits = data?.mode === "credits", zh = locale === "zh-tw";
  const rulesText = zh ? `新邀請：好友首次 SPARK／NOVA 訂閱付款滿 ${data?.rules.waitDays ?? 14} 天後，雙方各獲得一個免費月；每月最多 ${data?.rules.monthlyLimit ?? 10} 位。兌換時會停止現有月繳訂閱的下次扣款，已付期間結束後接續免費月。免費月結束後需自行重新訂閱，不會自動扣款。` : `For new referrals: after a friend's first SPARK / NOVA subscription payment clears the ${data?.rules.waitDays ?? 14}-day waiting period, you each earn a free month, up to ${data?.rules.monthlyLimit ?? 10} referrals monthly. Redeeming stops renewal of your current monthly subscription. The free month follows your paid period; resubscribe manually afterward. There is no automatic charge.`;
  async function redeem(id: string) {
    if (writing.current || !window.confirm(zh ? "確認兌換免費月？\n現有月繳訂閱的下次扣款將停止，已付期間保留。免費月結束後需自行重新訂閱，不會自動續扣。既有付款不退款。" : "Redeem a free month?\nYour current monthly renewal will stop. Your paid period remains valid. Resubscribe manually after the free month; there will be no automatic renewal or refund of existing payments.")) return;
    writing.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await memberFetch("/api/referrals/redeem", { method: "POST", body: JSON.stringify({ benefitId: id, requestId: crypto.randomUUID(), confirmed: true }) });
      await load(); router.refresh();
      setNotice(zh ? "免費月已安排。結束後請自行重新訂閱。" : "Your free month is scheduled. Resubscribe manually after it ends.");
    } catch (cause) { await load(); setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { writing.current = false; setBusy(false); }
  }

  const date = (value: string) => new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(value));
  if (compact) return <section className="min-w-0 rounded-2xl border border-dark/10 bg-white p-5"><h2 className="text-lg font-semibold">{t('title')}</h2><p className="mt-3 text-xs leading-6">{credits ? rulesText : data ? locale === 'zh-tw' ? `推薦好友首次付費滿 ${data.rules.waitDays} 天，雙方各得 ${data.rules.credits} 次 AI 額度；每月最多 ${data.rules.monthlyLimit} 位。` : `Both receive ${data.rules.credits} AI requests ${data.rules.waitDays} days after a friend's first payment; up to ${data.rules.monthlyLimit} referrals a month.` : t('rules')}</p>{error && <p role="alert" className="mt-3 whitespace-pre-wrap break-words text-xs text-red-800">{error}</p>}{notice && <p role="status" className="mt-2 text-xs">{notice}</p>}{!data ? <button type="button" className={button+' mt-3'} onClick={() => void load()}>{error ? t('retry') : t('loading')}</button> : data.code ? <><button type="button" className={button+' mt-3'} onClick={() => void copy()}>{t('copy')}</button><details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-xs">{t('link')}</summary><input aria-label={t('link')} readOnly value={link} onFocus={e=>e.currentTarget.select()} className="min-h-11 w-full min-w-0 rounded-lg border p-2 text-xs" /></details></> : <button type="button" className={button+' mt-3'} disabled={busy} onClick={() => void create()}>{t('create')}</button>}</section>;
  return <section className="mt-8 min-w-0 rounded-2xl border border-dark/15 bg-white p-5 sm:p-8" aria-labelledby="referral-title">
    <h2 id="referral-title" className="text-xl font-bold">{t("title")}</h2><p className="mt-3 text-sm leading-6 text-dark/70">{rulesText}</p><p className="mt-2 text-sm leading-6 text-dark/70">{zh ? "退款或無效推薦會撤回免費月。更新前的邀請沿用原規則，舊版點數獎勵與紀錄保留；小額 AI 點數購買不觸發免費月；年繳、預付年費及永久權益不會被兌換功能取消，權益到期後可再兌換。未訂閱者可直接使用獲得的方案免費月。" : "Refunded or invalid referrals revoke the free month. Earlier referrals keep their original rules, credit rewards and history. AI credit purchases do not qualify. Annual, prepaid and lifetime access is not cancelled; redeem after that access ends. Members without a subscription can redeem the awarded plan directly."}</p>
    {error && <div role="alert" className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button className={button+" mt-3"} onClick={() => void load()}>{t("retry")}</button></div>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    {!data ? <p role="status" className="mt-5 text-sm">{t("loading")}</p> : <>
      <p className="mt-5 text-sm">{t("monthly", { month: data.month, used: data.used, limit: data.rules.monthlyLimit })}</p>{data.debt > 0 && <p className="mt-2 text-sm">{credits ? (zh ? `${data.debt} 點數由未來推薦獎勵抵扣` : `${data.debt} Credits to offset from future referral rewards`) : t("debt", { count: data.debt })}</p>}
      {data.code ? <div className="mt-4 grid min-w-0 gap-3"><label className="text-sm font-semibold">{t("code")}<input readOnly value={data.code} onFocus={event => event.currentTarget.select()} className="mt-2 block min-h-11 w-full rounded-xl border border-dark/20 p-3 font-mono" /></label><label className="text-sm font-semibold">{t("link")}<input readOnly value={link} onFocus={event => event.currentTarget.select()} className="mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-dark/20 p-3 font-normal" /></label><button className={button+" justify-self-start"} onClick={() => void copy()}>{t("copy")}</button></div> : <button className={button+" mt-4"} disabled={busy} onClick={() => void create()}>{busy ? t("loading") : t("create")}</button>}
      {!!data.freeMonths.length && <section className="mt-6 space-y-3" aria-label={zh ? "免費月獎勵" : "Free month rewards"}><h3 className="font-semibold">{zh ? "免費月獎勵" : "Free month rewards"}</h3>{data.freeMonths.map(benefit => <article key={benefit.id} className="space-y-2 rounded-xl border border-dark/15 p-4 text-sm"><p className="font-semibold">{benefit.plan === "business" ? "NOVA" : "SPARK"} · {({ available: zh ? "待兌換" : "Available", claiming: zh ? "待核對，請重試同一筆兌換" : "Needs verification; retry this redemption", scheduled: zh ? "已安排" : "Scheduled", revoked: zh ? "已撤回" : "Revoked" })[benefit.status] || benefit.status}</p>{benefit.status === "scheduled" && benefit.startsAt && benefit.endsAt && <p>{date(benefit.startsAt)} — {date(benefit.endsAt)} · {zh ? "結束後請重新訂閱" : "Resubscribe afterward"}</p>}{benefit.lastError && <p role="alert" className="whitespace-pre-wrap break-words text-red-800">{benefit.lastError}</p>}{["available", "claiming"].includes(benefit.status) && <button className={button} disabled={busy} type="button" onClick={() => void redeem(benefit.id)}>{zh ? "兌換免費月" : "Redeem free month"}</button>}</article>)}</section>}
      <h3 className="mt-7 font-semibold">{t("history")}</h3>{!data.rows.length ? <p className="mt-3 text-sm text-dark/60">{t("empty")}</p> : <ul className="mt-3 divide-y divide-dark/10">{data.rows.map(row => <li key={row.id} className="space-y-2 py-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{t(`direction.${row.direction}`)}</span><strong>{t(`status.${row.status}`)}</strong></div><time dateTime={row.createdAt} className="block text-dark/60">{date(row.createdAt)}</time>{row.reason && <p>{t(`reason.${row.reason}`)}</p>}{row.errorRequestId && <p role="alert" className="break-words">{t("verificationFailure", { requestId: row.errorRequestId })}</p>}{row.eligibleAt && <p>{t("eligible", { date: date(row.eligibleAt) })}</p>}{row.entries.map(entry => <p key={entry.kind}>{credits ? `${entry.credits > 0 ? "+" : ""}${entry.credits} ${zh ? "點數" : "Credits"}` : t(`entry.${entry.kind}`, { credits: entry.credits, offset: entry.offset, debt: entry.debtDelta })}</p>)}</li>)}</ul>}
      <div className="mt-4 flex items-center gap-3"><button className={button} disabled={page === 1 || busy} onClick={() => { setData(null); setPage(value => value - 1); }}>{t("previous")}</button><span className="text-sm">{page}</span><button className={button} disabled={!data.hasMore || busy} onClick={() => { setData(null); setPage(value => value + 1); }}>{t("next")}</button></div>
    </>}
  </section>;
}
