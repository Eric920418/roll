import { requireUserPage } from "@/lib/auth/guard";
import GettingStartedHint from "@/components/dashboard/GettingStartedHint";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requirePlan } from "@/lib/billing/gate";
import AgendaBoard from "@/components/dashboard/AgendaBoard";
import PlanPaywall from "@/components/dashboard/PlanPaywall";
import type { Locale } from "@/i18n/routing";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import { getCurrentAccount } from "@/lib/auth/account";
import TrialFeedback from "@/components/dashboard/TrialFeedback";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ guide?: string }> };

export default async function AgendaPage({ params, searchParams }: Props) {
  await requireUserPage((await params).locale);
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard.agenda" });
  const member = await getCurrentAccount();

  // layout 已確保登入；null → 方案不足（付費牆）
  const account = await requirePlan("pro");

  if (!account) {
    return (
      <div className="font-[family-name:var(--font-body)]">
        {member && <TrialFeedback userId={member.id} />}
        <h1 className="text-4xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>
        <PlanPaywall locale={l} />
      </div>
    );
  }

  const guided = (await searchParams).guide === "build";
  const actionPlan = await getActiveActionPlan(account.id);

  return (
    <div className="font-[family-name:var(--font-body)]">
      <TrialFeedback userId={account.id} />
      <h1 className="text-4xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      <GettingStartedHint mode="next" />
      <AgendaBoard guided={guided} userId={account.id}
        actionPlan={actionPlan}
      />
    </div>
  );
}
