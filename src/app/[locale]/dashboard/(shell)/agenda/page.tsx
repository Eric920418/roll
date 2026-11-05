import RoundtableCommitments from "@/components/dashboard/roundtables/Commitments";
import { InvestorProgress } from "@/components/dashboard/network/NetworkPanels";
import { requireUserPage } from "@/lib/auth/guard";
import NextStepsTour from "@/components/dashboard/NextStepsTour";
import ProspectSearch from "@/components/dashboard/prospecting/ProspectSearch";
import ConversationHistory from "@/components/dashboard/ConversationHistory";
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
import { getDiscoverySnapshot } from "@/lib/discovery/service";

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

        <h1 className="text-4xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
          {t("title")}
        </h1>
        <RoundtableCommitments />
        {discovery && current ? <><div className="mt-7"><DiscoveryJourney userId={current.id} compactTrial /></div><details className="mt-6 rounded-2xl border border-dark/10 bg-white p-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{locale === "zh-tw" ? "歷史對話紀錄" : "Conversation history"}</summary><ConversationHistory /></details><InvestorProgress confirmationOnly /></> : <PlanPaywall locale={l} />}
      </div>
    );
  }

  const guided = (await searchParams).guide === "build";
  const actionPlan = await getActiveActionPlan(account.id);
  const savedDiscovery = discovery && !actionPlan ? await getDiscoverySnapshot(account.id) : null;
  const currentTask = actionPlan?.nextMoves[0] || actionPlan?.actions.find(a => !a.done && !a.dependency.blocked);
  const awaitingOutcome = actionPlan?.roadmap?.milestones.some(m => !m.achievedAt && ["awaiting", "unplanned"].includes(m.status));

  return (
    <div className="font-[family-name:var(--font-body)]">

      <h1 className="text-4xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>

      {actionPlan && <NextStepsTour workflowVersion={actionPlan.workflowVersion} mission={currentTask?.title || (awaitingOutcome ? (locale === "zh-tw" ? "確認本階段成果並繼續" : "Confirm this stage’s outcomes and continue") : (locale === "zh-tw" ? "驗證你的目標客戶" : "Validate your ICP"))} target={currentTask?.metric?.target} reward={Boolean(currentTask)} />}
      <GettingStartedHint mode="next" />
      <RoundtableCommitments />
      <AgendaBoard guided={guided || !actionPlan} userId={account.id}
        actionPlan={actionPlan}
      />
      {savedDiscovery?.journeyId && (savedDiscovery.total > 0 || savedDiscovery.setup?.confirmed) && <div className="my-7"><DiscoveryJourney userId={account.id} compactTrial /></div>}
      {!actionPlan && !savedDiscovery?.journeyId && <details id="prospects" className="mt-6 scroll-mt-6 rounded-2xl border border-dark/15 bg-white p-5"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{locale === "zh-tw" ? "搜尋優先聯絡的公司" : "Find companies worth contacting"}</summary><ProspectSearch userId={account.id} /></details>}
      <InvestorProgress confirmationOnly />
    </div>
  );
}
