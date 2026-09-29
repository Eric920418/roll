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

  return (
    <div className="nova-dashboard-card flex h-full min-h-72 flex-col rounded-2xl border border-dark/10 bg-white p-6">
      <h2 className="text-xl font-bold text-dark font-[family-name:var(--font-heading)]">{t("title")}</h2>
      <p className="mt-3 flex-1 text-2xl text-dark">{t("comingSoon")}</p>
      <button type="button" onClick={join} disabled={pending || registered} className="mt-6 min-h-11 w-fit rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
        {registered ? t("joined") : pending ? t("joining") : t("join")}
      </button>
      {registered && <p role="status" className="mt-3 text-sm text-dark/60">{t("success")}</p>}
      {error && <p role="alert" className="mt-3 whitespace-pre-wrap break-words text-sm text-red-600">{error}</p>}
    </div>
  );
}
