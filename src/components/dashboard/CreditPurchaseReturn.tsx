"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export default function CreditPurchaseReturn({
  locale,
  orderId,
}: {
  locale: Locale;
  orderId: string | null;
}) {
  const t = useTranslations("Billing");
  const [message, setMessage] = useState(t("processing"));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setError(true);
      setMessage(t("creditOrderMissing"));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/billing/credits/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Error");
        if (!cancelled) setMessage(t("creditPurchaseSuccess"));
      } catch (cause) {
        if (cancelled) return;
        setError(true);
        setMessage(cause instanceof Error ? cause.message : "Error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, t]);

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("aiUsageTitle")}
      </h1>
      <div className="mt-7 rounded-2xl border border-dark/10 bg-white p-7">
        <p
          role={error ? "alert" : "status"}
          className={`whitespace-pre-wrap text-sm ${error ? "text-red-600" : "text-dark/70"}`}
        >
          {message}
        </p>
        <Link
          href={pathForLocale("/dashboard/billing", locale)}
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white"
        >
          {t("backToBilling")}
        </Link>
      </div>
    </div>
  );
}
