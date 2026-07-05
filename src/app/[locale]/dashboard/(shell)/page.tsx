import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { computeFocus } from "@/lib/dashboard/agenda";
import { pathForLocale } from "@/lib/routes";
import { prisma } from "@/lib/prisma";
import { pick } from "@/lib/quiz/locale";
import { buildChecklist } from "@/lib/tools/checklist";
import { getVideos, getEvents } from "@/lib/cms/content";
import { countCompanies, getCompanyCards } from "@/lib/company/content";
import PriorityBanner from "@/components/dashboard/home/PriorityBanner";
import MetricsRow from "@/components/dashboard/home/MetricsRow";
import AlertsRow from "@/components/dashboard/home/AlertsRow";
import FounderMatchCard, {
  type FounderMatch,
} from "@/components/dashboard/home/FounderMatchCard";
import TutorialVideoCard from "@/components/dashboard/home/TutorialVideoCard";
import TopOpportunitiesRail from "@/components/dashboard/home/TopOpportunitiesRail";
import UpcomingEventsRail from "@/components/dashboard/home/UpcomingEventsRail";
import CopilotPanel from "@/components/dashboard/home/CopilotPanel";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

// Overview 精選「重點機會」用的台灣公司 slug（存在才顯示）。
const FEATURED_SLUGS = ["tsmc", "mediatek", "hon-hai", "delta-electronics"];

// 三維向量最遠距離 = sqrt(3 * 100^2)，用來把歐氏距離換算成 0~100 相似度。
const MAX_DISTANCE = Math.sqrt(3) * 100;

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
  const [videos, events, submission] = await Promise.all([
    getVideos(),
    getEvents(),
    account.quizCompleted
      ? prisma.quizSubmission.findFirst({
          where: { userId: account.id },
          orderBy: { createdAt: "desc" },
          include: { founder: true },
        })
      : Promise.resolve(null),
  ]);

  const companiesCount = countCompanies();
  const featured = getCompanyCards(FEATURED_SLUGS);

  // ── 清單進度（依 needs 生成的落地清單 + 勾選狀態）──
  const groups = buildChecklist(account.profile?.needs ?? [], l);
  const allKeys = groups.flatMap((g) => g.items.map((it) => it.key));
  const checklistTotal = allKeys.length;
  const checklistDone = allKeys.filter((k) => account.checklistState[k]).length;

  // ── 今日重點狀態（與 Agenda 頁共用 computeFocus，避免兩處判斷不一致）──
  const focus = computeFocus(account, l);

  // ── 創辦人配對（真實：作答分數與創辦人三維向量的距離 → 相似度）──
  let match: FounderMatch | null = null;
  if (submission?.founder) {
    const f = submission.founder;
    const s = (submission.scores ?? {}) as {
      planningDepth?: number;
      executionStrength?: number;
      visionClarity?: number;
    };
    const dist = Math.sqrt(
      (f.planningDepth - (s.planningDepth ?? 50)) ** 2 +
        (f.executionStrength - (s.executionStrength ?? 50)) ** 2 +
        (f.visionClarity - (s.visionClarity ?? 50)) ** 2,
    );
    const similarity = Math.max(0, Math.round(100 * (1 - dist / MAX_DISTANCE)));
    match = {
      name: pick(f.name, l),
      role: pick(f.role, l),
      blurb: pick(f.blurb, l),
      similarity,
      planningDepth: f.planningDepth,
      executionStrength: f.executionStrength,
      visionClarity: f.visionClarity,
      companyHref: f.companySlug
        ? pathForLocale(`/company/${f.companySlug}`, l)
        : null,
    };
  }

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

      <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 主欄 */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <PriorityBanner locale={l} state={focus.state} href={focus.href} />
          <AlertsRow
            locale={l}
            onboardingDone={account.completed}
            onboardingStep={account.onboardingStep}
            quizDone={account.quizCompleted}
            subscriptionLabel={planName}
            isPaying={isPaying}
          />
          <MetricsRow
            locale={l}
            companies={companiesCount}
            videos={videos.length}
            checklistDone={checklistDone}
            checklistTotal={checklistTotal}
            events={events.length}
          />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <FounderMatchCard
              locale={l}
              match={match}
              quizHref={pathForLocale("/quiz", l)}
            />
            <TutorialVideoCard locale={l} video={video} />
          </div>
        </div>

        {/* 右欄 */}
        <div className="flex flex-col gap-6">
          <CopilotPanel quizDone={account.quizCompleted} />
          {featured.length > 0 && (
            <TopOpportunitiesRail locale={l} companies={featured} />
          )}
          <UpcomingEventsRail locale={l} events={eventViews} />
        </div>
      </div>
    </div>
  );
}
