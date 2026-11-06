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

export default async function CustomerInsightsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ connection?: string }> }) {
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

  const connectionId = (await searchParams).connection;
  const connection = account && connectionId && connectionId.length <= 200 ? await prisma.networkConnection.findFirst({ where: { id: connectionId, status: "accepted", OR: [{ senderId: account.id }, { recipientId: account.id }] }, include: { sender: { select: { profile: { select: { companyName: true } }, matchmakingProfile: { select: { displayName: true } } } }, recipient: { select: { profile: { select: { companyName: true } }, matchmakingProfile: { select: { displayName: true } } } } } }) : null;
  const peer = connection ? connection.senderId === account!.id ? connection.recipient : connection.sender : null;
  const prefill = peer ? { company: peer.profile?.companyName || "", name: peer.matchmakingProfile?.displayName || "" } : undefined;
  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">{t("title")}</h1>
      {!account ? discovery && current ? <div className="mt-8"><DiscoveryJourney userId={current.id} /></div> : <PlanPaywall locale={locale as Locale} /> : (
        <div className="mt-8 flex flex-col gap-12">
          {connectionId && !prefill && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{locale === "zh-tw" ? "無法帶入這筆已接受的交流；既有紀錄與草稿保留。" : "This accepted connection is unavailable; existing records and drafts are retained."}</p>}
          {prefill && discovery && <CustomerDiscovery key={connectionId} prefill={prefill} userId={account.id} rows={rows.map(r => ({ ...r, updatedAt: r.updatedAt.toISOString() }))} outcomes={[]} />}
          {discovery ? <DiscoveryJourney userId={account.id} planId={plan?.sourceJourneyId ? plan.id : undefined} /> : <CustomerDiscovery key={connectionId || "regular"} prefill={prefill} tasks={plan?.actions ?? []} userId={account.id} rows={rows.map(r => ({ ...r, updatedAt: r.updatedAt.toISOString() }))} outcomes={outcomes.map(o => ({ ...o, confirmedAt: o.confirmedAt.toISOString() }))} />}
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
