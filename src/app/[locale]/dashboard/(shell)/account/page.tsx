import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { setRequestLocale, getTranslations } from "next-intl/server";
import AccountProfileForm from "@/components/dashboard/AccountProfileForm";
import AccountSecurityForm from "@/components/dashboard/AccountSecurityForm";
import AccountDangerZone from "@/components/dashboard/AccountDangerZone";
import BillingOverview from "@/components/dashboard/BillingOverview";
import { getCurrentAccount } from "@/lib/auth/account";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ guide?: string }> };

export default async function AccountPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Dashboard.account" });

  const account = await getCurrentAccount();
  if (!account) return null; // layout 已 redirect

  const p = account.profile;

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      <AccountProfileForm canGenerate={planAtLeast(getEffectivePlan(account), "pro")} guided={(await searchParams).guide === "profile"}
        initial={{
          companyName: p?.companyName,
          industry: p?.industry,
          companySize: p?.companySize,
          website: p?.website,
          country: p?.country,
          oneLinePitch: p?.oneLinePitch,
          companyStage: p?.companyStage,
          primaryNeed: p?.primaryNeed,
          needs: p?.needs ?? [],
          timeline: p?.timeline,
          budgetRange: p?.budgetRange,
          notes: p?.notes,
        }}
      />

      <div className="mt-12 border-t border-dark/10 pt-10"><BillingOverview locale={locale} embedded /></div>
      <AccountSecurityForm hasPassword={account.hasPassword} />
      <AccountDangerZone />
    </div>
  );
}
