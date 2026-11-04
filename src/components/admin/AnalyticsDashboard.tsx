"use client";

import { useEffect, useState } from "react";
import { ANALYTICS_FEATURES, type AnalyticsFeature } from "@/lib/analytics";
import { memberFetch } from "@/lib/member-fetch";
import type { AnalyticsReport } from "@/lib/admin/analytics";

const labels: Record<AnalyticsFeature, string> = { matchmaking: "會員搜尋", chat_invite: "聊天邀請", chat_accept: "接受邀請", icp: "Saved ICP", interview: "訪談紀錄", prospects: "新公司名單", rewards: "積分兌換", feedback: "Feedback", trial_incentive: "試用延長", upgrade: "訂閱申請" };
const number = (value: number) => value.toLocaleString("zh-TW");
const date = (value: string) => new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
const panel = "rounded-2xl border border-neutral-200 bg-white p-5 md:p-6";

export default function AnalyticsDashboard() {
  const [days, setDays] = useState("7"), [feature, setFeature] = useState<AnalyticsFeature>("icp"), [retry, setRetry] = useState(0);
  const [report, setReport] = useState<AnalyticsReport | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    memberFetch<AnalyticsReport>(`/api/admin/analytics?days=${days}&feature=${feature}`).then(data => { if (active) setReport(data); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "無法載入報表，請重試。"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, feature, retry]);
  function refresh() { setLoading(true); setError(""); setReport(null); }
  const max = Math.max(1, ...(report?.daily.map(row => row.y) || []));
  return <div className="max-w-6xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold tracking-widest text-neutral-500">UMAMI · NOVA</p><h1 className="mt-2 text-2xl font-bold">數據分析</h1><p className="mt-2 text-sm text-neutral-600">流量、功能完成與可能中斷的操作，僅管理員可見。</p></div>
      <div className="flex gap-2 items-center"><label htmlFor="analytics-days" className="sr-only">統計期間</label><select id="analytics-days" value={days} onChange={event => { refresh(); setDays(event.target.value); }} className="min-h-11 rounded-lg border border-neutral-300 px-3">{[7, 30, 90].map(n => <option key={n} value={n}>最近 {n} 天</option>)}</select><button type="button" disabled={loading} onClick={() => { refresh(); setRetry(n => n + 1); }} className="min-h-11 rounded-lg border border-neutral-300 px-4 disabled:opacity-50">重新整理</button></div>
    </div>
    {loading && <p role="status" className={panel}>正在讀取 Umami 數據…</p>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5"><p className="whitespace-pre-wrap break-words text-red-700">{error}</p><button type="button" onClick={() => { refresh(); setRetry(n => n + 1); }} className="mt-3 min-h-11 rounded-lg bg-black px-4 text-white">重試</button></div>}
    {report && !loading && !error && <>
      <p className="text-sm text-neutral-600">自行部署資料起始：{date(report.startedAt)}。更新：{date(report.generatedAt)}，最多快取 5 分鐘。<a className="ml-2 underline" href="https://cloud.umami.is/analytics/us/websites/5dcd102e-1345-4839-a7cc-1dd7a5581168" target="_blank" rel="noopener noreferrer">切換前的 Cloud 歷史資料 ↗</a></p>
      <div className="grid gap-4 sm:grid-cols-3">{([["訪客（瀏覽器去重）", "visitors"], ["頁面瀏覽", "pageviews"], ["造訪次數", "visits"]] as const).map(([label, key]) => <section key={key} className={panel}><h2 className="text-sm text-neutral-600">{label}</h2><p className="mt-3 text-4xl font-bold">{number(report.stats[key])}</p><p className="mt-3 text-xs text-neutral-500">{report.comparable ? `前期 ${number(report.stats.comparison[key])}` : "比較資料不足"}</p></section>)}</div>
      {report.stats.pageviews === 0 && <p role="status" className={panel}>此期間尚未收到頁面瀏覽，並非載入失敗。原 Cloud 歷史資料仍保留。</p>}
      <section className={panel}><h2 className="font-semibold">每日頁面瀏覽 · 台北時間</h2><div className="mt-5 flex h-40 items-end gap-px" role="img" aria-label={report.daily.map(row => `${row.x}：${row.y}`).join("；") || "尚無每日數據"}>{report.daily.map(row => <div key={row.x} className="min-w-0 flex-1 bg-neutral-900 rounded-t" style={{ height: `${row.y / max * 100}%` }} title={`${row.x.slice(0, 10)}：${row.y}`} />)}</div><div className="mt-2 flex justify-between text-xs text-neutral-500"><span>{report.daily[0]?.x.slice(0, 10)}</span><span>{report.daily.at(-1)?.x.slice(0, 10)}</span></div></section>
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">操作漏斗與有效停留</h2><label><span className="sr-only">選擇功能</span><select className="min-h-11 rounded-lg border border-neutral-300 px-3" value={feature} onChange={event => { refresh(); setFeature(event.target.value as AnalyticsFeature); }}>{ANALYTICS_FEATURES.map(name => <option key={name} value={name}>{labels[name]}</option>)}</select></label></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-neutral-600">開始的訪客</p><p className="mt-2 text-3xl font-semibold">{number(report.funnel.started)}</p></div><div><p className="text-sm text-neutral-600">60 分鐘內依序完成</p><p className="mt-2 text-3xl font-semibold">{number(report.funnel.completed)}<span className="ml-2 text-sm text-neutral-500">{report.funnel.started ? `${Math.round(report.funnel.completed / report.funnel.started * 100)}%` : "資料不足"}</span></p></div><div><p className="text-sm text-neutral-600">每段有效停留（平均）</p><p className="mt-2 text-3xl font-semibold">{report.time.total ? `${Math.round(report.time.average)} 秒` : "—"}</p></div></div>
        <p className="mt-5 text-xs text-neutral-500">只累計可見、聚焦且近期有操作的停留。漏斗未完成表示未觀察到後續事件，不能直接認定為 Bug；訂閱申請不等於付款成功，精準會員留存以平台資料庫為準。</p>
      </section>
      <div className="grid gap-6 lg:grid-cols-2"><section className={`${panel} overflow-x-auto`}><h2 className="mb-4 font-semibold">各功能操作次數</h2><table className="w-full text-sm"><thead><tr className="border-b text-left text-neutral-500"><th className="py-3 font-normal">功能</th><th>開始</th><th>成功</th><th>失敗</th></tr></thead><tbody>{report.features.map(row => <tr key={row.feature} className="border-b border-neutral-100"><th scope="row" className="py-3 text-left font-medium">{labels[row.feature]}</th><td>{number(row.starts)}</td><td>{number(row.successes)}</td><td className={row.errors ? "font-semibold text-red-700" : ""}>{number(row.errors)}</td></tr>)}</tbody></table></section><section className={panel}><h2 className="mb-4 font-semibold">熱門頁面</h2>{report.pages.length ? <ul className="divide-y divide-neutral-100">{report.pages.map((row, index) => <li key={`${row.path}:${index}`} className="flex justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-all">{row.path}</span><span>{number(row.views)}</span></li>)}</ul> : <p className="text-sm text-neutral-500">尚無頁面資料。</p>}</section></div>
    </>}
  </div>;
}
