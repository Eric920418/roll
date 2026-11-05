"use client";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { memberFetch } from "@/lib/member-fetch";
import type { tokenSnapshot } from "@/lib/tokens/service";
type Snapshot = Awaited<ReturnType<typeof tokenSnapshot>>;
export default function TokenBalance() {
  const zh = useLocale() === "zh-tw", [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState("");
  const load = useCallback(async (cursor?: string) => {
    try { const next = await memberFetch<Snapshot>(`/api/tokens${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`); setData(old => cursor && old ? { ...next, ledger: [...old.ledger, ...next.ledger] } : next); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { const refresh = () => { if (document.visibilityState === "visible") void load(); }; void Promise.resolve().then(refresh); window.addEventListener("nova-tokens-changed", refresh); window.addEventListener("focus", refresh); return () => { window.removeEventListener("nova-tokens-changed", refresh); window.removeEventListener("focus", refresh); }; }, [load]);
  function description(value: string) { const parts = value.split(" / "); return parts.length === 2 ? parts[zh ? 0 : 1] : value; }
  return <section aria-label="Token" className="rounded-2xl border border-dark/15 bg-white p-4 text-sm"><div className="flex flex-wrap items-center gap-4"><strong>Token {zh ? "可用" : "available"} {data?.available ?? "…"}</strong><span>{zh ? "預扣" : "On hold"} {data?.reserved ?? "…"}</span><button type="button" className="min-h-11 underline" onClick={() => void load()}>{zh ? "重新整理" : "Refresh"}</button></div><p>{zh ? "有效方案每 UTC 月贈送 150 Token，餘額保留。與 AI 次數及積分分開計算。" : "Active plans receive 150 Token per UTC month. Unused balance rolls over, separate from AI requests and points."}</p>{error && <p role="alert" className="whitespace-pre-wrap break-words text-red-800">{error}</p>}{data && <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3">{zh ? "收支紀錄" : "Transaction history"}</summary><ul className="space-y-3">{data.ledger.map(row => <li className="break-words border-t border-dark/10 pt-3" key={row.id}><p>{description(row.reason)}</p><p>{zh ? "可用" : "Available"} {row.availableDelta > 0 ? "+" : ""}{row.availableDelta} · {zh ? "預扣" : "Hold"} {row.reservedDelta > 0 ? "+" : ""}{row.reservedDelta} · {new Date(row.createdAt).toLocaleString(zh ? "zh-TW" : "en-US")}</p><p className="text-xs text-dark/60">{row.id}</p></li>)}</ul>{!data.ledger.length && <p>{zh ? "尚無紀錄" : "No transactions yet"}</p>}{data.nextCursor && <button type="button" className="min-h-11 underline" onClick={() => void load(data.nextCursor!)}>{zh ? "較早紀錄" : "Earlier transactions"}</button>}</details>}</section>;
}
