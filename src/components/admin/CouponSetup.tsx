"use client";
import { useState } from "react";
import { readAdminResponse } from "@/lib/cms/admin-response";
import type { couponSetupStatus } from "@/lib/billing/coupon-setup";
type Status = Awaited<ReturnType<typeof couponSetupStatus>>;
export default function CouponSetup({ initial }: { initial: Status }) {
  const [data, setData] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [code, setCode] = useState("");
  const [percent, setPercent] = useState(60), [starts, setStarts] = useState("2026-11-01T00:00"), [ends, setEnds] = useState("2026-12-01T00:00"), [revision, setRevision] = useState(0);
  function edit(value: string) {
    const entry = data.codes[value]; setCode(value); setRevision(typeof entry === "object" ? entry.revision : 0);
    setPercent(typeof entry === "object" ? entry.percentOff : 60);
    const local = (value: string) => new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0,16);
    setStarts(typeof entry === "object" ? local(entry.startsAt) : "2026-11-01T00:00"); setEnds(typeof entry === "object" ? local(entry.endsAt) : "2026-12-01T00:00");
  }
  async function prepare(customCode?: string) {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try {
      for (const p of data.plans) {
        setNotice(`核對 ${p.plan === "pro" ? "SPARK" : "NOVA"} ${p.interval === "month" ? "月繳" : "年繳"}…`);
        await readAdminResponse(await fetch("/api/admin/billing/coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: p.plan, interval: p.interval, ...(customCode ? { code: customCode } : {}) }) }));
        setData(await readAdminResponse(await fetch("/api/admin/billing/coupon", { cache: "no-store" })) as Status);
      }
      setNotice("四個付款方案已核對；自訂代碼可按「啟用」。原 11 月活動仍沿用原環境設定。不會建立會員訂閱或扣款。");
    } catch (cause) { setNotice(""); setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function saveCode(value: string, enabled: boolean, saveTerms = false) {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try {
      const next = await readAdminResponse(await fetch("/api/admin/billing/coupon", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: value, enabled, ...(saveTerms ? { terms: { percentOff: percent, startsAt: new Date(starts + "+08:00").toISOString(), endsAt: new Date(ends + "+08:00").toISOString() }, revision } : {}) }) })) as Status;
      setData(next); if (saveTerms) { setCode(""); setRevision(0); } setNotice(`代碼 ${value.trim().toUpperCase()} 已${enabled ? "啟用" : "停用"}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <section className="max-w-3xl space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
    <h2 className="text-lg font-semibold">優惠代碼管理 · 自訂首期折扣</h2>
    <p className="text-sm">環境：{data.environment} · {data.enabled ? "優惠總開關已開啟" : "優惠總開關未開啟"}。每帳號限一次新購優惠；後續原價自動續訂。</p>
    <p className="text-sm text-neutral-600">折扣可填 1–99 的整數；80% OFF 表示首期付原價的 20%。設定按台北時間；結束時間不含該時刻。儲存先停用，核對四個付款方案後再啟用。停用不影響已建立訂單或訂閱；保留歷史，不提供永久刪除。</p>
    <form onSubmit={event => { event.preventDefault(); void saveCode(code, false, true); }} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">優惠代碼<input aria-label="新增優惠代碼" value={code} maxLength={32} required pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" onChange={event => { const value=event.target.value.toUpperCase();setCode(value);const entry=data.codes[value];setRevision(typeof entry==='object'?entry.revision:0); }} className="mt-1 block min-h-11 w-full rounded-lg border px-3 uppercase" /></label>
      <label className="text-sm">首期折扣（% OFF）<input aria-label="首期折扣百分比" type="number" min="1" max="99" step="1" required value={percent} onChange={e=>setPercent(Number(e.target.value))} className="mt-1 block min-h-11 w-full rounded-lg border px-3" /></label>
      <label className="text-sm">開始時間（台北）<input aria-label="開始時間（台北）" type="datetime-local" required value={starts} onChange={e=>setStarts(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border px-3" /></label>
      <label className="text-sm">結束時間（台北）<input aria-label="結束時間（台北）" type="datetime-local" required value={ends} onChange={e=>setEnds(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border px-3" /></label>
      <button disabled={busy || !code.trim()} className="min-h-11 rounded-lg bg-neutral-900 px-4 text-sm text-white disabled:opacity-50">儲存為停用</button>
    </form>
    <ul className="space-y-3">{Object.entries(data.codes).map(([value, entry]) => { const custom=typeof entry==='object',enabled=custom?entry.enabled:entry,ready=!custom||(['pro','business'].every(plan=>['month','year'].every(period=>Boolean(entry.plans[`${data.environment}:${plan}:${period}`])))); return <li key={value} className="space-y-2 rounded-lg border p-3">
      <p className="break-all text-sm font-semibold">{value} · {enabled ? '啟用' : '停用'} · {custom?entry.percentOff:60}% OFF{!ready?' · 付款方案待核對':''}</p>
      {custom&&<p className="text-sm">{new Date(entry.startsAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})} 至 {new Date(entry.endsAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}（台北）</p>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className="min-h-11 rounded-lg border px-4 text-sm" onClick={()=>edit(value)} aria-label={`編輯 ${value}`}>編輯</button>{custom&&<button type="button" disabled={busy} className="min-h-11 rounded-lg border px-4 text-sm" onClick={()=>void prepare(value)} aria-label={`核對 ${value}`}>核對付款方案</button>}<button type="button" disabled={busy||(!enabled&&!ready)} onClick={()=>void saveCode(value,!enabled)} className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-50" aria-label={`${enabled?'停用':'啟用'} ${value}`}>{enabled?'停用':'啟用'}</button></div>
    </li>;})}</ul>
    <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">舊版 11 月 60% 活動付款設定</summary><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">方案</th><th className="p-2">首期</th><th className="p-2">後續每期</th><th className="p-2">設定狀態</th></tr></thead><tbody>{data.plans.map(p => <tr key={p.env} className="border-t"><td className="p-2">{p.plan === "pro" ? "SPARK" : "NOVA"} · {p.interval === "month" ? "月繳" : "年繳"}</td><td className="p-2">US${(p.firstAmountMinor / 100).toFixed(2)}</td><td className="p-2">US${(p.regularAmountMinor / 100).toFixed(2)}</td><td className="break-all p-2">{p.configuredId ? "已設定" : p.preparedId ? "已準備，待啟用設定" : "待建立"}<span className="block text-xs">{p.preparedId || p.configuredId}</span></td></tr>)}</tbody></table></div>
    <button onClick={() => void prepare()} disabled={busy} className="min-h-11 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "處理中…" : "建立並核對 PayPal 優惠方案"}</button></details>
    {notice && <p role="status" className="whitespace-pre-wrap text-sm">{notice}</p>}{error && <div role="alert" className="whitespace-pre-wrap text-sm text-red-700"><p>{error}</p><button type="button" disabled={busy} className="mt-2 min-h-11 rounded-lg border px-4" onClick={async()=>{setBusy(true);try{setData(await readAdminResponse(await fetch("/api/admin/billing/coupon",{cache:"no-store"})) as Status);setError("");setNotice("設定已重新載入，輸入保留；請比較列表後再編輯。");}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{setBusy(false);}}}>重新載入設定，保留輸入</button></div>}
  </section>;
}
