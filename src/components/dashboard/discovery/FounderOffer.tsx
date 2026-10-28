"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";

const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/20 px-5 py-3 text-sm font-semibold disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2";
export default function FounderOffer() {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const [offer, setOffer] = useState<{ pricingPolicy?: number | null; enabled: boolean; remaining: number; capacity: number; pending?: { orderId: string | null; confirming: boolean } | null } | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false);
  const requestId = useRef("");
  const load = useCallback(async () => { try { const response = await fetch("/api/billing/founder/orders", { cache: "no-store" }), json = await response.json(); if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`); setOffer(json.data); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }, []);
  useEffect(() => { if (offer?.pricingPolicy === 2) return; const first = setTimeout(() => void load(), 0), timer = setInterval(() => void load(), 60_000); return () => { clearTimeout(first); clearInterval(timer); }; }, [load, offer?.pricingPolicy]);
  async function checkout() {
    if (busy || !confirmed) return; setBusy(true); setError("");
    requestId.current ||= crypto.randomUUID();
    try { const response = await fetch("/api/billing/founder/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: requestId.current, locale, prepaidYearConfirmed: true }) }), json = await response.json(); if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`); window.location.assign(json.data.approveUrl); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false); }
  }
  if (!offer) return <section className="space-y-3 rounded-2xl border border-dark/15 bg-white p-5"><p role="status">{zh ? "載入升級選項…" : "Loading upgrade options…"}</p>{error && <><p role="alert" className="whitespace-pre-wrap text-red-700">{error}</p><button className={button} onClick={() => void load()}>{zh ? "重試" : "Retry"}</button></>}</section>;
  if (offer.pricingPolicy === 2) return <section className="space-y-4 rounded-2xl border-2 border-black bg-white p-5 sm:p-7"><h3 className="text-2xl font-bold">{zh ? "選擇下一階段的方案" : "Choose your next-stage plan"}</h3><p>{zh ? "SPARK 適合繼續驗證想法；NOVA 再加上新公司名單、會員網絡與投資人分享。已儲存的訪談會保留。" : "Continue validating with SPARK, or choose NOVA for new prospect companies, the member network and investor sharing. Saved interviews are retained."}</p><Link className={`${button} bg-black text-white`} href={pathForLocale("/dashboard/account#plan", locale)}>{zh ? "比較 SPARK、NOVA 與 ROLL ON" : "Compare SPARK, NOVA and ROLL ON"}</Link>{offer.pending?.orderId && <Link className={button} href={`${pathForLocale("/dashboard/billing/founder-return", locale)}?token=${encodeURIComponent(offer.pending.orderId)}`}>{zh ? "確認既有創始方案付款（請勿重付）" : "Confirm an existing founding payment (do not pay again)"}</Link>}{error && <p role="alert" className="whitespace-pre-wrap text-red-700">{error}</p>}</section>;
  return <section aria-label={zh ? "創始會員年費" : "Founding membership"} className="space-y-4 rounded-2xl border-2 border-black bg-white p-5 sm:p-7">
    <p className="text-xs font-semibold uppercase tracking-[0.15em]">{zh ? "限前 10 位創始會員" : "Limited to 10 founding members"}</p>
    <h3 className="text-2xl font-bold">{zh ? "把初步訊號，推進成更完整的證據" : "Turn an early signal into stronger evidence"}</h3>
    <p className="text-3xl font-bold">US$348 <span className="text-base font-normal text-dark/65">{zh ? "／12 個月，一次付款" : "/ 12 months, paid once"}</span></p>
    <p className="text-sm text-dark/65">{zh ? "換算 US$29／月。優惠價適用本次 12 個月，不自動續扣。" : "Equivalent to US$29/month for this 12-month term. No automatic renewal."}</p>
    <ul className="list-disc space-y-2 pl-5 text-sm"><li>{zh ? "繼續完成其餘 7 次訪談，查看完整 10 次分析與前三大痛點" : "Continue with 7 more interviews and unlock the full 10-interview analysis and top pain points"}</li><li>{zh ? "可列印／另存 PDF 的投資人訪談證據報告" : "An investor-ready interview evidence report to print or save as PDF"}</li><li>{zh ? "解鎖後續行動計畫與 Pro 工具；分析仍受月 AI 額度限制" : "Next action plans and Pro tools; analysis uses your monthly AI allowance"}</li></ul>
    {!offer ? <p role="status" className="text-sm">{zh ? "確認可用名額…" : "Checking available seats…"}</p> : offer.enabled ? <p className="text-sm font-semibold" aria-live="polite">{zh ? `目前可結帳名額 ${offer.remaining}／${offer.capacity}；付款中的名額會暫留，逾期釋放。` : `${offer.remaining} of ${offer.capacity} seats available for checkout. Pending checkouts hold a seat temporarily.`}</p> : <p className="text-sm text-dark/65">{zh ? "創始年費結帳尚未開放，已儲存訪談會保留。" : "Founding checkout is not open yet. Your interviews are retained."}</p>}
    {offer?.enabled && (offer.remaining > 0 || offer.pending) && !offer.pending?.confirming && <><label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} className="mt-0.5 h-5 w-5 shrink-0" />{zh ? "我了解這是一次支付 US$348，取得 12 個月使用權，不是每月扣款。" : "I understand I will pay US$348 once for 12 months of access, not a monthly charge."}</label><button type="button" className={`${button} bg-black text-white`} disabled={busy || !confirmed} onClick={() => void checkout()}>{busy ? (zh ? "準備安全結帳…" : "Preparing secure checkout…") : (zh ? "一次支付 US$348 · 解鎖 12 個月" : "Pay US$348 once · unlock 12 months")}</button></>}
    {offer?.pending?.confirming && offer.pending.orderId && <Link className={`${button} bg-black text-white`} href={`${pathForLocale("/dashboard/billing/founder-return", locale)}?token=${encodeURIComponent(offer.pending.orderId)}`}>{zh ? "繼續確認原付款（請勿再次付款）" : "Resume payment confirmation (do not pay again)"}</Link>}
    {offer?.enabled && offer.remaining === 0 && !offer.pending && <Link className={button} href={pathForLocale("/dashboard/account#plan", locale)}>{zh ? "創始名額已滿，查看一般方案" : "Founding seats filled · view regular plans"}</Link>}
    {error && <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap">{error}</p><button type="button" className={button} disabled={busy} onClick={() => { requestId.current = ""; setError(""); void load(); }}>{zh ? "重新確認名額" : "Check seats again"}</button></div>}
  </section>;
}
