"use client";

import { useState } from "react";
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
  currentPlan,
  statusLabel,
  renewsLabel,
  hasActiveSub,
  suspendedNotice,
  usage,
  trialLabel,
  currentInterval,
}: {
  locale: Locale;
  currentPlan: string;
  statusLabel: string;
  renewsLabel?: string;
  hasActiveSub: boolean;
  /** 扣款失敗且仍在寬限期內時提供；deadline 為已格式化的降級時刻 */
  suspendedNotice?: { deadline: string; manageUrl: string };
  usage?: {
    included: number;
    used: number;
    remaining: number;
    bonusRemaining: number;
    resetsAt: string;
  };
  trialLabel?: string;
  currentInterval?: BillingInterval;
}) {
  const t = useTranslations("Billing");
  const tPlans = useTranslations("Dashboard.plans");
  const tPricing = useTranslations("Product.pricing");
  const tErr = useTranslations("Billing.errors");
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [interval, setInterval] = useState<BillingInterval>("month");

  function resolveErr(code: string | undefined, fallback: string): string {
    return code && BILLING_ERROR_CODES.includes(code) ? tErr(code) : fallback;
  }

  async function subscribe(plan: string) {
    setError("");
    const busyKey = `${plan}:${interval}`;
    setBusy(busyKey);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          interval,
          locale,
          requestId: crypto.randomUUID(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(resolveErr(json.code, json.error));
      // 導向 PayPal 核准頁
      window.location.href = json.data.approveUrl;
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
      const res = await fetch("/api/billing/cancel", { method: "POST" });
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
            {trialLabel && <p className="mt-1 text-sm text-primary">{trialLabel}</p>}
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
                {t("aiUsageRemaining", { count: usage.remaining })}
              </p>
              <p className="mt-1 text-sm text-dark/60">
                {t("aiUsageDetail", {
                  used: usage.used,
                  included: usage.included,
                  bonus: usage.bonusRemaining,
                  date: new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en-US", {
                    dateStyle: "medium",
                  }).format(new Date(usage.resetsAt)),
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                setError("");
                setBusy("credits");
                try {
                  const res = await fetch("/api/billing/credits/orders", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      locale,
                      requestId: crypto.randomUUID(),
                    }),
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error);
                  window.location.href = json.data.approveUrl;
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Error");
                  setBusy(null);
                }
              }}
              disabled={busy !== null}
              className="min-h-11 rounded-xl bg-dark px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-dark/85 disabled:opacity-60"
            >
              {busy === "credits" ? t("processing") : t("buyCredits")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* 方案選擇 */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
            {t("choosePlan")}
          </h2>
          <div className="inline-flex rounded-xl border border-dark/10 bg-white p-1" aria-label={t("billingInterval")}>
            {(["month", "year"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
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
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {PAID_PLANS.map((plan) => {
            const isCurrent =
              hasActiveSub && plan === currentPlan && interval === currentInterval;
            const variant = billingVariantFor(plan, interval);
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
                </p>
                <p className="mt-1 text-sm text-dark/70">
                  <span className="text-xl font-bold text-dark">
                    {interval === "month"
                      ? priceLabel(plan, "month")
                      : monthlyEquivalentLabel(plan)}
                  </span>{" "}
                  {t("perMonth")}
                </p>
                {interval === "year" && (
                  <p className="mt-2 text-xs leading-5 text-dark/55">
                    {t("annualCharge", {
                      total: priceLabel(plan, "year")!,
                    })}
                  </p>
                )}
                {plan === "business" && (
                  <p className="mt-3 text-sm font-semibold text-primary">
                    {t("investorPortalIncluded")}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => subscribe(plan)}
                  disabled={busy !== null || isCurrent}
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
              {tPricing("enterprise.name")}
            </p>
            <p className="mt-1 text-sm text-dark/70">
              {tPricing("enterprise.price")}
            </p>
            <Link
              href={`${pathForLocale("/", locale)}#contact`}
              className="mt-5 rounded-xl border border-dark/15 px-4 py-3 text-center text-sm font-semibold text-dark/80 transition-colors hover:bg-dark/[0.03] font-[family-name:var(--font-heading)]"
            >
              {t("contactSales")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
