import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { Locale } from "@/i18n/routing";

export type PriorityState = "onboarding" | "quiz" | "upgrade" | "ready";

// Overview 頂部「今日重點」橫幅。狀態與 CTA 由頁面依帳號即時計算後傳入（皆真實個人化）。
export default async function PriorityBanner({
  locale,
  state,
  href,
}: {
  locale: Locale;
  state: PriorityState;
  href: string;
}) {
  const t = await getTranslations({ locale, namespace: "Dashboard.home.priority" });

  const map: Record<PriorityState, { title: string; body: string; cta: string; onTrack: boolean }> = {
    onboarding: {
      title: t("onboardingTitle"),
      body: t("onboardingBody"),
      cta: t("onboardingCta"),
      onTrack: false,
    },
    quiz: { title: t("quizTitle"), body: t("quizBody"), cta: t("quizCta"), onTrack: false },
    upgrade: {
      title: t("upgradeTitle"),
      body: t("upgradeBody"),
      cta: t("upgradeCta"),
      onTrack: false,
    },
    ready: { title: t("readyTitle"), body: t("readyBody"), cta: t("readyCta"), onTrack: true },
  };
  const s = map[state];

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-7 text-white md:p-8">
      {/* 裝飾光暈 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
      />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70 font-[family-name:var(--font-heading)]">
            {t("eyebrow")}
          </p>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide font-[family-name:var(--font-heading)] ${
              s.onTrack ? "bg-white/20 text-white" : "bg-accent text-dark"
            }`}
          >
            {s.onTrack ? t("onTrack") : t("actionNeeded")}
          </span>
        </div>
        <h2 className="max-w-xl text-2xl font-extrabold tracking-[-0.02em] font-[family-name:var(--font-heading)] md:text-[28px]">
          {s.title}
        </h2>
        <p className="max-w-xl text-sm text-white/80">{s.body}</p>
        <Link
          href={href}
          className="mt-1 inline-flex w-fit items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-white/90 font-[family-name:var(--font-heading)]"
        >
          {s.cta}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </section>
  );
}
