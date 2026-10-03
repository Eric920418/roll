import { requireUserPage } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { monthlyPriceLabel, planAtLeast } from "@/lib/billing/plans";
import { pathForLocale } from "@/lib/routes";
import { getOrCreateOwnerPortal, ownerPortalDto } from "@/lib/investor/portal";
import { canEditFieldVisibility } from "@/lib/investor/fields";
import InvestorPortalManager from "@/components/dashboard/InvestorPortalManager";
import type { Locale } from "@/i18n/routing";

export default async function InvestorPortalPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ checkInId?: string }> }) {
  await requireUserPage((await params).locale);
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "InvestorPortal" });
  const account = await getCurrentAccount();
  if (!account) return null;
  const plan = getEffectivePlan(account);
  if (!planAtLeast(plan, "business")) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">{t("title")}</h1>
        <div className="mt-7 rounded-2xl border border-primary/20 bg-white p-7">
          <h2 className="text-xl font-bold text-dark">{t("upgradeTitle", { price: monthlyPriceLabel("business") ?? "" })}</h2>
          <p className="mt-2 text-sm leading-6 text-dark/60">{t("upgradeBody")}</p>
          <Link href={pathForLocale("/dashboard/account#plan", l)} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">
            {t("upgradeCta")}
          </Link>
        </div>
      </div>
    );
  }
  const query = await searchParams;
  const source = query.checkInId ? await prisma.weeklyCheckIn.findFirst({ where: { id: query.checkInId, userId: account.id }, select: { id: true, revision: true, investorDraft: true, weekStart: true } }) : null;
  const weeklyDraft = source?.investorDraft ? { id: source.id, revision: source.revision, body: source.investorDraft, title: `Weekly update · ${source.weekStart.toISOString().slice(0, 10)}` } : null;
  const portal = ownerPortalDto(await getOrCreateOwnerPortal(account.id));
  // 逐欄位／逐筆隱藏只有 Enterprise 能「改」；已設定的隱藏對任何方案都持續生效。
  return (
    <InvestorPortalManager
      locale={l} weeklyDraft={weeklyDraft}
      initialPortal={portal}
      canHideFields={canEditFieldVisibility(plan)}
    />
  );
}
