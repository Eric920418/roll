import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requirePlan } from "@/lib/billing/gate";
import { buildMilestoneBoard } from "@/lib/tools/checklist";
import AgendaBoard from "@/components/dashboard/AgendaBoard";
import PlanPaywall from "@/components/dashboard/PlanPaywall";
import type { Locale } from "@/i18n/routing";
import { getActiveActionPlan } from "@/lib/action-plan/service";

type Props = { params: Promise<{ locale: string }> };

export default async function AgendaPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard.agenda" });

  // layout 已確保登入；null → 方案不足（付費牆）
  const account = await requirePlan("pro");

  if (!account) {
    return (
      <div className="font-[family-name:var(--font-body)]">
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>
        <PlanPaywall locale={l} />
      </div>
    );
  }

  const needs = account.profile?.needs ?? [];
  const actionPlan = await getActiveActionPlan(account.id);
  const milestoneGroups = buildMilestoneBoard(needs, l, account.checklistState, account.milestoneConfig);

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      <AgendaBoard userId={account.id} canShare={planAtLeast(getEffectivePlan(account), "business")}
        actionPlan={actionPlan}
        milestoneGroups={milestoneGroups}
      />
    </div>
  );
}
