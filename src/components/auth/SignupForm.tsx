"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import SegmentedToggle from "./SegmentedToggle";
import AuthInput from "./AuthInput";
import AuthButton from "./AuthButton";
import GoogleButton from "./GoogleButton";
import { resolveAuthError } from "./error-codes";
import { safeInvestorInvitePath } from "@/lib/auth/return-path";

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
  const [rollonCode, setRollonCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const referralTouched = useRef(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [next, setNext] = useState(pathForLocale("/onboarding/company", locale));
  const loginHref = `${pathForLocale("/login", locale)}?next=${encodeURIComponent(next)}`;
  async function handleGoogle(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/google/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next, rollonCode, referralCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error([`HTTP ${res.status}`, json.error || tErr("generic"), json.code, json.requestId].filter(Boolean).join("\n"));
      window.location.assign(json.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : tErr("generic"));
      setLoading(false);
    }
  }

  // OAuth callback 失敗會帶 ?error= 導回此頁，掛載時顯示
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e) setError(e);
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && !referralTouched.current) setReferralCode(ref.slice(0, 128));
    const requested = safeInvestorInvitePath(
      new URLSearchParams(window.location.search).get("next"),
      locale,
    );
    if (requested) setNext(requested);
  }, [locale]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password, rollonCode, referralCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          [`HTTP ${res.status}`, resolveAuthError(json.code, json.error || tErr("generic"), (k) => tErr(k)), json.code, json.requestId].filter(Boolean).join("\n"),
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

  const [ready, setReady] = useState(false);
  useEffect(() => { void Promise.resolve().then(() => setReady(true)); }, []);

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

      <div className="mt-6">
        <AuthInput
          label={t("rollonCode")}
          name="rollonCode"
          value={rollonCode}
          onChange={setRollonCode}
          placeholder={t("rollonCodePlaceholder")}
          autoComplete="off"
        />
        <p className="mt-2 text-xs text-dark/60">{t("rollonCodeHint")}</p>
      </div>

      <div className="mt-5">
        <AuthInput label={t("referralCode")} name="referralCode" value={referralCode} onChange={value => { referralTouched.current = true; setReferralCode(value); }} autoComplete="off" />
        <p className="mt-2 text-xs leading-5 text-dark/60">{t("referralHint")}</p>
      </div>

      {mode === "email" ? (
        <form method="post" onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
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
            <p role="alert" className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="mt-1">
            <AuthButton loading={loading || !ready}>
              {loading ? t("submitting") : t("continue")}
            </AuthButton>
          </div>
          {termsNode}
        </form>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <GoogleButton label={loading ? t("submitting") : t("googleButton")} next={next} onClick={handleGoogle} />
          <p className="px-2 text-center text-xs leading-relaxed text-dark/45">
            {t("googleNote")}
          </p>
          {error && (
            <p role="alert" className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}
          <a href={`/api/auth/google/authorize?next=${encodeURIComponent(next)}`} onClick={handleGoogle} aria-disabled={loading} className="mt-1 block">
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
