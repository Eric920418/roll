"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type State = "loading" | "success" | "pending" | "error";

export default function BillingReturn({
  locale,
  subscriptionId,
}: {
  locale: Locale;
  subscriptionId: string | null;
}) {
  const t = useTranslations("Billing");
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    // 沒拿到 subscription_id：交給 webhook 收尾，顯示 pending
    if (!subscriptionId) {
      setState("pending");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Error");
        if (cancelled) return;
        setState(json.data.status === "ACTIVE" ? "success" : "pending");
      } catch (err) {
        if (cancelled) return;
        setState("error");
        setMessage(err instanceof Error ? err.message : "Error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subscriptionId]);

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>

      <div className="mt-7 rounded-2xl border border-dark/10 bg-white p-7">
        {state === "loading" && (
          <p className="text-sm text-dark/60">{t("processing")}</p>
        )}
        {state === "success" && (
          <p className="text-base font-semibold text-green-700">
            {t("returnSuccess")}
          </p>
        )}
        {state === "pending" && (
          <p className="text-sm text-dark/70">{t("returnPending")}</p>
        )}
        {state === "error" && (
          <p className="whitespace-pre-wrap text-sm text-red-600">{message}</p>
        )}

        <Link
          href={pathForLocale("/dashboard/billing", locale)}
          className="mt-6 inline-block rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 font-[family-name:var(--font-heading)]"
        >
          {t("currentPlan")}
        </Link>
      </div>
    </div>
  );
}
