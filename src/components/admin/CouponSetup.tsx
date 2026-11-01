"use client";
import { useState } from "react";
import { readAdminResponse } from "@/lib/cms/admin-response";
import type { couponSetupStatus } from "@/lib/billing/coupon-setup";
type Status = Awaited<ReturnType<typeof couponSetupStatus>>;
export default function CouponSetup({ initial }: { initial: Status }) {
  const [data, setData] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
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
  return <section className="max-w-3xl space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
    <h2 className="text-lg font-semibold">11 月優惠碼 NOVA60 · 首期 60% OFF</h2>
    <p className="text-sm">2026/11/1–11/30（台北時間），每帳號限一次新購訂閱；後續原價續訂。環境：{data.environment} · {data.enabled ? "活動已開啟" : "活動尚未開啟"}</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">方案</th><th className="p-2">首期</th><th className="p-2">後續每期</th><th className="p-2">設定狀態</th></tr></thead><tbody>{data.plans.map(p => <tr key={p.env} className="border-t"><td className="p-2">{p.plan === "pro" ? "SPARK" : "NOVA"} · {p.interval === "month" ? "月繳" : "年繳"}</td><td className="p-2">US${(p.firstAmountMinor / 100).toFixed(2)}</td><td className="p-2">US${(p.regularAmountMinor / 100).toFixed(2)}</td><td className="break-all p-2">{p.configuredId ? "已設定" : p.preparedId ? "已準備，待啟用設定" : "待建立"}<span className="block text-xs">{p.preparedId || p.configuredId}</span></td></tr>)}</tbody></table></div>
    <button onClick={() => void prepare()} disabled={busy} className="min-h-11 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "處理中…" : "建立並核對 PayPal 優惠方案"}</button>
    {notice && <p role="status" className="whitespace-pre-wrap text-sm">{notice}</p>}{error && <p role="alert" className="whitespace-pre-wrap text-sm text-red-700">{error}</p>}
  </section>;
}
