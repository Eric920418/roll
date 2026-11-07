"use client";
import { analyticsFetch } from "@/lib/analytics";

import { planContent } from "@/lib/billing/catalog";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import {
  billingVariantFor,
  monthlyEquivalentLabel,
  priceLabel,
  type BillingInterval,
} from "@/lib/billing/plans";
import type { Locale } from "@/i18n/routing";
import type { AiUsageSummary } from "@/lib/ai/allowance";
import { useRewards } from "./rewards/RewardsProvider";
import type { CouponQuote } from "@/lib/billing/coupons";
import { memberFetch } from "@/lib/member-fetch";

// 自助付費方案（free 不需購買；enterprise 走 contact sales）
const PAID_PLANS = ["pro", "business"] as const;
const BILLING_ERROR_CODES = [
  "planRequired",
  "unknownPlan",
  "notSelfServe",
  "paypalNotConfigured",
  "noSubscription",
  "alreadySubscribed",
];

export default function BillingPanel({
  locale,
  prices,
  currentPlan,
  statusLabel,
  renewsLabel,
  hasActiveSub,
  suspendedNotice,
  usage,
  trialLabel,
  currentInterval,
  betaAccess = false,
  founderUntil,
  rollonMember = false,
}: {
  locale: Locale;
  prices: { version: number; catalog: typeof import("@/lib/billing/plans").PLAN_CONFIG };
  currentPlan: string;
  statusLabel: string;
  renewsLabel?: string;
  hasActiveSub: boolean;
  /** 扣款失敗且仍在寬限期內時提供；deadline 為已格式化的降級時刻 */
  suspendedNotice?: { deadline: string; manageUrl: string };
  usage?: AiUsageSummary;
  trialLabel?: string;
  currentInterval?: BillingInterval;
  betaAccess?: boolean;
  founderUntil?: string;
  rollonMember?: boolean;
}) {
  const t = useTranslations("Billing");
  const catalog = planContent(locale === "zh-tw");
  const tPlans = useTranslations("Dashboard.plans");
  const tPricing = useTranslations("Product.pricing");
  const tErr = useTranslations("Billing.errors");
  const router = useRouter();
  const { data: rewards } = useRewards();
  const rewardRemaining = rewards?.rewardRemaining ?? usage?.rewardRemaining ?? 0;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [couponText, setCouponText] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; quotes: CouponQuote[] } | null>(null);
  const checkoutAttempt = useRef<{ key: string; id: string } | null>(null);
  const zh = locale === "zh-tw";

  async function applyCoupon() {
    if (busy) return;
    setBusy("coupon"); setError(""); setCoupon(null); checkoutAttempt.current = null;
    try {
      const data = await memberFetch<{ code: string; quotes: CouponQuote[] }>("/api/billing/coupon", { method: "POST", body: JSON.stringify({ code: couponText, interval }) });
      setCoupon(data); setCouponText(data.code);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  }

  function resolveErr(code: string | undefined, fallback: string): string {
    return code && BILLING_ERROR_CODES.includes(code) ? tErr(code) : fallback;
  }

  async function subscribe(plan: string) {
    if (busy) return;
    if (couponText.trim() && !coupon) { setError(zh ? "請先套用或移除折扣碼，不會直接按原價付款。" : "Apply or remove the discount code before checkout."); return; }
    setError("");
    const busyKey = `${plan}:${interval}`;
    const key = `${busyKey}:${coupon?.code || ""}`;
    if (checkoutAttempt.current?.key !== key) checkoutAttempt.current = { key, id: crypto.randomUUID() };
    setBusy(busyKey);
    try {
      const res = await analyticsFetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          interval,
          locale,
          pricingVersion: prices.version,
          requestId: checkoutAttempt.current.id,
          ...(coupon ? { couponCode: coupon.code } : {}),
        }),
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status}: ${text || res.statusText}`); }
      if (!res.ok) {
        if (["coupon_checkout_closed", "coupon_provider_rejected", "coupon_not_configured", "coupon_plan_mismatch"].includes(json.code)) checkoutAttempt.current = null;
        throw new Error([`HTTP ${res.status}`, resolveErr(json.code, json.error), json.code, json.requestId].filter(Boolean).join("\n"));
      }
      // 導向 PayPal 核准頁
      window.location.assign(json.data.approveUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setBusy(null);
    }
  }

  async function cancel() {
    if (!window.confirm(t("cancelConfirm"))) return;
    setError("");
    setBusy("cancel");
    try {
      const res = await analyticsFetch("/api/billing/cancel", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(resolveErr(json.code, json.error));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-7 flex flex-col gap-7">
      {/* 扣款失敗寬限期警告 — 放在最上方，並帶 PayPal 更新付款方式的自救入口 */}
      {suspendedNotice && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-amber-700 font-[family-name:var(--font-heading)]">
            {t("suspendedTitle")}
          </p>
          <p className="mt-2 text-sm text-amber-900">
            {t("suspendedBody", { date: suspendedNotice.deadline })}
          </p>
          <a
            href={suspendedNotice.manageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-700 font-[family-name:var(--font-heading)]"
          >
            {t("suspendedCta")}
          </a>
        </div>
      )}

      {/* 目前訂閱摘要 */}
      <div className="rounded-2xl border border-dark/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-dark/40 font-[family-name:var(--font-heading)]">
              {t("currentPlan")}
            </p>
            <p className="mt-1 text-2xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
              {tPlans(currentPlan)}
            </p>
            <p className="mt-1 text-sm text-dark/60">
              {statusLabel}
              {renewsLabel ? ` · ${renewsLabel}` : ""}
            </p>
            {founderUntil && <p className="mt-2 text-sm text-dark/70">{locale === "zh-tw" ? `US$348 一次付款，12 個月使用權，有效至 ${founderUntil}。不自動續扣。` : `US$348 paid once for 12 months, until ${founderUntil}. No automatic renewal.`}</p>}
            {trialLabel && <p className="mt-1 text-sm text-primary">{trialLabel}</p>}
            {betaAccess && <p role="status" className="mt-2 text-sm text-primary">{t("betaNotice", { plan: tPlans("enterprise") })}</p>}
          </div>
          {hasActiveSub && (
            <button
              type="button"
              onClick={cancel}
              disabled={busy !== null}
              className="rounded-xl border border-red-200 px-5 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 font-[family-name:var(--font-heading)]"
            >
              {busy === "cancel" ? t("processing") : t("cancel")}
            </button>
          )}
        </div>
      </div>

      {usage && (
        <div className="rounded-2xl border border-dark/10 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-dark/40 font-[family-name:var(--font-heading)]">
                {t("aiUsageTitle")}
              </p>
              <p className="mt-2 text-2xl font-extrabold text-dark font-[family-name:var(--font-heading)]">
                {t("aiUsageRemaining", { count: usage.remaining + rewardRemaining + usage.bonusRemaining })}
              </p>
              <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{locale === "zh-tw" ? "用量明細" : "Usage details"}</summary>
              <p className="mt-1 text-sm text-dark/60">
                {currentPlan === "free" ? t("aiRewardUsageDetail", { reward: rewardRemaining }) : t("aiUsageDetail", {
                  used: usage.used,
                  included: usage.included,
                  reward: rewardRemaining,
                  bonus: usage.bonusRemaining,
                  date: usage.resetsAt ? new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en-US", {
                    dateStyle: "medium",
                    timeZone: "Asia/Taipei",
                  }).format(new Date(usage.resetsAt)) : "—",
                })}
              </p>
              </details>
            </div>
            {currentPlan !== "free" && <button
              type="button"
              onClick={async () => {
                setError("");
                setBusy("credits");
                try {
                  const res = await analyticsFetch("/api/billing/credits/orders", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      locale,
                      requestId: crypto.randomUUID(),
                    }),
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error);
                  window.location.assign(json.data.approveUrl);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Error");
                  setBusy(null);
                }
              }}
              disabled={busy !== null}
              className="min-h-11 rounded-xl bg-dark px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-dark/85 disabled:opacity-60"
            >
              {busy === "credits" ? t("processing") : t("buyCredits")}
            </button>}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* 方案選擇 */}
      {!betaAccess && !founderUntil && !rollonMember && <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
            {t("choosePlan")}
          </h2>
          <div className="inline-flex rounded-xl border border-dark/10 bg-white p-1" aria-label={t("billingInterval")}>
            {(["month", "year"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => { setInterval(value); setCoupon(null); checkoutAttempt.current = null; }}
                disabled={busy !== null}
                aria-pressed={interval === value}
                className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${
                  interval === value ? "bg-dark text-white" : "text-dark/60"
                }`}
              >
                {t(value)}
              </button>
            ))}
          </div>
        </div>
        {!hasActiveSub && <form className="mt-4 rounded-2xl border border-dark/15 bg-white p-4" onSubmit={event => { event.preventDefault(); void applyCoupon(); }}>
          <label htmlFor="billing-coupon-code" className="block text-sm font-semibold">{zh ? "折扣碼" : "Discount code"}</label>
          <div className="mt-2 flex flex-wrap gap-2"><input id="billing-coupon-code" value={couponText} maxLength={32} autoComplete="off" spellCheck={false} disabled={busy !== null} onChange={event => { setCouponText(event.target.value); setCoupon(null); checkoutAttempt.current = null; }} className="min-h-11 min-w-0 flex-1 rounded-xl border border-dark/20 px-3 py-2 text-sm uppercase focus-visible:outline-2" /><button type="submit" disabled={busy !== null || !couponText.trim()} className="min-h-11 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "coupon" ? (zh ? "驗證中…" : "Checking…") : (zh ? "套用" : "Apply")}</button>{couponText && <button type="button" disabled={busy !== null} className="min-h-11 rounded-xl border px-4 py-2 text-sm" onClick={() => { setCouponText(""); setCoupon(null); setError(""); checkoutAttempt.current = null; }}>{zh ? "移除" : "Remove"}</button>}</div>
          {coupon && <p role="status" className="mt-3 text-sm font-semibold">{coupon.code} · 60% OFF · {zh ? "僅首期，之後原價自動續訂。優惠至 2026/11/30（台北時間），每帳號限一次。" : "First billing period only, then automatic renewal at the regular price. Ends Nov 30, 2026 (Taipei); once per account."}</p>}
        </form>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={`flex flex-col rounded-2xl border p-5 ${currentPlan === "free" ? "border-primary bg-primary/[0.04]" : "border-dark/10 bg-white"}`}>
            <p className="text-lg font-extrabold">{catalog.free.name}</p><p className="mt-1 text-xl font-bold">US$0</p><p className="mt-3 text-sm">{catalog.free.audience}</p>
            <ul className="my-3 space-y-2 text-sm">{catalog.free.features.map(feature => <li key={feature}>✓ {feature}</li>)}</ul>
            <p className="mt-auto pt-5 text-sm font-semibold">{currentPlan === "free" ? (zh ? "目前方案" : "Current plan") : (zh ? "所有帳號均保留免費基本功能" : "Free basics remain available to every account")}</p>
          </div>
          {PAID_PLANS.map((plan) => {
            const isCurrent =
              hasActiveSub && plan === currentPlan && interval === currentInterval;
            const variant = billingVariantFor(plan, interval, prices.catalog);
            const discount = coupon?.quotes.find(quote => quote.plan === plan && quote.interval === interval);
            if (!variant) return null;
            return (
              <div
                key={plan}
                className={`flex flex-col rounded-2xl border p-5 ${
                  isCurrent
                    ? "border-primary bg-primary/[0.04]"
                    : "border-dark/10 bg-white"
                }`}
              >
                <p className="text-lg font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
                  {tPlans(plan)}
                  {plan === "business" && <span className="ml-2 text-xs">{locale === "zh-tw" ? "最受歡迎" : "Most popular"}</span>}
                </p>
                <p className="mt-1 text-sm text-dark/70">
                  <span className="text-xl font-bold text-dark">
                    {discount ? `USD ${(discount.firstAmountMinor / 100).toFixed(2)}` : interval === "month"
                      ? priceLabel(plan, "month", prices.catalog)
                      : monthlyEquivalentLabel(plan, prices.catalog)}
                  </span>{" "}
                  {discount && interval === "year" ? (zh ? "／首年" : "/ first year") : t("perMonth")}
                </p>
                {discount && <p className="mt-2 text-sm"><del className="mr-2">{priceLabel(plan, interval, prices.catalog)}</del>{zh ? `${interval === "year" ? "首年一次收款" : "僅首月"}；下${interval === "year" ? "年" : "月"}起 ${priceLabel(plan, interval, prices.catalog)}／${interval === "year" ? "年" : "月"}，自動續訂。` : `${interval === "year" ? "First year charged once" : "First month only"}; then ${priceLabel(plan, interval, prices.catalog)} / ${interval}, automatically renewed.`}</p>}
                {interval === "year" && !discount && (
                  <p className="mt-2 text-xs leading-5 text-dark/55">
                    {t("annualCharge", {
                      total: priceLabel(plan, "year", prices.catalog)!,
                    })}
                  </p>
                )}
                {plan === "business" && (
                  <p className="mt-3 text-sm font-semibold text-primary">
                    {t("investorPortalIncluded")}
                  </p>
                )}
                <p className="mt-3 text-sm">{catalog[plan].audience}</p>
                <ul className="my-3 space-y-2 text-sm">{catalog[plan].features.map(f => <li key={f}>✓ {f}</li>)}</ul>
                <button
                  type="button"
                  data-testid={`subscribe-${plan}`}
                  onClick={() => subscribe(plan)}
                  disabled={busy !== null || isCurrent || Boolean(couponText.trim() && !coupon)}
                  className={`mt-5 rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-60 font-[family-name:var(--font-heading)] ${
                    isCurrent
                      ? "border border-dark/15 text-dark/50"
                      : "bg-primary text-white hover:bg-primary/90"
                  }`}
                >
                  {isCurrent
                    ? tPlans(currentPlan)
                    : busy === `${plan}:${interval}`
                      ? t("processing")
                      : t("subscribe")}
                </button>
              </div>
            );
          })}

          {/* Enterprise — 洽詢 */}
          <div className="flex flex-col rounded-2xl border border-dark/10 bg-white p-5">
            <p className="text-lg font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
              {catalog.enterprise.name}
            </p>
            <p className="mt-1 text-sm text-dark/70">
              {tPricing("enterprise.price")}
            </p>
            <p className="mt-3 text-sm">{catalog.enterprise.audience}</p>
            <ul className="my-3 space-y-2 text-sm">{catalog.enterprise.features.map(f => <li key={f}>✓ {f}</li>)}</ul>
            <Link
              href={`${pathForLocale("/", locale)}#contact`}
              className="mt-5 rounded-xl border border-dark/15 px-4 py-3 text-center text-sm font-semibold text-dark/80 transition-colors hover:bg-dark/[0.03] font-[family-name:var(--font-heading)]"
            >
              {t("contactSales")}
            </Link>
          </div>
        </div>
      </div>}
    </div>
  );
}
