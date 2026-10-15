"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/20 px-5 py-3 text-sm font-semibold disabled:opacity-45";
export default function FounderReturn({ orderId }: { orderId: string }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const [endsAt, setEndsAt] = useState<string | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const confirm = useCallback(async () => {
    if (pending.current) return; pending.current = true; setBusy(true); setError("");
    try { if (!/^[A-Za-z0-9]{5,64}$/.test(orderId)) throw new Error(zh ? "付款訂單 ID 無效，請從原付款連結返回。" : "Invalid order ID. Return through the original payment link."); const response = await fetch("/api/billing/founder/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) }), json = await response.json(); if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`); setEndsAt(json.data.accessEndsAt); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { pending.current = false; setBusy(false); }
  }, [orderId, zh]);
  useEffect(() => { const timer = setTimeout(() => void confirm(), 0); return () => clearTimeout(timer); }, [confirm]);
  return <section className="mx-auto max-w-xl space-y-5 rounded-2xl border border-dark/15 bg-white p-6 sm:p-8"><h1 className="text-2xl font-bold">{endsAt ? (zh ? "創始會員已解鎖" : "Founding membership unlocked") : (zh ? "確認你的年費付款" : "Confirming your prepaid year")}</h1>
    {endsAt ? <><p>{zh ? "US$348 一次付款，12 個月使用權；不會自動續扣。" : "US$348 paid once for 12 months of access. No automatic renewal."}</p><p>{zh ? "有效至" : "Access until"} {new Intl.DateTimeFormat(zh ? "zh-TW" : "en", { dateStyle: "long", timeZone: "Asia/Taipei" }).format(new Date(endsAt))}</p><Link href={`${pathForLocale("/dashboard/agenda", locale)}#discovery`} className={`${button} bg-black text-white`}>{zh ? "接著完成其餘訪談" : "Continue my interviews"}</Link></> : <p role="status">{busy ? (zh ? "正在向 PayPal 核對，請勿重複付款…" : "Checking with PayPal. Do not pay again…") : (zh ? "你的訪談紀錄仍保留。" : "Your interview records are retained.")}</p>}
    {error && <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap">{error}</p><button type="button" className={button} disabled={busy} onClick={() => void confirm()}>{zh ? "重新確認原訂單（不另建訂單）" : "Retry the original order (no new checkout)"}</button></div>}
  </section>;
}
