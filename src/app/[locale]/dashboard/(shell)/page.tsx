import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { computeFocus } from "@/lib/dashboard/agenda";
import { pathForLocale } from "@/lib/routes";
import { prisma } from "@/lib/prisma";
import { getVideos, getEvents } from "@/lib/cms/content";
import { getCompanyCards } from "@/lib/company/content";
import PriorityBanner from "@/components/dashboard/home/PriorityBanner";
import ActionPlanOverview from "@/components/dashboard/home/ActionPlanOverview";
import InvestorHubCard from "@/components/dashboard/home/InvestorHubCard";
import TutorialVideoCard from "@/components/dashboard/home/TutorialVideoCard";
import TopOpportunitiesRail from "@/components/dashboard/home/TopOpportunitiesRail";
import UpcomingEventsRail from "@/components/dashboard/home/UpcomingEventsRail";
import CopilotPanel from "@/components/dashboard/home/CopilotPanel";
import { deriveDashboardPriority } from "@/lib/action-plan/dashboard";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

// Overview 精選「重點機會」用的台灣公司 slug（存在才顯示）。
const FEATURED_SLUGS = ["tsmc", "mediatek", "hon-hai", "delta-electronics"];

const HUB_WAITLIST_MESSAGE = "Waitlist: Investor DD & Global Founder Hub — free trial";

const KNOWN_SUBSCRIPTION_STATUSES = new Set([
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
]);

export default async function DashboardOverview({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard" });

  const account = await getCurrentAccount();
  if (!account) return null; // layout 已 redirect

  const effectivePlan = getEffectivePlan(account);
  const planName = t(`plans.${effectivePlan}`);
  const isPaying = effectivePlan !== "free";

  // ── 並行取真實資料 ──
  const [videos, events, actionPlan, waitlistEntry] = await Promise.all([
    getVideos(),
    getEvents(),
    getActiveActionPlan(account.id),
    prisma.contactMessage.findFirst({
      where: { email: account.email, message: HUB_WAITLIST_MESSAGE },
      select: { id: true },
    }),
  ]);

  const featured = getCompanyCards(FEATURED_SLUGS);

  // Active Action Plan 是 Pro+ 功能；降級後仍保留資料，但 Overview 不洩漏付費內容。
  const visibleActionPlan = isPaying ? actionPlan : null;
  const accountFocus = computeFocus(account, l);
  const priority = deriveDashboardPriority({
    isPaying,
    onboardingDone: account.completed,
    quizDone: account.quizCompleted,
    plan: visibleActionPlan,
  });
  const agendaHref = pathForLocale("/dashboard/agenda", l);
  const billingHref = pathForLocale("/dashboard/billing", l);
  const priorityHref =
    priority.kind === "upgrade"
      ? billingHref
      : priority.kind === "onboarding" || priority.kind === "quiz"
        ? accountFocus.href
        : agendaHref;

  const subscriptionStatusLabel = account.subscriptionStatus
    ? KNOWN_SUBSCRIPTION_STATUSES.has(account.subscriptionStatus)
      ? t(`status.${account.subscriptionStatus}`)
      : account.subscriptionStatus
    : t("home.actionSummary.subscription.noSubscription");

  const video = videos[0]
    ? {
        href: videos[0].href,
        thumb: videos[0].thumb,
        title: videos[0].title,
        views: videos[0].views,
      }
    : null;

  const eventViews = events.slice(0, 4).map((e) => ({
    id: e.id,
    date: e.date,
    title: e.title,
    location: e.location,
  }));

  const firstName = account.firstName?.trim();

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("overview.title")}
        {firstName ? `, ${firstName}` : ""} 👋
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("home.subtitle")}</p>

      <div className="mt-7 flex flex-col gap-6">
        <PriorityBanner locale={l} priority={priority} href={priorityHref} />

        <ActionPlanOverview
          locale={l}
          plan={visibleActionPlan}
          isPaying={isPaying}
          planName={planName}
          subscriptionStatusLabel={subscriptionStatusLabel}
          agendaHref={agendaHref}
          billingHref={billingHref}
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <InvestorHubCard
            name={([account.firstName, account.lastName].filter(Boolean).join(" ") || account.email).slice(0, 200)}
            email={account.email}
            message={HUB_WAITLIST_MESSAGE}
            joined={Boolean(waitlistEntry)}
          />
          <TutorialVideoCard locale={l} video={video} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <CopilotPanel canUse={isPaying} />
          {featured.length > 0 ? (
            <TopOpportunitiesRail locale={l} companies={featured} />
          ) : null}
          <UpcomingEventsRail locale={l} events={eventViews} />
        </div>
      </div>
    </div>
  );
}
