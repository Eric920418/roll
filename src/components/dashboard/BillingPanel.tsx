"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
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
}: {
  locale: Locale;
  currentPlan: string;
  statusLabel: string;
  renewsLabel?: string;
  hasActiveSub: boolean;
}) {
  const t = useTranslations("Billing");
  const tPlans = useTranslations("Dashboard.plans");
  const tPricing = useTranslations("Product.pricing");
  const tErr = useTranslations("Billing.errors");
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  function resolveErr(code: string | undefined, fallback: string): string {
    return code && BILLING_ERROR_CODES.includes(code) ? tErr(code) : fallback;
  }

  async function subscribe(plan: string) {
    setError("");
    setBusy(plan);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, locale }),
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

      {error && (
        <p className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* 方案選擇 */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
          {t("choosePlan")}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {PAID_PLANS.map((plan) => {
            const isCurrent = plan === currentPlan;
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
                  {tPricing(`${plan}.name`)}
                </p>
                <p className="mt-1 text-sm text-dark/70">
                  <span className="text-xl font-bold text-dark">
                    {tPricing(`${plan}.price`)}
                  </span>{" "}
                  {tPricing(`${plan}.unit`)}
                </p>
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
                    : busy === plan
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
