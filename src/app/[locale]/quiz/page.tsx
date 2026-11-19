import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import CustomerWorksheet from "@/components/quiz/CustomerWorksheet";
import { getCurrentAccount } from "@/lib/auth/account";
import { requireUserPage } from "@/lib/auth/guard";
import { destinationFor } from "@/lib/auth/onboarding";
import { getSavedWorksheet } from "@/lib/icp/worksheet-service";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: { absolute: locale === "zh-tw" ? "建立你的客戶假設 | NOVA AI" : "Build your customer hypothesis | NOVA AI" },
    robots: { index: false, follow: false },
  };
}

export default async function QuizPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUserPage(locale);
  const account = await getCurrentAccount();
  if (!account) redirect(pathForLocale("/login", locale));
  if (!account.completed && account.onboardingStep < 4) redirect(destinationFor(account, locale));

  return <CustomerWorksheet userId={account.id} locale={locale} completed={account.completed} initial={await getSavedWorksheet(account.id)} />;
}
