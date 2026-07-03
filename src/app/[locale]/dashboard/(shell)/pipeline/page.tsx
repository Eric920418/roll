import { setRequestLocale, getTranslations } from "next-intl/server";
import { requirePlan } from "@/lib/billing/gate";
import { prisma } from "@/lib/prisma";
import PipelineBoard from "@/components/dashboard/PipelineBoard";
import PlanPaywall from "@/components/dashboard/PlanPaywall";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export default async function PipelinePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard.pipeline" });

  const account = await requirePlan("pro");
  const [deals, contacts] = account
    ? await Promise.all([
        prisma.deal.findMany({
          where: { userId: account.id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            stage: true,
            value: true,
            contactId: true,
            notes: true,
          },
        }),
        prisma.contact.findMany({
          where: { userId: account.id },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ])
    : [[], []];

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      {!account ? (
        <PlanPaywall locale={l} />
      ) : (
        <PipelineBoard deals={deals} contacts={contacts} />
      )}
    </div>
  );
}
