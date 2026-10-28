import { InvestorProgress } from "@/components/dashboard/network/NetworkPanels";
import { requireUserPage } from "@/lib/auth/guard";
import GettingStartedHint from "@/components/dashboard/GettingStartedHint";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requirePlan } from "@/lib/billing/gate";
import AgendaBoard from "@/components/dashboard/AgendaBoard";
import PlanPaywall from "@/components/dashboard/PlanPaywall";
import type { Locale } from "@/i18n/routing";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import { getCurrentAccount } from "@/lib/auth/account";
import { isDiscoveryMember } from "@/lib/discovery/policy";
import DiscoveryJourney from "@/components/dashboard/discovery/DiscoveryJourney";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ guide?: string }> };

export default async function AgendaPage({ params, searchParams }: Props) {
  await requireUserPage((await params).locale);
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard.agenda" });

  // layout 已確保登入；null → 方案不足（付費牆）
  const account = await requirePlan("pro");
  const current = account ?? await getCurrentAccount();
  const discovery = isDiscoveryMember(current);

  if (!account) {
    return (
      <div className="font-[family-name:var(--font-body)]">
      <InvestorProgress />
        <h1 className="text-4xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>
        {discovery && current ? <div className="mt-7"><DiscoveryJourney userId={current.id} /></div> : <PlanPaywall locale={l} />}
      </div>
    );
  }

  const guided = (await searchParams).guide === "build";
  const actionPlan = await getActiveActionPlan(account.id);

  return (
    <div className="font-[family-name:var(--font-body)]">
      <InvestorProgress />
      <h1 className="text-4xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      <GettingStartedHint mode="next" />
      {discovery && <div className="my-7"><DiscoveryJourney userId={account.id} planId={actionPlan?.id} showCommercial={!actionPlan} /></div>}
      <AgendaBoard guided={guided} userId={account.id}
        actionPlan={actionPlan}
      />
    </div>
  );
}
