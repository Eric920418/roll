import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  // proxy 已擋未登入；此處二次守衛（DAL）並取帳號資料供整個後台共用
  const account = await getCurrentAccount();
  if (!account) redirect(pathForLocale("/login", l));

  const t = await getTranslations({ locale, namespace: "Dashboard" });
  const effectivePlan = getEffectivePlan(account);
  const planLabel = t(`plans.${effectivePlan}`);
  const userLabel =
    [account.firstName, account.lastName].filter(Boolean).join(" ") ||
    account.email;

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f5f2] md:flex-row">
      <DashboardSidebar
        locale={l}
        planLabel={planLabel}
        userLabel={userLabel}
      />
      <main className="flex-1 px-5 py-8 md:px-10 md:py-12">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
