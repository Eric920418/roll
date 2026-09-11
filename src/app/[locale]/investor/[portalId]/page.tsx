import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getUserSession } from "@/lib/auth/guard";
import { getInvestorView } from "@/lib/investor/portal";
import { pathForLocale } from "@/lib/routes";
import ProfileSection from "@/components/investor/ProfileSection";
import StrategySection from "@/components/investor/StrategySection";
import ActionPlanSection from "@/components/investor/ActionPlanSection";
import KpiSection from "@/components/investor/KpiSection";
import MilestoneSection from "@/components/investor/MilestoneSection";
import UpdateSection from "@/components/investor/UpdateSection";
import BusinessPlanSection from "@/components/investor/BusinessPlanSection";
import type { Locale } from "@/i18n/routing";

// 每個區塊為 null 代表「擁有者沒有分享」或「分享了但內容全被隱藏」，
// 一律整段不渲染 —— 不留佔位，也不進 RSC payload。
export default async function InvestorCompanyPage({
  params,
}: {
  params: Promise<{ locale: string; portalId: string }>;
}) {
  const { locale, portalId } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const session = await getUserSession();
  if (!session) redirect(pathForLocale("/login", l));
  const view = await getInvestorView(portalId, session.uid);
  if (!view) notFound();
  const t = await getTranslations({ locale, namespace: "InvestorView" });

  const hasAny =
    view.profile ||
    view.strategy ||
    view.actionPlan ||
    view.kpis ||
    view.milestones ||
    view.updates ||
    view.businessPlan;

  return (
    <main className="min-h-screen bg-cream px-5 py-12 font-[family-name:var(--font-body)]">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.04em] text-dark font-[family-name:var(--font-heading)]">
          {view.companyName}
        </h1>

        {!hasAny ? (
          <p className="mt-8 rounded-2xl border border-dashed border-dark/15 bg-white/60 p-6 text-sm text-dark/60">
            {t("nothingShared")}
          </p>
        ) : (
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {view.profile && <ProfileSection locale={l} profile={view.profile} />}
            {view.strategy && <StrategySection locale={l} strategy={view.strategy} />}
            {view.actionPlan && <ActionPlanSection locale={l} actionPlan={view.actionPlan} />}
            {view.kpis && <KpiSection locale={l} kpis={view.kpis} />}
            {view.milestones && <MilestoneSection locale={l} milestones={view.milestones} />}
            {view.updates && <UpdateSection locale={l} updates={view.updates} />}
            {view.businessPlan && (
              <BusinessPlanSection
                locale={l}
                portalId={view.id}
                filename={view.businessPlan.filename}
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
