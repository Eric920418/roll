import { setRequestLocale, getTranslations } from "next-intl/server";
import AccountProfileForm from "@/components/dashboard/AccountProfileForm";
import AccountSecurityForm from "@/components/dashboard/AccountSecurityForm";
import AccountDangerZone from "@/components/dashboard/AccountDangerZone";
import { getCurrentAccount } from "@/lib/auth/account";

type Props = { params: Promise<{ locale: string }> };

export default async function AccountPage({ params }: Props) {
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

      <AccountProfileForm
        initial={{
          companyName: p?.companyName,
          industry: p?.industry,
          companySize: p?.companySize,
          website: p?.website,
          country: p?.country,
          needs: p?.needs ?? [],
          timeline: p?.timeline,
          budgetRange: p?.budgetRange,
          notes: p?.notes,
        }}
      />

      <AccountSecurityForm hasPassword={account.hasPassword} />
      <AccountDangerZone />
    </div>
  );
}
