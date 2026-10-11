import { HomeWeeklyCheckIn } from "@/components/dashboard/WeeklyCheckIn";
import HomeLogButton from "@/components/dashboard/home/HomeLogButton";
import { requireUserPage } from "@/lib/auth/guard";
import ThisWeekCalendar from "@/components/dashboard/home/ThisWeekCalendar";
import GettingStartedHome from "@/components/dashboard/GettingStartedHome";
import { getGettingStarted } from "@/lib/getting-started/service";
import PlanRefresh from "@/components/dashboard/PlanRefresh";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { pathForLocale } from "@/lib/routes";
import { prisma } from "@/lib/prisma";
import { getVideos, getEvents } from "@/lib/cms/content";
import ActionPlanOverview from "@/components/dashboard/home/ActionPlanOverview";
import InvestorHubCard from "@/components/dashboard/home/InvestorHubCard";
import TutorialVideoCard from "@/components/dashboard/home/TutorialVideoCard";
import UpcomingEventsRail from "@/components/dashboard/home/UpcomingEventsRail";
import RewardsCard from "@/components/dashboard/rewards/RewardsCard";
import CopilotPanel from "@/components/dashboard/home/CopilotPanel";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

const HUB_WAITLIST_MESSAGE = "Waitlist: Investor DD & Global Founder Hub — free trial";

export default async function DashboardOverview({ params }: Props) {
  await requireUserPage((await params).locale);
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard" });

  const account = await getCurrentAccount();
  if (!account) return null; // layout 已 redirect

  const effectivePlan = getEffectivePlan(account);
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

  // Active Action Plan 是 Pro+ 功能；降級後仍保留資料，但 Overview 不洩漏付費內容。
  const visibleActionPlan = isPaying ? actionPlan : null;
  const agendaHref = pathForLocale("/dashboard/agenda", l);
  const billingHref = pathForLocale("/dashboard/account#plan", l);

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

  const guide = await getGettingStarted(account.id);
  const firstName = account.firstName?.trim();

  return (
    <div className="font-[family-name:var(--font-body)]">
      <PlanRefresh userId={account.id} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">{t("overview.title")}{firstName ? `, ${firstName}` : ""}</h1>
        <HomeLogButton canRecord={isPaying} />
      </div>

      <GettingStartedHome initial={guide}
        weekly={visibleActionPlan ? <HomeWeeklyCheckIn key={visibleActionPlan.id} initial={visibleActionPlan} userId={account.id} canShare={effectivePlan === "business" || effectivePlan === "enterprise"} /> : null}
        calendar={<ThisWeekCalendar />}
        investor={<InvestorHubCard name={([account.firstName, account.lastName].filter(Boolean).join(" ") || account.email).slice(0, 200)} email={account.email} message={HUB_WAITLIST_MESSAGE} joined={Boolean(waitlistEntry)} />}
        rewards={<RewardsCard />}
        copilot={<CopilotPanel canUse={isPaying} canBuildPlan={isPaying} />}
        overview={<ActionPlanOverview locale={l} plan={visibleActionPlan} isPaying={isPaying} agendaHref={agendaHref} billingHref={billingHref} nextFirst={guide.visible && guide.hasPlan} />}
        events={<UpcomingEventsRail locale={l} events={eventViews} />}
        podcast={<TutorialVideoCard locale={l} video={video} />}
      />
    </div>
  );
}
