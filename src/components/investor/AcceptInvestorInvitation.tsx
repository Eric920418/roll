"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export default function AcceptInvestorInvitation({ token, locale }: { token: string; locale: Locale }) {
  const t = useTranslations("InvestorView");
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      {error && <p role="alert" className="mb-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/investor/invitations/accept", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Error");
            router.push(pathForLocale(`/investor/${json.data.portalId}`, locale));
            router.refresh();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Error");
            setBusy(false);
          }
        }}
        className="min-h-11 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? t("accepting") : t("accept")}
      </button>
    </>
  );
}
