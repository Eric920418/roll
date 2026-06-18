"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import { destinationFor } from "@/lib/auth/onboarding";
import type { Locale } from "@/i18n/routing";
import AuthInput from "./AuthInput";
import AuthButton from "./AuthButton";
import GoogleButton from "./GoogleButton";
import { resolveAuthError } from "./error-codes";

export default function LoginForm() {
  const t = useTranslations("Auth.login");
  const tErr = useTranslations("Auth.errors");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const signupHref = pathForLocale("/signup", locale);
  const homeHref = pathForLocale("/", locale);
  // Google 登入後返回首頁；callback 會依用戶狀態自行校正導向
  const next = homeHref;

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e) setError(e);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          resolveAuthError(json.code, json.error || tErr("generic"), (k) =>
            tErr(k),
          ),
        );
      }
      const dest = destinationFor(
        {
          completed: Boolean(json.data?.completed),
          onboardingStep: Number(json.data?.onboardingStep ?? 2),
        },
        locale,
      );
      router.push(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : tErr("generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)] md:text-[2rem]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <AuthInput
          label={t("email")}
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder={t("emailPlaceholder")}
          required
          autoComplete="email"
        />
        <AuthInput
          label={t("password")}
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder={t("passwordPlaceholder")}
          required
          autoComplete="current-password"
        />
        {error && (
          <p className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="mt-1">
          <AuthButton loading={loading}>
            {loading ? t("submitting") : t("submit")}
          </AuthButton>
        </div>
      </form>

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-dark/10" />
        <span className="text-xs font-medium uppercase tracking-wider text-dark/35">
          {t("or")}
        </span>
        <span className="h-px flex-1 bg-dark/10" />
      </div>

      <GoogleButton label={t("googleButton")} next={next} />

      <p className="mt-7 text-center text-sm text-dark/60">
        {t("noAccount")}{" "}
        <a
          href={signupHref}
          className="font-semibold text-primary hover:underline"
        >
          {t("signUp")}
        </a>
      </p>
    </div>
  );
}
