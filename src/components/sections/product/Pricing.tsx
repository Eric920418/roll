"use client";
import { MEETING_URL, meetingLabel } from "@/lib/public-contact";
import { useState } from "react";
import { useLocale } from "next-intl";
import { track } from "@/lib/analytics";
import { planContent } from "@/lib/billing/catalog";
import { priceLabel, monthlyEquivalentLabel, type BillingInterval } from "@/lib/billing/plans";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export default function Pricing({ prices, tokenPricing }: { prices: typeof import("@/lib/billing/plans").PLAN_CONFIG; tokenPricing: { monthlyGrant: number; inviteFee: number; searchFee: number } }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw", w = (a: string,b: string) => zh ? a : b;
  const [interval, setInterval] = useState<BillingInterval>("month"), catalog = planContent(zh);
  const plans = ["free", "pro", "business", "enterprise"] as const;
  const rows = [
    [w("公司檔案與目標客戶假設", "Company profile and customer hypotheses"), ["✓","✓","✓","✓"]],
    [w("客戶對話與關鍵發現", "Customer conversations and findings"), [w("試用 3 家", "3-company trial"),"✓","✓","✓"]],
    [w("5 里程碑／16 步今日任務", "Five milestones / sixteen priority steps"), [w("試用起步流程", "Trial starting steps"),"✓","✓","✓"]],
    [w("Google／Apple 行事曆匯出", "Google / Apple Calendar export"), ["—","✓","✓","✓"]],
    [w("每月方案贈送 Token", "Monthly plan Token grant"), ["—",String(tokenPricing.monthlyGrant),String(tokenPricing.monthlyGrant),String(tokenPricing.monthlyGrant)]],
    [w("新公司搜尋與會員媒合", "Company search and member matchmaking"), [w("符合資格一次 POC", "One eligible POC"),"—","✓","✓"]],
    [w("認證導師圓桌會議", "Roundtables with certified mentors"), ["—","—","✓","✓"]],
    [w("成果報告、列印與主動分享", "Result reports, printing and optional sharing"), ["—","✓","✓","✓"]],
    [w("市場進入顧問與執行", "Market-entry advisory and execution"), ["—","—","—","✓"]],
  ] as const;
  return <section id="pricing" className="scroll-mt-24 px-6 py-16 md:py-24"><div className="mx-auto max-w-[1312px]">
    <p className="text-[10px] font-semibold tracking-[.18em]">{w("方案價格", "PRICING")}</p><h2 className="mt-5 text-4xl font-semibold tracking-[-.05em] md:text-6xl">{w("選擇你現在的階段。", "Choose the stage you're in.")}</h2><p className="mt-4 text-sm text-neutral-600">{w("免費開始，需要時再升級。", "Start free. Upgrade when you're ready to grow.")}</p>
    <div className="mt-7 flex gap-1" role="group" aria-label={w("付款週期", "Billing interval")}>{(["month","year"] as const).map(v => <button key={v} type="button" aria-pressed={interval===v} className={`min-h-11 rounded-md border px-5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${interval===v?"bg-black text-white":"bg-white"}`} onClick={() => setInterval(v)}>{v==="month"?w("月繳","Monthly"):w("年繳","Yearly")}</button>)}</div>
    <div className="mt-8 grid gap-4 min-[640px]:grid-cols-2 min-[1280px]:grid-cols-4">{plans.map(key => <article key={key} data-pricing-card={key} className={`row-span-7 grid min-w-0 grid-rows-subgrid gap-y-0 rounded-xl border p-6 ${key==="business"?"border-black bg-black text-white":"border-neutral-300 bg-white"}`}>
      <p className="min-h-5 text-[10px] font-semibold tracking-widest">{key==="business"?w("熱門選擇","MOST POPULAR"):""}</p><h3 className="mt-3 text-lg font-bold">{catalog[key].name}</h3><p className="mt-3 min-h-12 text-sm opacity-70">{catalog[key].audience}</p><div data-pricing-part="amount" className="mt-5 flex min-h-12 items-end"><p className="break-words text-3xl font-semibold leading-none tracking-tight">{key==="free"?"USD 0":key==="enterprise"?w("客製報價","Custom"):interval==="month"?priceLabel(key,"month",prices):monthlyEquivalentLabel(key,prices)}</p></div><p data-pricing-part="billing" className="mt-2 min-h-10 self-start text-xs opacity-70">{key==="free"?w("14 天 · 無需信用卡","14 days · No credit card"):key==="enterprise"?w("依市場與目標洽詢","Tailored to your market and goals"):interval==="year"?w(`每年實收 ${priceLabel(key,"year",prices)}`,`${priceLabel(key,"year",prices)} charged yearly`):w("每月收費","Charged monthly")}</p>
      <ul data-pricing-part="features" className="my-6 space-y-3 text-sm">{catalog[key].features.map(f => <li key={f} className="flex gap-2"><span aria-hidden="true">✓</span><span>{f}</span></li>)}</ul>
      <a data-pricing-part="action" className={`self-stretch inline-flex min-h-11 items-center justify-center rounded-md border px-4 py-3 text-center text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${key==="business"?"bg-white text-black":"border-black bg-black text-white"}`} href={key==="enterprise"?MEETING_URL:pathForLocale("/signup",locale)} target={key === "enterprise" ? "_blank" : undefined} rel={key === "enterprise" ? "noopener noreferrer" : undefined} onClick={() => track("flow_start",{feature:"upgrade"})}>{key==="enterprise"?meetingLabel(locale):key==="free"?w("免費開始","Start for free"):w("開始使用","Get started")}</a>
    </article>)}</div>
    <div className="mt-10 overflow-x-auto rounded-lg border border-neutral-300" tabIndex={0} role="region" aria-label={w("方案功能比較，可水平捲動", "Plan comparison; scroll horizontally")}><table className="w-full min-w-[660px] border-collapse text-left text-sm"><caption className="sr-only">{w("各方案實際功能", "Actual plan features")}</caption><thead><tr className="border-b bg-neutral-100"><th scope="col" className="p-4">{w("功能", "Features")}</th>{plans.map(key => <th scope="col" key={key} className="p-4">{catalog[key].name}</th>)}</tr></thead><tbody>{rows.map(([label,values]) => <tr key={label} className="border-b last:border-0"><th scope="row" className="p-4 font-normal">{label}</th>{values.map((v,i) => <td className={`p-4 ${i===2?"bg-black text-white":""}`} key={i}>{v}</td>)}</tr>)}</tbody></table></div>
    <p className="mt-5 text-xs leading-6 text-neutral-600">{w(`價格為美元。搜尋每 5 家 ${tokenPricing.searchFee} Token；交流預扣 ${tokenPricing.inviteFee} Token，接受後結算。Token 與 AI 次數分開；既有方案權益保留。`, `Prices in USD. Search five companies for ${tokenPricing.searchFee} Token; chat requests reserve ${tokenPricing.inviteFee} Token, settled on acceptance. Token are separate from AI allowances. Existing entitlements are preserved.`)}</p>
  </div></section>;
}
