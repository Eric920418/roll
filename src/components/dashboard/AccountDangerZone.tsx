"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export default function AccountDangerZone() {
  const t = useTranslations("Dashboard.account.danger");
  const tErr = useTranslations("Auth.errors");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const word = t("confirmWord");
  const armed = confirm.trim() === word;

  async function handleDelete() {
    if (!armed) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || tErr("generic"));
      router.push(pathForLocale("/", locale));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : tErr("generic"));
      setLoading(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-red-200 bg-red-50/50 p-6">
      <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-red-600 font-[family-name:var(--font-heading)]">
        {t("title")}
      </h2>
      <p className="mt-2 text-sm text-dark/65">{t("warning")}</p>
      <label className="mt-4 flex max-w-sm flex-col gap-1.5">
        <span className="text-sm text-dark/70">
          {t("confirmLabel", { word })}
        </span>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-xl border border-red-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-400"
        />
      </label>
      {error && (
        <p className="mt-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={!armed || loading}
        className="mt-4 rounded-xl bg-red-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40 font-[family-name:var(--font-heading)]"
      >
        {loading ? t("deleting") : t("deleteBtn")}
      </button>
    </section>
  );
}
