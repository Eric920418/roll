"use client";
import { useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { STAGE_CONFIG, type InsightStage } from "@/lib/customer-insights/schema";
import { useRewards } from "./rewards/RewardsProvider";
export default function CustomerStageGoal({ stage, people, confirmed }: { stage: InsightStage; people: number; confirmed?: { primaryCount: number; secondaryCount: number; confirmedAt: string } }) {
  const zh = useLocale() === "zh-tw", router = useRouter(), rewards = useRewards();
  const [primary, setPrimary] = useState(""), [secondary, setSecondary] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const target = STAGE_CONFIG[stage].target, isCount = stage === "discover" || stage === "angel_round", progress = confirmed?.primaryCount ?? (isCount ? people : null);
  const field = "mt-1 min-h-11 w-full rounded-lg border border-dark/15 bg-white px-3 py-2";
  return <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-sky-900">{zh ? "本階段目標" : "Your stage goal"}</p><h2 className="mt-1 text-lg font-semibold">{STAGE_CONFIG[stage].goal[zh ? 1 : 0]}</h2></div><span className="rounded-full bg-white px-3 py-2 text-sm font-semibold">{confirmed ? (zh ? "已達標 · +50 pts" : "Completed · +50 pts") : (zh ? "達標 +50 pts" : "+50 pts when complete")}</span></div>
    <p className="mt-2 text-sm text-dark/60">{zh ? `已保存 ${people} 位符合類型、含筆記的不同對象。` : `${people} distinct relevant people recorded with conversation notes.`}</p>
    {progress != null && <><progress aria-label={zh ? "階段進度" : "Stage progress"} className="mt-3 h-2 w-full accent-black" value={Math.min(progress, target)} max={target} /><p className="mt-1 text-xs">{progress}/{target}</p></>}
    {!confirmed ? <details className="mt-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">{zh ? "確認實際成果並領取積分" : "Confirm outcomes and claim points"}</summary><form className="mt-3 space-y-3 text-sm" onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(""); try { const res = await fetch("/api/customer-insights/outcome", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage, primaryCount: Number(primary || 0), secondaryCount: Number(secondary || 0), note, confirmed: true }) }); const json = await res.json(); if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`); await rewards.refresh(); router.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }}>
      <p className="text-dark/65">{zh ? "對話數不等於活躍或付費成果。請依實際情況確認，每個階段僅獎勵一次，確認後保留成果快照。" : "Conversations alone do not prove active usage or payment. Confirm actual outcomes. Each stage earns points once and retains an outcome snapshot."}</p>
      {!isCount && <label className="block">{stage === "mvp" ? (zh ? "本週實際使用產品的不同使用者數" : "Distinct users who used the product this week") : (zh ? "實際完成付款的不同客戶數" : "Distinct customers who actually paid")}<input required min={stage === "mvp" ? 5 : 3} max={people} type="number" step="1" className={field} value={primary} onChange={e => setPrimary(e.target.value)} /></label>}
      {(stage === "discover" || stage === "mvp") && <label className="block">{stage === "discover" ? (zh ? "未經誘導就提出同一問題的人數" : "People who independently described the same problem") : (zh ? "明確表示願意預付的人數" : "People who explicitly agreed to pre-pay")}<input required type="number" min="3" max={people} step="1" className={field} value={secondary} onChange={e => setSecondary(e.target.value)} /></label>}
      <label className="block">{zh ? "實際成果與依據（包含對象及日期）" : "Actual outcome and evidence (include people and dates)"}<textarea required minLength={10} maxLength={4000} rows={3} value={note} onChange={e => setNote(e.target.value)} className={field} /></label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" required className="h-5 w-5" />{zh ? "我確認上述為實際成果，並非 AI 建議或預期數字。" : "I confirm these are real outcomes, not AI suggestions or projected numbers."}</label>
      <button disabled={busy} className="min-h-11 rounded-lg bg-black px-4 text-white disabled:opacity-50">{busy ? (zh ? "儲存中…" : "Saving…") : (zh ? "確認達標 · +50 pts" : "Confirm achievement · +50 pts")}</button>
      {error && <p role="alert" className="whitespace-pre-wrap text-red-700">{error}</p>}
    </form></details> : <p className="mt-2 text-xs text-dark/60">{zh ? "本人確認於" : "Confirmed by you on"} {new Intl.DateTimeFormat(zh ? "zh-TW" : "en", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(new Date(confirmed.confirmedAt))}</p>}
  </div>;
}
