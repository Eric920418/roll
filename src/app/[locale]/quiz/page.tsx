import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { pick } from "@/lib/quiz/locale";
import type { Choice } from "@/lib/quiz/match";
import QuizClient, { type QuizQuestionView } from "@/components/quiz/QuizClient";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export const dynamic = "force-dynamic"; // 題目可後台編輯，需即時

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Quiz" });
  return {
    title: { absolute: t("metaTitle") },
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function QuizPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  const rows = await prisma.quizQuestion.findMany({
    where: { published: true },
    orderBy: { order: "asc" },
  });

  const questions: QuizQuestionView[] = rows.map((r) => {
    const cols: [Choice, unknown][] = [
      ["A", r.optionA],
      ["B", r.optionB],
      ["C", r.optionC],
      ["D", r.optionD],
    ];
    const options = cols
      .filter(([, v]) => v != null)
      .map(([key, v]) => {
        const o = (v ?? {}) as Record<string, unknown>;
        return { key, label: pick(o.label, l), desc: pick(o.desc, l) };
      });
    return {
      id: r.id,
      prompt: pick(r.prompt, l),
      subtitle: pick(r.subtitle, l),
      options,
    };
  });

  return <QuizClient questions={questions} />;
}
