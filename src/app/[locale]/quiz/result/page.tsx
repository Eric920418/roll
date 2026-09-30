import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { pick, pickArr } from "@/lib/quiz/locale";
import { pathForLocale } from "@/lib/routes";
import FounderResult, {
  type FounderResultView,
} from "@/components/quiz/FounderResult";
import NovaLogo from "@/components/brand/NovaLogo";
import { parseGrowthProfile, GROWTH_DIMENSIONS } from "@/lib/quiz/growth";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Quiz.result" });
  return {
    title: { absolute: t("metaTitle") },
    robots: { index: false, follow: false },
  };
}

export default async function QuizResultPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  const session = await getUserSession();
  if (!session) redirect(pathForLocale("/login", l));

  const submission = await prisma.quizSubmission.findFirst({
    where: { userId: session.uid },
    orderBy: { createdAt: "desc" },
    include: { founder: true },
  });
  if (!submission) redirect(pathForLocale("/quiz", l));

  const growth = parseGrowthProfile(submission.scores);
  if (growth) {
    const t = await getTranslations({ locale, namespace: "Quiz.growthResult" });
    return (
      <main className="nova-theme min-h-screen bg-white px-5 py-12 font-[family-name:var(--font-body)]" data-brand="nova">
        <div className="mx-auto max-w-2xl">
          <NovaLogo variant="black" className="h-auto w-[150px]" sizes="150px" />
          <p className="mt-12 text-xs font-bold uppercase tracking-[0.18em] text-dark/45">{t("eyebrow")}</p>
          <h1 className="mt-3 text-3xl font-bold text-dark md:text-4xl">{t("title")}</h1>
          <p className="mt-3 text-sm text-dark/60">{t("intro")}</p>
          <div className="mt-8 grid gap-4">
            {growth.answers.map((answer, i) => (
              <section key={answer.dimension} className="rounded-2xl border border-dark/10 p-5">
                <h2 className="text-xs font-bold uppercase tracking-wide text-dark/50">
                  {t(GROWTH_DIMENSIONS[i].replace("growth-", "") as "bottleneck" | "style" | "milestone")}
                </h2>
                <p className="mt-2 text-lg font-semibold text-dark">{pick(answer.label, l)}</p>
                <p className="mt-1 text-sm text-dark/60">{pick(answer.desc, l)}</p>
              </section>
            ))}
          </div>
          <a href={pathForLocale("/dashboard", l)} className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-primary px-6 py-3 font-semibold text-white">{t("finish")}</a>
        </div>
      </main>
    );
  }
  // 舊版創辦人配對結果保留，供既有紀錄檢視。
  if (!submission.founder) redirect(pathForLocale("/quiz", l));

  const f = submission.founder;
  const sec = f.statSecondary as
    | { label?: unknown; value?: unknown }
    | null;

  const view: FounderResultView = {
    name: pick(f.name, l),
    role: pick(f.role, l),
    blurb: pick(f.blurb, l),
    traits: pickArr(f.traits, l),
    foundedYear: f.foundedYear,
    statMarketCap: f.statMarketCap,
    statSecondary: sec
      ? { label: pick(sec.label, l), value: String(sec.value ?? "") }
      : null,
    planningDepth: f.planningDepth,
    executionStrength: f.executionStrength,
    visionClarity: f.visionClarity,
    timeline: ((f.timeline as unknown[]) ?? []).map((t) => {
      const item = t as { year?: unknown; title?: unknown; desc?: unknown };
      return {
        year: Number(item.year ?? 0),
        title: pick(item.title, l),
        desc: pick(item.desc, l),
      };
    }),
    businessDetails: ((f.businessDetails as unknown[]) ?? []).map((d) => {
      const item = d as { heading?: unknown; body?: unknown };
      return { heading: pick(item.heading, l), body: pick(item.body, l) };
    }),
    companyHref: f.companySlug
      ? pathForLocale(`/company/${f.companySlug}`, l)
      : null,
    homeHref: pathForLocale("/", l),
    dashboardHref: pathForLocale("/dashboard", l),
  };

  return <FounderResult founder={view} />;
}
