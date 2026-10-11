"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

export default function InvestorHubCard({ name, email, message, joined }: {
  name: string;
  email: string;
  message: string;
  joined: boolean;
}) {
  const t = useTranslations("Dashboard.home.hub");
  const locale = useLocale();
  const [registered, setRegistered] = useState(joined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    if (pending || registered) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, locale }),
      });
      const raw = await response.text();
      let result;
      try { result = JSON.parse(raw); } catch { throw new Error(`HTTP ${response.status}: ${raw || response.statusText}`); }
      if (!response.ok || !result.data?.received) {
        throw new Error(result.error || `HTTP ${response.status}: ${raw}`);
      }
      setRegistered(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return <section className="nova-dashboard-card min-w-0 rounded-2xl border border-dark/10 bg-white px-5 py-3">
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 className="text-base font-bold text-dark">{t("title")}</h2>
      {registered ? <p role="status" className="text-xs text-dark/60">{t("comingSoon")} · {t("joined")}</p> : <div className="flex items-center gap-3"><span className="text-xs text-dark/50">{t("comingSoon")}</span><button type="button" onClick={join} disabled={pending} className="min-h-11 rounded-full border border-dark/15 px-4 text-xs font-semibold hover:bg-dark/5 disabled:opacity-60">{pending ? t("joining") : t("join")}</button></div>}
    </div>
    {error && <p role="alert" className="mt-2 whitespace-pre-wrap break-words text-sm text-red-600">{error}</p>}
  </section>;
}
