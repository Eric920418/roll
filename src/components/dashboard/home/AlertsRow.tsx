import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { Locale } from "@/i18n/routing";

type Tone = "good" | "warn" | "bad";

const DOT: Record<Tone, string> = {
  good: "bg-green-500",
  warn: "bg-accent",
  bad: "bg-red-500",
};

// DAILY MANAGEMENT ALERTS：帳號實際狀態（引導 / 測驗 / 訂閱 / 落地待辦），非假資料。
// 每張卡都可點 —— 提醒本身就是「該去哪裡處理」的指路牌，不可點等於提醒了卻沒有出口。
export default async function AlertsRow({
  locale,
  onboardingDone,
  onboardingStep,
  onboardingHref,
  quizDone,
  quizHref,
  subscriptionLabel,
  isPaying,
  billingHref,
  agendaOverdue,
  agendaDueSoon,
  agendaHref,
}: {
  locale: Locale;
  onboardingDone: boolean;
  onboardingStep: number;
  onboardingHref: string;
  quizDone: boolean;
  quizHref: string;
  subscriptionLabel: string;
  isPaying: boolean;
  billingHref: string;
  agendaOverdue: number;
  agendaDueSoon: number;
  agendaHref: string;
}) {
  const t = await getTranslations({ locale, namespace: "Dashboard.home.alerts" });
  const tOverview = await getTranslations({ locale, namespace: "Dashboard.overview" });

  // 落地待辦：逾期優先顯示（紅），其次本週到期（琥珀），都沒有才是綠燈
  const agendaValue =
    agendaOverdue > 0
      ? t("overdue", { count: agendaOverdue })
      : agendaDueSoon > 0
        ? t("dueSoon", { count: agendaDueSoon })
        : t("onTrack");
  const agendaTone: Tone =
    agendaOverdue > 0 ? "bad" : agendaDueSoon > 0 ? "warn" : "good";

  const items: { label: string; value: string; tone: Tone; href: string }[] = [
    {
      label: t("onboarding"),
      value: onboardingDone
        ? t("done")
        : tOverview("stepOf", { step: onboardingStep, total: 4 }),
      tone: onboardingDone ? "good" : "warn",
      href: onboardingHref,
    },
    {
      label: t("quiz"),
      value: quizDone ? t("done") : t("todo"),
      tone: quizDone ? "good" : "warn",
      href: quizHref,
    },
    {
      label: t("agenda"),
      value: agendaValue,
      tone: agendaTone,
      href: agendaHref,
    },
    {
      label: t("subscription"),
      value: isPaying ? subscriptionLabel : t("noSub"),
      tone: isPaying ? "good" : "warn",
      href: billingHref,
    },
  ];

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
        {t("sectionTitle")}
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((it) => (
          <Link
            key={it.label}
            href={it.href}
            className="nova-dashboard-card group flex items-center justify-between gap-3 rounded-2xl border border-dark/10 bg-white p-5 transition-colors hover:border-primary/40"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-dark group-hover:text-primary font-[family-name:var(--font-heading)]">
                {it.label}
              </p>
              <p
                className={`mt-0.5 truncate text-xs ${
                  it.tone === "bad" ? "font-semibold text-red-600" : "text-dark/55"
                }`}
              >
                {it.value}
              </p>
            </div>
            <span
              aria-hidden
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[it.tone]}`}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
