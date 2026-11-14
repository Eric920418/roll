"use client";
import { personalizationRoute, personalizedSteps, personalizationResponses } from "@/lib/action-plan/personalization";
import { PersonalizationSummary } from "../PersonalizationQuestions";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";
import type { getDiscoverySnapshot } from "@/lib/discovery/service";
import { discoveryReportSchema } from "@/lib/discovery/policy";
import CustomerDiscovery from "../CustomerDiscovery";
import ProspectSearch from "../prospecting/ProspectSearch";
import ValidationWorkspace from "../ValidationWorkspace";
import LearningResources from "../LearningResources";
import FounderOffer from "./FounderOffer";
import ActionPlanBuilder from "../ActionPlanBuilder";
import NextStepsTour from "../NextStepsTour";
import { bottleneckLabel } from "@/lib/action-plan/constants";

type Snapshot = Awaited<ReturnType<typeof getDiscoverySnapshot>>;
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/20 px-5 py-3 text-sm font-semibold disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2";
export default function DiscoveryJourney({ userId, planId, showCommercial = true, compactTrial = false }: { userId: string; planId?: string; showCommercial?: boolean; compactTrial?: boolean }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [analysing, setAnalysing] = useState(false);
  const attempted = useRef("");
  const [showInterviews, setShowInterviews] = useState(false);
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
  if (!data) return <section className="mt-7"><p role="status">{zh ? "載入個人化計畫…" : "Loading your plan…"}</p>{error && <div role="alert" className="mt-3 whitespace-pre-wrap text-red-700">{error}<button className={button} onClick={() => void load()}>{zh ? "重試" : "Retry"}</button></div>}</section>;
  if (!data.journeyId && data.paid) return <section className="mt-7 space-y-4 rounded-2xl border border-dark/15 bg-white p-5"><h2 className="text-xl font-bold">{zh ? "依個人化計畫開始訪談" : "Start conversations from your personalised plan"}</h2>{data.canStart ? <button className={button} disabled={busy} onClick={() => void start()}>{zh ? "開始訪談工作區" : "Start conversation workspace"}</button> : <Link className={button} href={pathForLocale("/dashboard/agenda?guide=build", locale)}>{zh ? "完成五題並建立計畫" : "Answer five questions and build my plan"}</Link>}{error && <p role="alert" className="whitespace-pre-wrap text-red-700">{error}</p>}</section>;
  if (data.needsSetup || !data.journeyId || data.setup && !data.setup.confirmed) return <section data-next-step="goal" className="mt-7 space-y-5 rounded-2xl border border-dark/15 bg-white p-5 sm:p-7"><h2 className="text-2xl font-bold">{zh ? "先認識你，再建立個人化計畫" : "Your answers shape your next steps"}</h2>{data.active || data.paid ? <ActionPlanBuilder discoveryTrial discoverySetup={data.setup} autoOpen onGenerated={() => void load()} /> : <Link className={button} href={pathForLocale("/dashboard/account#plan", locale)}>{zh ? "試用已結束，查看方案" : "Your trial ended · view plans"}</Link>}{error && <p role="alert" className="whitespace-pre-wrap text-red-700">{error}</p>}</section>;
  if (data.setup?.confirmed && data.setup.personalization && personalizationRoute(data.setup.personalization) !== "interviews" && !showInterviews) return <section className="space-y-5 rounded-2xl border border-dark/15 bg-white p-5 sm:p-7">
    <h2 className="text-base font-semibold">{zh ? "你的個人化起步計畫" : "Your personalised starter plan"}</h2>
    <p className="text-sm">{data.paid ? (zh ? "完整方案功能已依原權益開放。" : "Full features follow your existing plan.") : data.active ? (zh ? `試用剩餘 ${data.daysRemaining} 天。完整銷售與行動計畫工作區依方案開放。` : `${data.daysRemaining} trial days remaining. Full sales and action-plan workspaces require an eligible plan.`) : (zh ? "試用已結束，已存建議與訪談仍保留。" : "Your trial ended. Saved recommendations and conversations are retained.")}</p>
    <PersonalizationSummary value={data.setup.personalization} locale={locale} showSteps />
    <div className="flex flex-wrap gap-3"><Link className={button} href={pathForLocale(data.paid ? "/dashboard/agenda?guide=build" : "/dashboard/account#plan", locale)}>{data.paid ? (zh ? "依此建立完整任務" : "Build the full task plan") : (zh ? "查看完整功能方案" : "View full-feature plans")}</Link><button type="button" className={button} onClick={() => setShowInterviews(true)}>{zh ? `選看訪談工作區（已記錄 ${data.total} 家）` : `Optional conversations (${data.total} companies saved)`}</button></div>
    {error && <p role="alert" className="whitespace-pre-wrap text-red-700">{error}</p>}
  </section>;
  return <section id="discovery" className="space-y-6 scroll-mt-6" aria-label={zh ? "客戶訪談里程碑" : "Customer conversation milestone"}>
    {showInterviews && data.setup?.personalization && <button className={button} onClick={() => setShowInterviews(false)}>{zh ? "返回我的起步任務" : "Back to my starter steps"}</button>}
    {compactTrial && <NextStepsTour mission={(data.setup?.personalization ? personalizedSteps(data.setup.personalization, locale)[0] : data.setup?.answers[2]?.answer) || (zh ? "訪談 3 間公司，找出初步訊號" : "Talk with 3 companies. Find your first signal.")} target={data.target} />}

    <section data-next-step="goal" className="rounded-2xl bg-black p-4 text-white sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><p className="text-xs font-semibold text-white/55">{zh ? "本日優先行動" : "Today's priority"}</p><h2 className="mt-2 text-lg font-bold sm:text-xl">{zh ? `與 ${data.target} 間目標公司對話，了解真實需求` : `Understand real needs through ${data.target} company conversations`}</h2></div>
        {!data.canCreate && <a className={`${button} shrink-0 self-start bg-white text-black`} href={`#discovery-record-${data.journeyId}`}>{zh ? "查看已存對話" : "View saved conversations"}</a>}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-white/20 pt-4 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="col-span-2 sm:col-span-1"><dt className="text-xs text-white/55">{zh ? "完成標準" : "Completion criteria"}</dt><dd className="mt-1 text-sm font-semibold">{zh ? `${data.target} 間不同公司的有效對話，保存實際需求與原話。` : `Save valid conversations with ${data.target} distinct companies, including their needs and exact words.`}</dd></div>
        <div data-next-step="insights"><dt className="text-xs text-white/55">{zh ? "目前進度" : "Current progress"}</dt><dd className="mt-1 text-sm font-semibold">{Math.min(data.total, data.target)} / {data.target} {zh ? "間公司" : "companies"}</dd></div>
        <div><dt className="text-xs text-white/55">{data.paid ? (zh ? "工作區" : "Workspace") : (zh ? "試用狀態" : "Trial status")}</dt><dd className="mt-1 text-sm font-semibold">{data.paid ? (zh ? "完整客戶探索" : "Full customer discovery") : data.active ? (zh ? `還有 ${data.daysRemaining} 天` : `${data.daysRemaining} days remaining`) : (zh ? "試用已結束" : "Trial ended")}</dd></div>
      </dl>
      <progress aria-label={zh ? "訪談里程碑進度" : "Conversation milestone progress"} value={Math.min(data.total, data.target)} max={data.target} className="mt-4 block h-1 w-full overflow-hidden rounded-full bg-white/20 [&::-webkit-progress-bar]:bg-white/20 [&::-webkit-progress-value]:bg-white [&::-moz-progress-bar]:bg-white" />
    </section>
    <section id={`discovery-record-${data.journeyId}`} data-next-step="record" className="scroll-mt-6 space-y-3">
      <h3 className="text-sm font-bold">{zh ? "客戶對話紀錄" : "Customer conversation record"}</h3>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4 rounded-2xl border border-dark/10 bg-white p-4 sm:p-5">{!data.canCreate && <p className="rounded-xl bg-dark/5 p-3 text-sm">{!data.paid ? (zh ? "試用訪談先停在這裡。已儲存內容保留；升級後可繼續其餘訪談與完整分析。" : "Your trial conversations pause here. Saved records are retained; upgrade to continue and unlock full analysis.") : (zh ? "十次訪談已記錄，可查看完整分析，或在下方建立下一步計畫。" : "Ten conversations saved. Review the full analysis or build your next plan below.")}</p>}<CustomerDiscovery key={data.journeyId} journeyId={data.journeyId} userId={userId} rows={data.rows} outcomes={[]} createDisabled={!data.canCreate} readOnly={busy || (!data.paid && !data.active)} onSaved={() => void load()} /></div>
        <aside className="min-w-0 space-y-3 rounded-2xl border border-dark/10 bg-white p-4 sm:p-5"><h4 className="text-base font-bold">{zh ? "如何進行一場有效的客戶對話" : "How to have an effective customer conversation"}</h4><LearningResources visual kind="interview" question={zh ? "如何進行訪談？" : "How to run a conversation?"} /><p className="text-sm font-semibold">{zh ? "建議提問" : "Suggested questions"}</p><ol className="list-decimal space-y-2 pl-5 text-sm leading-6"><li>{zh ? "對方是否符合你的目標客群？" : "Does this person fit your target customer profile?"}</li><li>{zh ? "目前如何處理這個問題？" : "How do they handle this problem today?"}</li><li>{zh ? "最近一次遇到這個問題是什麼時候？" : "When did they last experience this problem?"}</li><li>{zh ? "這個問題每月花費多少時間或成本？" : "How much time or money does this cost each month?"}</li></ol></aside>
      </div>
    </section>
    {data && !data.paid && !data.active && data.total < 3 && <p className="rounded-xl border border-dark/15 bg-white p-5 text-sm">{zh ? "14 天試用已結束，已存訪談完整保留。" : "Your 14-day trial ended. Saved conversations are retained."} <Link className={`${button} mt-3`} href={pathForLocale("/dashboard/account#plan", locale)}>{zh ? "查看一般方案，繼續訪談" : "View regular plans to continue"}</Link></p>}
    {data && !data.paid && data.total === 3 && <section className="space-y-4 rounded-2xl border border-dark/15 bg-white p-5 sm:p-7" aria-label={zh ? "初步訪談訊號" : "Preliminary conversation signal"}>
      <p className="text-xs font-semibold uppercase tracking-[0.15em]">{zh ? "你已完成第一個里程碑" : "Your first milestone is complete"}</p>
      <h3 className="text-xl font-bold">{zh ? "初步訊號，還不是結論" : "An early signal, not a conclusion"}</h3>
      {preview ? preview.topics[0] ? <><p className="text-lg font-semibold">{zh ? `目前分析的 ${preview.total} 次訪談中，有 ${preview.topics[0].count} 間公司提到相近痛點：${preview.topics[0].label}` : `${preview.topics[0].count} of the ${preview.total} companies analysed described a similar pain: ${preview.topics[0].label}`}</p><details><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">{zh ? "查看訪談依據" : "View the conversation evidence"}</summary>{preview.topics[0].evidence.map((source, i) => <blockquote key={`${source.recordId}-${i}`} className="mt-3 border-l-2 border-dark/20 pl-4 text-sm text-dark/70">{source.quote}</blockquote>)}</details></> : <p>{zh ? "目前的訪談還沒有出現可核對的共同痛點，這也是有用的訊號。" : "These conversations do not yet show a verifiable shared pain. That is useful evidence too."}</p> : <p role="status">{analysing ? (zh ? "NOVA 正在核對你的訪談…" : "NOVA is checking your conversation evidence…") : (zh ? "初步分析尚未完成，原始紀錄已保存。" : "Preliminary analysis is not ready. Your conversations are saved.")}</p>}
      {!preview && <button type="button" disabled={analysing} className={button} onClick={() => void analyse(false)}>{zh ? "產生／重試初步分析" : "Generate / retry preliminary analysis"}</button>}
    </section>}
    {data && data.total >= 3 && !data.paid && <FounderOffer />}
    {data && !data.paid && <section id="prospects" data-next-step="followup" className="space-y-3"><h3 className="text-sm font-bold">{zh ? "累積 3 份客戶洞察，取得 5 間優先目標公司" : "Save 3 customer insights to unlock 5 priority prospects"}</h3>{data.total >= 3 ? <ProspectSearch userId={userId} compact /> : <div className="rounded-xl border border-dark/15 bg-white p-4 text-sm">{zh ? `再完成 ${3 - data.total} 家有效訪談，即可查看五家新公司的搜尋入口。` : `Complete ${3 - data.total} more valid company conversations to unlock the five-company search entry.`}</div>}</section>}
    {data?.paid && data.journeyId && showCommercial && <ValidationWorkspace userId={userId} planId={planId} journeyId={planId ? undefined : data.journeyId} revision={data.version} />}
    {data.setup?.confirmed && data.setup.diagnosis && <details className="group rounded-2xl border border-dark/15 bg-white px-4 sm:px-5"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-base font-semibold">{zh ? "你的個人化起步計畫" : "Your personalised starter plan"}<span aria-hidden="true" className="ml-auto shrink-0 text-dark/50 group-open:rotate-180">⌄</span></summary><div className="space-y-4 pb-5">{data.setup.personalization && <PersonalizationSummary value={data.setup.personalization} locale={locale} showSteps />}<p className="font-semibold">{zh ? "你的目標" : "Your goal"}: {(data.setup.personalization ? personalizationResponses(data.setup.personalization, locale)[4].answer : data.setup.answers[2]?.answer)}</p><div><h3 className="font-semibold">{zh ? "目前階段" : "Your stage"}: {data.setup.diagnosis.companyStage}</h3><p className="mt-2 text-sm">{data.setup.diagnosis.stageReason}</p></div><div><h3 className="font-semibold">{zh ? "目前瓶頸" : "Your bottleneck"}: {bottleneckLabel(data.setup.diagnosis.bottleneckGroup, data.setup.diagnosis.bottleneckCode)}</h3><p className="mt-2 text-sm">{data.setup.diagnosis.bottleneckReason}</p></div><details><summary className="min-h-11 cursor-pointer py-3 font-semibold">{zh ? "沿用的開場回答" : "Saved opening answers"}</summary>{!data.setup.answers.length && <p className="text-sm">{zh ? "未保存原始回答。" : "Original answers were not saved."}</p>}{data.setup.answers.map(row => <div key={row.question} className="mt-3"><p className="text-sm font-semibold">{row.question}</p><p className="mt-1 whitespace-pre-wrap text-sm">{row.answer}</p></div>)}</details></div></details>}
    {error && <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap">{error}</p><button type="button" className={button} onClick={() => void load()}>{zh ? "重新載入，保留已輸入內容" : "Reload · keep my input"}</button></div>}
    {data?.paid && planId && !showCommercial && <a href={`#validation-${planId}`} className={button}>{zh ? "繼續聯絡與付款驗證 →" : "Continue to outreach and payment validation →"}</a>}

  </section>;
}
