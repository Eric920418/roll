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
import CopilotPanel from "@/components/dashboard/home/CopilotPanel";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

const HUB_WAITLIST_MESSAGE = "Waitlist: Investor DD & Global Founder Hub — free trial";

export default async function DashboardOverview({ params }: Props) {
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

  const firstName = account.firstName?.trim();

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("overview.title")}
        {firstName ? `, ${firstName}` : ""} 👋
      </h1>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dark/60">{t("home.subtitle")}</p>
        <a href="#next-three-moves" className="inline-flex min-h-11 items-center rounded-xl bg-dark px-4 py-2 text-sm font-bold text-white hover:bg-dark/90">{t("home.actionSummary.next.title")} ↓</a>
      </div>

      <div className="mt-7 flex flex-col gap-6">
        <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <InvestorHubCard
            name={([account.firstName, account.lastName].filter(Boolean).join(" ") || account.email).slice(0, 200)}
            email={account.email}
            message={HUB_WAITLIST_MESSAGE}
            joined={Boolean(waitlistEntry)}
          />
          <CopilotPanel canUse={isPaying} />
        </div>

        <ActionPlanOverview
          locale={l}
          plan={visibleActionPlan}
          isPaying={isPaying}
          agendaHref={agendaHref}
          billingHref={billingHref}
        />

        <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <UpcomingEventsRail locale={l} events={eventViews} />
          <TutorialVideoCard locale={l} video={video} />
        </div>
      </div>
    </div>
  );
}
