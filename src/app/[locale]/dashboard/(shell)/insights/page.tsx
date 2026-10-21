import { requireUserPage } from "@/lib/auth/guard";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requirePlan } from "@/lib/billing/gate";
import { prisma } from "@/lib/prisma";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import CustomerDiscovery from "@/components/dashboard/CustomerDiscovery";
import CrmManager from "@/components/dashboard/CrmManager";
import NotesManager from "@/components/dashboard/NotesManager";
import PlanPaywall from "@/components/dashboard/PlanPaywall";
import type { Locale } from "@/i18n/routing";
import { getCurrentAccount } from "@/lib/auth/account";
import { isDiscoveryMember } from "@/lib/discovery/policy";
import DiscoveryJourney from "@/components/dashboard/discovery/DiscoveryJourney";

export default async function CustomerInsightsPage({ params }: { params: Promise<{ locale: string }> }) {
  await requireUserPage((await params).locale);
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Dashboard.insights" });
  const account = await requirePlan("pro");
  const current = account ?? await getCurrentAccount();
  const discovery = isDiscoveryMember(current);
  const [contacts, rows, plan, outcomes] = account
    ? await Promise.all([
        prisma.contact.findMany({
          where: { userId: account.id },
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, company: true, category: true, email: true, phone: true, status: true, notes: true },
        }),
        prisma.meetingNote.findMany({
          where: { userId: account.id },
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, body: true, meetingAt: true, meetingType: true, insight: true, updatedAt: true },
        }),
        getActiveActionPlan(account.id),
        prisma.customerStageOutcome.findMany({ where: { userId: account.id }, select: { stage: true, primaryCount: true, secondaryCount: true, confirmedAt: true } }),
      ])
    : [[], [], null, []];

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">{t("title")}</h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>
      {!account ? discovery && current ? <div className="mt-8"><DiscoveryJourney userId={current.id} /></div> : <PlanPaywall locale={locale as Locale} /> : (
        <div className="mt-8 flex flex-col gap-12">
          {discovery ? <DiscoveryJourney userId={account.id} planId={plan?.sourceJourneyId ? plan.id : undefined} /> : <CustomerDiscovery tasks={plan?.actions ?? []} userId={account.id} rows={rows.map(r => ({ ...r, updatedAt: r.updatedAt.toISOString() }))} outcomes={outcomes.map(o => ({ ...o, confirmedAt: o.confirmedAt.toISOString() }))} />}
          <details id="contacts" className="scroll-mt-6">
            <summary className="min-h-11 cursor-pointer text-xl font-bold text-dark">{t("contacts")}</summary>
            <CrmManager contacts={contacts} />
          </details>
          <details id="notes" className="scroll-mt-6">
            <summary className="min-h-11 cursor-pointer text-xl font-bold text-dark">{t("notes")}</summary>
            <NotesManager notes={rows.filter(row => !row.insight).map((row) => ({ ...row, meetingAt: row.meetingAt?.toISOString() ?? null }))} />
          </details>
        </div>
      )}
    </div>
  );
}
