"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

const fieldClass =
  "w-full rounded-xl border border-dark/10 bg-dark/[0.03] px-4 py-3 text-sm text-dark outline-none transition focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]";
const labelClass =
  "text-sm font-semibold text-dark font-[family-name:var(--font-heading)]";

export default function AccountSecurityForm({
  hasPassword,
}: {
  hasPassword: boolean;
}) {
  const t = useTranslations("Dashboard.account.security");
  const tErr = useTranslations("Auth.errors");
  const router = useRouter();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        const code = json.code;
        const msg =
          code === "wrongPassword"
            ? t("errWrong")
            : code === "tooShort"
              ? t("errTooShort")
              : code === "missing"
                ? t("errMissing")
                : json.error || tErr("generic");
        throw new Error(msg);
      }
      setSaved(true);
      setCurrent("");
      setNext("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : tErr("generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-10 border-t border-dark/10 pt-8">
      <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
        {t("title")}
      </h2>
      {!hasPassword && (
        <p className="mt-2 text-sm text-dark/55">{t("googleNote")}</p>
      )}
      <form onSubmit={handleSubmit} className="mt-5 flex max-w-sm flex-col gap-4">
        {hasPassword && (
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{t("current")}</span>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className={fieldClass}
            />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>
            {hasPassword ? t("new") : t("set")}
          </span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder={t("placeholder")}
            autoComplete="new-password"
            className={fieldClass}
          />
        </label>
        {error && (
          <p className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}
        {saved && (
          <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {t("saved")}
          </p>
        )}
        <div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60 font-[family-name:var(--font-heading)]"
          >
            {loading
              ? t("saving")
              : hasPassword
                ? t("changeBtn")
                : t("setBtn")}
          </button>
        </div>
      </form>
    </section>
  );
}
