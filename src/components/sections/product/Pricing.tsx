"use client";
import { MEETING_URL, meetingLabel } from "@/lib/public-contact";
import { useState } from "react";
import { useLocale } from "next-intl";
import { track } from "@/lib/analytics";
import { planContent } from "@/lib/billing/catalog";
import { priceLabel, monthlyEquivalentLabel, type BillingInterval } from "@/lib/billing/plans";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import s from "./landing.module.css";

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
    [w("新公司搜尋與新創生態系", "Company search and Value Network"), [w("符合資格一次 POC", "One eligible POC"),"—","✓","✓"]],
    [w("認證導師圓桌會議", "Roundtables with certified mentors"), ["—","—","✓","✓"]],
    [w("成果報告、列印與主動分享", "Result reports, printing and optional sharing"), ["—","✓","✓","✓"]],
    [w("市場進入顧問與執行", "Market-entry advisory and execution"), ["—","—","—","✓"]],
  ] as const;
  return <section id="pricing" className={s.pricingSection} aria-labelledby="pricing-heading">
    <h2 id="pricing-heading">{w("選擇你現在的階段。", "Choose the stage you're in.")}</h2>
    <div className={s.billingToggle} role="group" aria-label={w("付款週期", "Billing interval")}>
      {(["month", "year"] as const).map(value => <button key={value} type="button" aria-pressed={interval === value}
        onClick={() => setInterval(value)}>{value === "month" ? w("月繳", "Monthly") : w("年繳", "Yearly")}</button>)}
    </div>
    <div className={s.planGrid}>
      <p className={s.planLegend}>{interval === "month" ? w("每月方案", "Monthly plans") : w("年繳方案", "Yearly plans")}</p>
      {plans.map(key => <article key={key} data-pricing-card={key} className={`${s.planCard} ${key === "business" ? s.featuredPlan : ""}`}>
        <div className={s.planName}><h3>{catalog[key].name}</h3>{key === "business" && <span>{w("熱門", "POPULAR")}</span>}</div>
        <p className={s.planAudience}>{catalog[key].audience}</p>
        <div data-pricing-part="amount" className={s.planAmount}>
          <strong>{key === "free" ? "USD 0" : key === "enterprise" ? w("客製報價", "Custom quote")
            : interval === "month" ? priceLabel(key, "month", prices) : monthlyEquivalentLabel(key, prices)}</strong>
        </div>
        <p data-pricing-part="billing" className={s.planBilling}>{key === "free" ? w("14 天・無需信用卡", "14 days · No credit card")
          : key === "enterprise" ? w("依市場與目標洽詢", "Tailored to your market and goals")
          : interval === "year" ? w(`每年實收 ${priceLabel(key, "year", prices)}`, `${priceLabel(key, "year", prices)} charged yearly`)
          : w("每月收費", "Charged monthly")}</p>
        <a data-pricing-part="action" className={s.planAction}
          href={key === "enterprise" ? MEETING_URL : pathForLocale("/signup", locale)}
          target={key === "enterprise" ? "_blank" : undefined} rel={key === "enterprise" ? "noopener noreferrer" : undefined}
          onClick={() => track("flow_start", { feature: "upgrade" })}>{key === "enterprise" ? meetingLabel(locale)
            : key === "free" ? w("免費開始", "Start free") : w("開始使用", "Get started")}</a>
      </article>)}
    </div>
    <div className={s.comparison} tabIndex={0} role="region" aria-label={w("方案功能比較，可水平捲動", "Plan comparison; scroll horizontally")}>
      <table><caption className="sr-only">{w("各方案實際功能", "Actual plan features")}</caption>
        <colgroup><col className={s.featureColumn} />{plans.map(key => <col key={key} />)}</colgroup>
        <thead><tr><th scope="col">{w("功能", "Features")}</th>{plans.map(key => <th scope="col" key={key} className={key === "business" ? s.featuredCell : undefined}>{catalog[key].name}</th>)}</tr></thead>
        <tbody>{rows.map(([label, values]) => <tr key={label}><th scope="row">{label}</th>{values.map((value, index) =>
          <td key={index} className={index === 2 ? s.featuredCell : undefined}>{value}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </section>;
}
