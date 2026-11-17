"use client";
import { useLocale } from "next-intl";
import type { creditSnapshot } from "@/lib/credits/service";
type Snapshot = Awaited<ReturnType<typeof creditSnapshot>>;
export default function CreditsWallet({ data, error = "", refresh }: { data: Snapshot; error?: string; refresh?: () => void }) {
  const zh = useLocale() === "zh-tw", label = zh ? "點數" : "Credits";
  const date = (value: string) => new Date(value).toLocaleString(zh ? "zh-TW" : "en-US");
  return <section aria-label={label} className="min-w-0 rounded-2xl border border-dark/15 bg-white p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><strong className="text-xl tabular-nums">{data.available.toLocaleString()} {label}</strong><span>{zh ? "預扣" : "On hold"} {data.reserved.toLocaleString()}</span>{refresh && <button className="min-h-11 underline" type="button" onClick={refresh}>{zh ? "重新整理" : "Refresh"}</button>}</div>
    {error && <p role="alert" className="whitespace-pre-wrap break-words text-red-800">{error}</p>}
    <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3">{zh ? "點數明細" : "Credits details"}</summary>
      <dl className="space-y-3"><div><dt>{zh ? "不過期" : "Does not expire"}</dt><dd>{data.permanent.toLocaleString()} {label}</dd></div>{data.expiring.map(l => <div key={l.id}><dt>{zh ? "到期時間" : "Expires"} {date(l.expiresAt)}</dt><dd>{l.amount.toLocaleString()} {label}</dd></div>)}<div><dt>{zh ? "累積成就（消費不扣減）" : "Lifetime earned (unaffected by spending)"}</dt><dd>{data.lifetimeEarned.toLocaleString()}</dd></div>{data.referralDebt > 0 && <div><dt>{zh ? "待抵扣的推薦獎勵" : "Future referral rewards to offset"}</dt><dd>{data.referralDebt.toLocaleString()}</dd></div>}</dl>
    </details>
    <details><summary className="min-h-11 cursor-pointer py-3">{zh ? "收支紀錄" : "Transaction history"}</summary><ul className="max-h-96 space-y-3 overflow-auto">{data.ledger.map(e => <li className="break-words border-t border-dark/10 pt-3" key={e.id}><p>{e.reason.split(" / ")[zh ? 0 : 1] ?? e.reason}</p><p>{zh ? "可用" : "Available"} {e.availableDelta > 0 ? "+" : ""}{e.availableDelta} · {zh ? "預扣" : "Hold"} {e.reservedDelta > 0 ? "+" : ""}{e.reservedDelta}</p><time dateTime={e.createdAt}>{date(e.createdAt)}</time></li>)}</ul></details>
  </section>;
}
