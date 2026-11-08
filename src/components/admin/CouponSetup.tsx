"use client";
import { useState } from "react";
import { readAdminResponse } from "@/lib/cms/admin-response";
import type { couponSetupStatus } from "@/lib/billing/coupon-setup";
type Status = Awaited<ReturnType<typeof couponSetupStatus>>;
export default function CouponSetup({ initial }: { initial: Status }) {
  const [data, setData] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [code, setCode] = useState("");
  async function prepare() {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try {
      for (const p of data.plans) {
        setNotice(`核對 ${p.plan === "pro" ? "SPARK" : "NOVA"} ${p.interval === "month" ? "月繳" : "年繳"}…`);
        await readAdminResponse(await fetch("/api/admin/billing/coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: p.plan, interval: p.interval }) }));
        setData(await readAdminResponse(await fetch("/api/admin/billing/coupon", { cache: "no-store" })) as Status);
      }
      setNotice("四個優惠方案已建立並核對；完成正式環境設定後才啟用優惠。不會建立會員訂閱或扣款。");
    } catch (cause) { setNotice(""); setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function saveCode(value: string, enabled: boolean) {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try {
      const next = await readAdminResponse(await fetch("/api/admin/billing/coupon", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: value, enabled }) })) as Status;
      setData(next); setCode(""); setNotice(`代碼 ${value.trim().toUpperCase()} 已${enabled ? "啟用" : "停用"}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <section className="max-w-3xl space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
    <h2 className="text-lg font-semibold">11 月優惠代碼管理 · 首期 60% OFF</h2>
    <p className="text-sm">2026/11/1–11/30（台北時間），每帳號限一次新購訂閱；後續原價續訂。環境：{data.environment} · {data.enabled ? "活動已開啟" : "活動尚未開啟"}</p>
    <p className="text-sm text-neutral-600">所有代碼共用本活動期限、首期折扣及每帳號一次資格；停用只阻止新付款，不影響已建立的訂單與續訂。不同折扣或活動期限需要另設付款方案。</p>
    <form onSubmit={event => { event.preventDefault(); void saveCode(code, true); }} className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-sm">新增優惠代碼<input aria-label="新增優惠代碼" value={code} maxLength={32} required pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" onChange={event => setCode(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border px-3 uppercase" /></label>
      <button disabled={busy || !code.trim()} className="min-h-11 rounded-lg bg-neutral-900 px-4 text-sm text-white disabled:opacity-50">新增並啟用</button>
    </form>
    <ul className="space-y-2">{Object.entries(data.codes).map(([value, enabled]) => <li key={value} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2"><span className="min-w-0 break-all text-sm">{value} · {enabled ? "啟用" : "停用"}</span><button type="button" disabled={busy} onClick={() => void saveCode(value, !enabled)} className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-50" aria-label={`${enabled ? "停用" : "啟用"} ${value}`}>{enabled ? "停用" : "啟用"}</button></li>)}</ul>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">方案</th><th className="p-2">首期</th><th className="p-2">後續每期</th><th className="p-2">設定狀態</th></tr></thead><tbody>{data.plans.map(p => <tr key={p.env} className="border-t"><td className="p-2">{p.plan === "pro" ? "SPARK" : "NOVA"} · {p.interval === "month" ? "月繳" : "年繳"}</td><td className="p-2">US${(p.firstAmountMinor / 100).toFixed(2)}</td><td className="p-2">US${(p.regularAmountMinor / 100).toFixed(2)}</td><td className="break-all p-2">{p.configuredId ? "已設定" : p.preparedId ? "已準備，待啟用設定" : "待建立"}<span className="block text-xs">{p.preparedId || p.configuredId}</span></td></tr>)}</tbody></table></div>
    <button onClick={() => void prepare()} disabled={busy} className="min-h-11 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "處理中…" : "建立並核對 PayPal 優惠方案"}</button>
    {notice && <p role="status" className="whitespace-pre-wrap text-sm">{notice}</p>}{error && <p role="alert" className="whitespace-pre-wrap text-sm text-red-700">{error}</p>}
  </section>;
}
