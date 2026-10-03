import { requireUserPage } from "@/lib/auth/guard";
import GettingStartedHint from "@/components/dashboard/GettingStartedHint";
import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import IcpPanel from "@/components/dashboard/IcpPanel";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };
export default async function CompanyProfilePage({ params }: Props) {
  await requireUserPage((await params).locale);
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  const tOpt = await getTranslations({ locale, namespace: "Auth.options" });
  const account = await getCurrentAccount();
  if (!account) return null;
  const p = account.profile;
  const na = t("profile.notProvided");
  const opt = (ns: string, value?: string | null) => value ? tOpt.has(`${ns}.${value}`) ? tOpt(`${ns}.${value}`) : value : na;
  return <div className="font-[family-name:var(--font-body)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark">{t("profile.title")}</h1><p className="mt-2 text-sm text-dark/60">{t("profile.subtitle")}</p></div>
      <Link href={pathForLocale("/dashboard/account#profile", l)} className="rounded-xl border border-dark/15 px-5 py-3 text-sm font-semibold text-dark hover:bg-dark/[0.03]">{t("profile.edit")}</Link>
    </div>
    <GettingStartedHint mode="profile" />
    <div className="mt-7 grid items-start gap-5 lg:grid-cols-2">
      <section className="min-w-0 rounded-2xl border border-dark/10 bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-dark">{t("icp.company")}</h2>
        <dl className="mt-4 divide-y divide-dark/10">
          <Row label={t("account.companyName")} value={p?.companyName || na} />
          <Row label={t("icp.pitch")} value={p?.oneLinePitch || na} />
          <Row label={t("account.industry")} value={opt("industry", p?.industry)} />
          <Row label={t("icp.companyStage")} value={p?.companyStage ? t.has(`icp.stages.${p.companyStage}`) ? t(`icp.stages.${p.companyStage}`) : p.companyStage : na} />
          <Row label={t("account.companySize")} value={opt("companySize", p?.companySize)} />
          <Row label={t("account.website")} value={p?.website ? <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{p.website}</a> : na} />
          <Row label={t("icp.homeMarket")} value={p?.country || na} />
        </dl>
      </section>
      <IcpPanel userId={account.id} saved={p?.icpDetails || null} legacy={p?.icp || null} version={p?.icpVersion || 0} canUseAi={planAtLeast(getEffectivePlan(account), "pro")}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-dark">{t("icp.now")}</h2>
        <dl className="mt-4 grid gap-x-6 md:grid-cols-2">
          <Row label={t("icp.primaryNeed")} value={p?.primaryNeed ? t.has(`icp.needs.${p.primaryNeed}`) ? t(`icp.needs.${p.primaryNeed}`) : p.primaryNeed : na} />
          <Row label={t("icp.funding")} value={opt("budget", p?.budgetRange)} />
          <Row label={t("icp.companyAge")} value={opt("timeline", p?.timeline)} />
          <Row label={t("account.notes")} value={p?.notes || na} />
        </dl>
      </IcpPanel>
    </div>
  </div>;
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid min-w-0 grid-cols-1 gap-1 border-b border-dark/10 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-4">
    <dt className="text-sm text-dark/60">{label}</dt><dd className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm font-semibold text-dark sm:text-right">{value}</dd>
  </div>;
}
