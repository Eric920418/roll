import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

type Tone = "good" | "warn";

// DAILY MANAGEMENT ALERTS：帳號實際狀態（引導 / 測驗 / 訂閱），非假資料。
export default async function AlertsRow({
  locale,
  onboardingDone,
  onboardingStep,
  quizDone,
  subscriptionLabel,
  isPaying,
}: {
  locale: Locale;
  onboardingDone: boolean;
  onboardingStep: number;
  quizDone: boolean;
  subscriptionLabel: string;
  isPaying: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "Dashboard.home.alerts" });
  const tOverview = await getTranslations({ locale, namespace: "Dashboard.overview" });

  const items: { label: string; value: string; tone: Tone }[] = [
    {
      label: t("onboarding"),
      value: onboardingDone
        ? t("done")
        : tOverview("stepOf", { step: onboardingStep, total: 4 }),
      tone: onboardingDone ? "good" : "warn",
    },
    {
      label: t("quiz"),
      value: quizDone ? t("done") : t("todo"),
      tone: quizDone ? "good" : "warn",
    },
    {
      label: t("subscription"),
      value: isPaying ? subscriptionLabel : t("noSub"),
      tone: isPaying ? "good" : "warn",
    },
  ];

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
        {t("sectionTitle")}
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex items-center justify-between gap-3 rounded-2xl border border-dark/10 bg-white p-5"
          >
            <div>
              <p className="text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
                {it.label}
              </p>
              <p className="mt-0.5 text-xs text-dark/55">{it.value}</p>
            </div>
            <span
              aria-hidden
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                it.tone === "good" ? "bg-green-500" : "bg-accent"
              }`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
