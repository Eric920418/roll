import { getTranslations } from "next-intl/server";
import Link from "next/link";
import ActionPlanBuilder from "@/components/dashboard/ActionPlanBuilder";
import type { Locale } from "@/i18n/routing";
import type { DashboardPriority } from "@/lib/action-plan/dashboard";

export default async function PriorityBanner({
  locale,
  priority,
  href,
}: {
  locale: Locale;
  priority: DashboardPriority;
  href: string;
}) {
  const t = await getTranslations({
    locale,
    namespace: "Dashboard.home.priority",
  });

  const staticContent = {
    onboarding: {
      title: t("onboardingTitle"),
      body: t("onboardingBody"),
      cta: t("onboardingCta"),
      onTrack: false,
    },
    quiz: {
      title: t("quizTitle"),
      body: t("quizBody"),
      cta: t("quizCta"),
      onTrack: false,
    },
    upgrade: {
      title: t("upgradeTitle"),
      body: t("upgradeBody"),
      cta: t("upgradeCta"),
      onTrack: false,
    },
    build: {
      title: t("buildTitle"),
      body: t("buildBody"),
      cta: t("buildCta"),
      onTrack: false,
    },
    blocked: {
      title: t("blockedTitle"),
      body: t("blockedBody", {
        count: priority.kind === "blocked" ? priority.blockerCount : 0,
      }),
      cta: t("blockedCta"),
      onTrack: false,
    },
    complete: {
      title: t("readyTitle"),
      body: t("completeBody"),
      cta: t("completeCta"),
      onTrack: true,
    },
  } as const;

  const content =
    priority.kind === "action"
      ? {
          title: `#${priority.action.rank ?? 1} ${priority.action.title}`,
          body: priority.action.expectedOutcome.text,
          cta: t("actionCta"),
          onTrack: false,
        }
      : staticContent[priority.kind];

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-primary via-primary to-primary-dark p-7 text-white shadow-[0_22px_55px_rgba(99,21,28,0.18)] md:p-9">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-8 h-px w-2/5 bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70 font-[family-name:var(--font-heading)]">
            {t("eyebrow")}
          </p>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide font-[family-name:var(--font-heading)] ${
              content.onTrack ? "bg-white/20 text-white" : "bg-accent text-dark"
            }`}
          >
            {content.onTrack ? t("onTrack") : t("actionNeeded")}
          </span>
        </div>
        <h2 className="max-w-3xl text-2xl font-extrabold tracking-[-0.025em] font-[family-name:var(--font-heading)] md:text-[30px]">
          {content.title}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-white/80">{content.body}</p>
        {priority.kind === "build" ? (
          <div className="mt-1">
            <ActionPlanBuilder triggerClassName="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-primary transition hover:-translate-y-0.5 hover:bg-white/90 font-[family-name:var(--font-heading)]" />
          </div>
        ) : (
          <Link
            href={href}
            className="mt-1 inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-primary transition hover:-translate-y-0.5 hover:bg-white/90 font-[family-name:var(--font-heading)]"
          >
            {content.cta}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        )}
      </div>
    </section>
  );
}
