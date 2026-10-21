"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";
import type { getDiscoverySnapshot } from "@/lib/discovery/service";
import { discoveryReportSchema } from "@/lib/discovery/policy";
import CustomerDiscovery from "../CustomerDiscovery";
import ValidationWorkspace from "../ValidationWorkspace";
import LearningResources from "../LearningResources";
import FounderOffer from "./FounderOffer";

type Snapshot = Awaited<ReturnType<typeof getDiscoverySnapshot>>;
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/20 px-5 py-3 text-sm font-semibold disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2";
export default function DiscoveryJourney({ userId, planId, showCommercial = true }: { userId: string; planId?: string; showCommercial?: boolean }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [analysing, setAnalysing] = useState(false);
  const attempted = useRef("");
  const accept = useCallback((next: Snapshot) => setData(current => current && current.version > next.version ? current : next), []);
  const load = useCallback(async () => { try { const response = await fetch("/api/discovery", { cache: "no-store" }), json = await response.json(); if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`); accept(json.data); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }, [accept]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const analyse = useCallback(async (full: boolean) => {
    setAnalysing(true); setError("");
    try { const response = await fetch("/api/discovery/analyse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: full ? "full" : "preview", locale }) }), json = await response.json(); if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`); accept(json.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setAnalysing(false); }
  }, [locale, accept]);
  const previewKey = !data?.paid && data?.journeyId && data.total === 3 && !data.preview ? `${data.journeyId}:${data.version}` : "";
  useEffect(() => { if (!previewKey || attempted.current === previewKey) return; const timer = setTimeout(() => { attempted.current = previewKey; void analyse(false); }, 0); return () => clearTimeout(timer); }, [previewKey, analyse]);
  const preview = discoveryReportSchema.safeParse(data?.preview).data;
  async function start() {
    if (busy) return; setBusy(true); setError("");
    try { const response = await fetch("/api/discovery", { method: "POST" }), json = await response.json(); if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`); accept(json.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <section id="discovery" className="space-y-6 scroll-mt-6" aria-label={zh ? "客戶訪談里程碑" : "Customer interview milestone"}>
    <div className="rounded-2xl border-2 border-black bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.15em]">{data?.paid ? (zh ? "完整客戶探索" : "Full customer discovery") : (zh ? "14 天試用" : "14-day trial")}</p>{data && !data.paid && <p className="text-sm font-semibold">{data.active ? (zh ? `還有 ${data.daysRemaining} 天` : `${data.daysRemaining} days left`) : (zh ? "試用已結束" : "Trial ended")}</p>}</div>
      <h2 className="mt-4 text-2xl font-bold sm:text-3xl">{data?.paid ? (zh ? "完成 10 次訪談，整理下一步證據" : "Build evidence from 10 customer interviews") : (zh ? "先訪談 3 間公司，找出初步訊號" : "Interview 3 companies. Find your first signal.")}</h2>
      <p className="mt-3 text-sm text-dark/65">{zh ? "公司名稱必填，至少記錄一項回答或原始筆記。同公司多次訪談只計一次。" : "Add a company and at least one answer or original note. Repeat conversations at the same company count once."}</p>
      {data ? <><p className="mt-5 text-3xl font-bold">{Math.min(data.total, data.target)} <span className="text-base font-normal text-dark/60">/ {data.target} {zh ? "間公司" : "companies"}</span></p><progress aria-label={zh ? "訪談里程碑進度" : "Interview milestone progress"} value={Math.min(data.total, data.target)} max={data.target} className="mt-3 h-3 w-full overflow-hidden rounded-full bg-dark/10 [&::-webkit-progress-bar]:bg-dark/10 [&::-webkit-progress-value]:bg-black [&::-moz-progress-bar]:bg-black" />
        {!data.journeyId && <button type="button" className={`${button} mt-5 bg-black text-white`} disabled={busy || (!data.paid && !data.active)} onClick={() => void start()}>{zh ? `開始我的 ${data.target} 次訪談` : `Start my ${data.target} interviews`}</button>}
      </> : <p role="status" className="mt-5 text-sm">{zh ? "載入里程碑…" : "Loading your milestone…"}</p>}
    </div>
    {data && !data.paid && !data.active && data.total < 3 && <p className="rounded-xl border border-dark/15 bg-white p-5 text-sm">{zh ? "14 天試用已結束，已存訪談完整保留。" : "Your 14-day trial ended. Saved interviews are retained."} <Link className={`${button} mt-3`} href={pathForLocale("/dashboard/account#plan", locale)}>{zh ? "查看一般方案，繼續訪談" : "View regular plans to continue"}</Link></p>}
    {data && !data.paid && data.total === 3 && <section className="space-y-4 rounded-2xl border border-dark/15 bg-white p-5 sm:p-7" aria-label={zh ? "初步訪談訊號" : "Preliminary interview signal"}>
      <p className="text-xs font-semibold uppercase tracking-[0.15em]">{zh ? "你已完成第一個里程碑" : "Your first milestone is complete"}</p>
      <h3 className="text-xl font-bold">{zh ? "初步訊號，還不是結論" : "An early signal, not a conclusion"}</h3>
      {preview ? preview.topics[0] ? <><p className="text-lg font-semibold">{zh ? `目前分析的 ${preview.total} 次訪談中，有 ${preview.topics[0].count} 間公司提到相近痛點：${preview.topics[0].label}` : `${preview.topics[0].count} of the ${preview.total} companies analysed described a similar pain: ${preview.topics[0].label}`}</p><details><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">{zh ? "查看訪談依據" : "View the interview evidence"}</summary>{preview.topics[0].evidence.map((source, i) => <blockquote key={`${source.recordId}-${i}`} className="mt-3 border-l-2 border-dark/20 pl-4 text-sm text-dark/70">{source.quote}</blockquote>)}</details></> : <p>{zh ? "目前的訪談還沒有出現可核對的共同痛點，這也是有用的訊號。" : "These interviews do not yet show a verifiable shared pain. That is useful evidence too."}</p> : <p role="status">{analysing ? (zh ? "NOVA 正在核對你的訪談…" : "NOVA is checking your interview evidence…") : (zh ? "初步分析尚未完成，原始紀錄已保存。" : "Preliminary analysis is not ready. Your interviews are saved.")}</p>}
      <p className="text-sm text-dark/65">{zh ? "繼續訪談到 10 間公司，可以取得更多證據，判斷這個痛點是否持續出現；訪談數量本身不能保證市場需求。" : "Continue to 10 companies to gather more evidence and see whether the pain recurs. Interview count alone does not prove market demand."}</p>
      {!preview && <button type="button" disabled={analysing} className={button} onClick={() => void analyse(false)}>{zh ? "產生／重試初步分析" : "Generate / retry preliminary analysis"}</button>}
    </section>}
    {data && data.total >= 3 && !data.paid && <FounderOffer />}
    {data?.paid && data.journeyId && showCommercial && <ValidationWorkspace userId={userId} planId={planId} journeyId={planId ? undefined : data.journeyId} revision={data.version} />}
    {error && <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap">{error}</p><button type="button" className={button} onClick={() => void load()}>{zh ? "重新載入，保留已輸入內容" : "Reload · keep my input"}</button></div>}
    {data?.paid && planId && !showCommercial && <a href={`#validation-${planId}`} className={button}>{zh ? "繼續聯絡與付款驗證 →" : "Continue to outreach and payment validation →"}</a>}
    {data?.journeyId && <><LearningResources kind="interview" question={zh ? "如何進行訪談？" : "How to run an interview?"} />{!data.canCreate && <p className="rounded-xl bg-dark/5 p-4 text-sm">{!data.paid ? (zh ? "試用訪談先停在這裡。已儲存內容保留；升級後可繼續其餘訪談與完整分析。" : "Your trial interviews pause here. Saved records are retained; upgrade to continue and unlock full analysis.") : (zh ? "十次訪談已記錄，可查看完整分析，或在下方建立下一步計畫。" : "Ten interviews saved. Review the full analysis or build your next plan below.")}</p>}<CustomerDiscovery key={data.journeyId} journeyId={data.journeyId} userId={userId} rows={data.rows} outcomes={[]} createDisabled={!data.canCreate} readOnly={busy || (!data.paid && !data.active)} onSaved={() => void load()} /></>}
  </section>;
}
