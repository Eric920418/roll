import MissingProfileField from "@/components/dashboard/MissingProfileField";
import { COMPANY_STAGES } from "@/lib/action-plan/constants";
import { INDUSTRIES, COMPANY_SIZES } from "@/components/auth/onboarding-options";
import { countryLabel } from "@/lib/member-options";
import { requireUserPage } from "@/lib/auth/guard";
import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import EvidencePanel from "@/components/dashboard/evidence/EvidencePanel";
import { getCurrentAccount } from "@/lib/auth/account";
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
      <div><h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark">{t("profile.title")}</h1></div>
      <Link href={pathForLocale("/dashboard/account#profile", l)} className="rounded-xl border border-dark/15 px-5 py-3 text-sm font-semibold text-dark hover:bg-dark/[0.03]">{t("profile.edit")}</Link>
    </div>
    <div className="mt-7 grid items-start gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
      <div className="min-w-0 space-y-5"><section className="min-w-0 rounded-2xl border border-dark/10 bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-dark">{t("icp.company")}</h2>
        <dl className="mt-4 divide-y divide-dark/10">
          <Row label={t("account.companyName")} value={p?.companyName || <MissingProfileField field="companyName" label={t("account.companyName")} maxLength={300} />} />
          <Row label={t("icp.pitch")} value={p?.oneLinePitch || <MissingProfileField field="oneLinePitch" label={t("icp.pitch")} maxLength={500} />} />
          <Row label={t("account.industry")} value={p?.industry ? opt("industry", p.industry) : <MissingProfileField field="industry" label={t("account.industry")} options={INDUSTRIES.map(value => ({ value, label: tOpt(`industry.${value}`) }))} />} />
          <Row label={t("icp.companyStage")} value={p?.companyStage ? t.has(`icp.stages.${p.companyStage}`) ? t(`icp.stages.${p.companyStage}`) : p.companyStage : <MissingProfileField field="companyStage" label={t("icp.companyStage")} options={COMPANY_STAGES.map(value => ({ value, label: t(`icp.stages.${value}`) }))} />} />
          <Row label={t("account.companySize")} value={p?.companySize ? opt("companySize", p.companySize) : <MissingProfileField field="companySize" label={t("account.companySize")} options={COMPANY_SIZES.map(value => ({ value, label: tOpt(`companySize.${value}`) }))} />} />
          <Row label={t("account.website")} value={p?.website ? <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{p.website}</a> : <MissingProfileField field="website" label={t("account.website")} maxLength={2000} />} />
          <Row label={t("icp.homeMarket")} value={p?.country ? countryLabel(p.country, locale) : <MissingProfileField field="country" label={t("icp.homeMarket")} />} />
        </dl>
      </section>
      </div>
      <EvidencePanel userId={account.id} />
    </div>
  </div>;
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid min-w-0 grid-cols-1 gap-1 border-b border-dark/10 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-4">
    <dt className="text-sm text-dark/60">{label}</dt><dd className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm font-semibold text-dark sm:text-right">{value}</dd>
  </div>;
}
