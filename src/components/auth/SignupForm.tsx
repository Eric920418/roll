"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import SegmentedToggle from "./SegmentedToggle";
import AuthInput from "./AuthInput";
import AuthButton from "./AuthButton";
import GoogleButton from "./GoogleButton";
import { resolveAuthError } from "./error-codes";

type Mode = "email" | "google";

export default function SignupForm() {
  const t = useTranslations("Auth.signup");
  const tStep = useTranslations("Auth.steps");
  const tErr = useTranslations("Auth.errors");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("email");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loginHref = pathForLocale("/login", locale);
  const next = pathForLocale("/onboarding/company", locale);
  const googleHref = `/api/auth/google/authorize?next=${encodeURIComponent(next)}`;

  // OAuth callback 失敗會帶 ?error= 導回此頁，掛載時顯示
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e) setError(e);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          resolveAuthError(json.code, json.error || tErr("generic"), (k) =>
            tErr(k),
          ),
        );
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : tErr("generic"));
    } finally {
      setLoading(false);
    }
  }

  const termsNode = (
    <p className="text-center text-xs leading-relaxed text-dark/45">
      {t("terms")}{" "}
      <a href="#" className="font-medium text-dark/70 underline">
        {t("termsOfService")}
      </a>{" "}
      {t("and")}{" "}
      <a href="#" className="font-medium text-dark/70 underline">
        {t("privacyPolicy")}
      </a>
      .
    </p>
  );

  return (
    <div className="font-[family-name:var(--font-body)]">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary font-[family-name:var(--font-heading)]">
        {tStep("stepLabel", { current: 1, total: 3 })}
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)] md:text-[2rem]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">
        {t("haveAccount")}{" "}
        <a
          href={loginHref}
          className="font-semibold text-primary hover:underline"
        >
          {t("logIn")}
        </a>
      </p>

      <div className="mt-7">
        <SegmentedToggle<Mode>
          value={mode}
          onChange={setMode}
          tabs={[
            { key: "email", label: t("emailTab") },
            { key: "google", label: t("googleTab") },
          ]}
        />
      </div>

      {mode === "email" ? (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <AuthInput
              label={t("firstName")}
              name="firstName"
              value={firstName}
              onChange={setFirstName}
              placeholder={t("firstNamePlaceholder")}
              autoComplete="given-name"
            />
            <AuthInput
              label={t("lastName")}
              name="lastName"
              value={lastName}
              onChange={setLastName}
              placeholder={t("lastNamePlaceholder")}
              autoComplete="family-name"
            />
          </div>
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
            autoComplete="new-password"
          />
          {error && (
            <p className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="mt-1">
            <AuthButton loading={loading}>
              {loading ? t("submitting") : t("continue")}
            </AuthButton>
          </div>
          {termsNode}
        </form>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <GoogleButton label={t("googleButton")} next={next} />
          <p className="px-2 text-center text-xs leading-relaxed text-dark/45">
            {t("googleNote")}
          </p>
          {error && (
            <p className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}
          <a href={googleHref} className="mt-1 block">
            <span className="block w-full rounded-xl bg-primary py-3.5 text-center text-sm font-semibold text-white transition-colors hover:bg-primary-dark font-[family-name:var(--font-heading)]">
              {t("continue")}
            </span>
          </a>
          {termsNode}
        </div>
      )}
    </div>
  );
}
