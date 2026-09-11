import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { pathForLocale } from "@/lib/routes";
import { getOrCreateOwnerPortal, ownerPortalDto } from "@/lib/investor/portal";
import InvestorPortalManager from "@/components/dashboard/InvestorPortalManager";
import type { Locale } from "@/i18n/routing";

export default async function InvestorPortalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "InvestorPortal" });
  const account = await getCurrentAccount();
  if (!account) return null;
  if (!planAtLeast(getEffectivePlan(account), "business")) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">{t("title")}</h1>
        <div className="mt-7 rounded-2xl border border-primary/20 bg-white p-7">
          <h2 className="text-xl font-bold text-dark">{t("upgradeTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-dark/60">{t("upgradeBody")}</p>
          <Link href={pathForLocale("/dashboard/billing", l)} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">
            {t("upgradeCta")}
          </Link>
        </div>
      </div>
    );
  }
  const portal = ownerPortalDto(await getOrCreateOwnerPortal(account.id));
  return <InvestorPortalManager locale={l} initialPortal={portal} />;
}
