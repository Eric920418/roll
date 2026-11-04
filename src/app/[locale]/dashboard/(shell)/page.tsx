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
import Link from "next/link";
import { getDiscoverySnapshot } from "@/lib/discovery/service";
import { isDiscoveryMember } from "@/lib/discovery/policy";
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
  const discovery = isDiscoveryMember(account) ? await getDiscoverySnapshot(account.id) : null;
  const remaining = Math.max(0, 3 - (discovery?.total ?? 0));
  const firstName = account.firstName?.trim();

  return (
    <div className="font-[family-name:var(--font-body)]">
      <PlanRefresh userId={account.id} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">{t("overview.title")}{firstName ? `, ${firstName}` : ""}</h1>
        <HomeLogButton canRecord={isPaying} discovery={isDiscoveryMember(account)} />
      </div>

      {discovery && <Link href={`${agendaHref}#discovery`} className="mt-6 block rounded-2xl border-2 border-dark bg-white p-5 focus-visible:outline-2 focus-visible:outline-offset-2"><h2 className="text-xl font-bold">{l === "zh-tw" ? "完成 3 個訪談，解鎖 5 間新客戶" : "Complete 3 interviews to unlock 5 new prospects"}</h2><p className="mt-2 text-sm">{remaining > 0 ? (l === "zh-tw" ? `再完成 ${remaining} 個有效訪談，NOVA 就會幫你找出 5 間還沒接觸過、最值得聯絡的公司` : `Complete ${remaining} more valid ${remaining === 1 ? "interview" : "interviews"} and NOVA will help you find 5 new companies worth contacting.`) : (l === "zh-tw" ? "已累積 3 份客戶洞察，前往今日任務查看新公司搜尋入口。" : "You have 3 customer insights. Open today's tasks to find new companies.")}</p><p className="mt-3 font-semibold">{l === "zh-tw" ? "3 份洞察 → 5 間優先目標" : "3 insights → 5 priority prospects"} →</p></Link>}
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
