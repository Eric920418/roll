import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import AuthShell from "@/components/auth/AuthShell";
import OnboardingCompanyForm from "@/components/auth/OnboardingCompanyForm";
import OnboardingRequirementsForm from "@/components/auth/OnboardingRequirementsForm";
import { getUserSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string; step: string }> };

const STEP_TO_NUM = { company: 2, requirements: 3 } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, step } = await params;
  const ns = step === "requirements" ? "Auth.requirements" : "Auth.company";
  const t = await getTranslations({ locale, namespace: ns });
  return {
    title: { absolute: t("title") },
    robots: { index: false, follow: false },
  };
}

export default async function OnboardingStepPage({ params }: Props) {
  const { locale, step } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  if (step !== "company" && step !== "requirements") notFound();

  // proxy 已擋未登入；此處二次守衛並取既有資料供預填
  const session = await getUserSession();
  if (!session) redirect(pathForLocale("/login", l));

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    include: { profile: true },
  });
  if (!user) redirect(pathForLocale("/login", l));

  const p = user.profile;

  return (
    <AuthShell step={STEP_TO_NUM[step]}>
      {step === "company" ? (
        <OnboardingCompanyForm
          initial={{
            companyName: p?.companyName,
            industry: p?.industry,
            companySize: p?.companySize,
            website: p?.website,
            country: p?.country,
          }}
        />
      ) : (
        <OnboardingRequirementsForm
          initial={{
            targetMarkets: p?.targetMarkets ?? [],
            needs: p?.needs ?? [],
            timeline: p?.timeline,
            budgetRange: p?.budgetRange,
            notes: p?.notes,
          }}
        />
      )}
    </AuthShell>
  );
}
