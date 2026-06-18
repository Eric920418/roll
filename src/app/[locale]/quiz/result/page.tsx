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
  // 還沒做測驗（或配對不到）→ 回測驗
  if (!submission || !submission.founder) redirect(pathForLocale("/quiz", l));

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
  };

  return <FounderResult founder={view} />;
}
