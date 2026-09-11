import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getUserSession } from "@/lib/auth/guard";
import { getInvestorView } from "@/lib/investor/portal";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export default async function InvestorCompanyPage({ params }: { params: Promise<{ locale: string; portalId: string }> }) {
  const { locale, portalId } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const session = await getUserSession();
  if (!session) redirect(pathForLocale("/login", l));
  const view = await getInvestorView(portalId, session.uid);
  if (!view) notFound();
  const t = await getTranslations({ locale, namespace: "InvestorView" });
  return (
    <main className="min-h-screen bg-cream px-5 py-12 font-[family-name:var(--font-body)]">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.04em] text-dark font-[family-name:var(--font-heading)]">{view.companyName}</h1>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {view.profile && <Section title={t("profile")}><dl className="grid gap-3 text-sm sm:grid-cols-2"><Info label={t("industry")} value={view.profile.industry} /><Info label={t("companySize")} value={view.profile.companySize} /><Info label={t("country")} value={view.profile.country} /><Info label={t("targetMarkets")} value={view.profile.targetMarkets.join(", ")} /></dl>{view.profile.website && <a className="mt-4 block text-sm font-bold text-primary" href={view.profile.website} target="_blank" rel="noreferrer">{view.profile.website}</a>}</Section>}
          {view.strategy && <Section title={t("strategy")}><p className="font-bold text-dark">{view.strategy.diagnosis.companyStage}</p><p className="mt-2 text-sm leading-6 text-dark/60">{view.strategy.diagnosis.stageReason}</p><p className="mt-5 font-bold text-dark">{view.strategy.diagnosis.bottleneckGroup} · {view.strategy.diagnosis.bottleneckCode}</p><p className="mt-2 text-sm leading-6 text-dark/60">{view.strategy.diagnosis.bottleneckReason}</p></Section>}
          {view.actionPlan && <Section title={t("actionPlan")}><div className="grid gap-3 sm:grid-cols-3">{view.actionPlan.nextMoves.map((action) => <div key={action.id} className="rounded-xl bg-dark/[0.04] p-4"><p className="text-xs font-bold text-primary">#{action.rank}</p><p className="mt-2 text-sm font-bold text-dark">{action.title}</p><p className="mt-2 text-xs leading-5 text-dark/55">{action.expectedOutcome.text}</p></div>)}</div></Section>}
          {view.kpis && <Section title={t("kpis")}><div className="grid gap-3 sm:grid-cols-2">{view.kpis.map((item: { id: string; label: string; value: string; period: string | null }) => <div key={item.id} className="rounded-xl bg-dark/[0.04] p-4"><p className="text-xs text-dark/45">{item.label}{item.period ? ` · ${item.period}` : ""}</p><p className="mt-1 text-2xl font-bold text-dark">{item.value}</p></div>)}</div></Section>}
          {view.milestones && <Section title={t("milestones")}><ul className="space-y-3">{view.milestones.map((item: { id: string; title: string; status: string; targetDate: Date | null; notes: string | null }) => <li key={item.id} className="rounded-xl bg-dark/[0.04] p-4"><p className="font-bold text-dark">{item.title}</p><p className="mt-1 text-xs text-dark/50">{item.status}{item.targetDate ? ` · ${new Intl.DateTimeFormat(l === "zh-tw" ? "zh-TW" : "en-US").format(item.targetDate)}` : ""}</p>{item.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-dark/60">{item.notes}</p>}</li>)}</ul></Section>}
          {view.updates && <Section title={t("updates")}><div className="space-y-4">{view.updates.map((item: { id: string; title: string; body: string; publishedAt: Date }) => <article key={item.id}><p className="text-xs text-dark/40">{new Intl.DateTimeFormat(l === "zh-tw" ? "zh-TW" : "en-US").format(item.publishedAt)}</p><h3 className="mt-1 font-bold text-dark">{item.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-dark/60">{item.body}</p></article>)}</div></Section>}
          {view.businessPlan && <Section title={t("businessPlan")}><p className="text-sm text-dark/60">{view.businessPlan.filename}</p><a href={`/api/investor-portal/business-plan?portalId=${encodeURIComponent(view.id)}`} target="_blank" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">{t("openPdf")}</a></Section>}
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-dark/10 bg-white p-6"><h2 className="mb-4 text-xl font-bold text-dark">{title}</h2>{children}</section>; }
function Info({ label, value }: { label: string; value: string | null }) { return <div><dt className="text-xs text-dark/40">{label}</dt><dd className="mt-1 font-semibold text-dark">{value || "—"}</dd></div>; }
