import { setRequestLocale, getTranslations } from "next-intl/server";
import BillingPanel from "@/components/dashboard/BillingPanel";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

const KNOWN_STATUSES = ["ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED"];

export default async function BillingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Billing" });
  const tStatus = await getTranslations({ locale, namespace: "Dashboard.status" });

  const account = await getCurrentAccount();
  if (!account) return null; // layout 已 redirect

  const effectivePlan = getEffectivePlan(account);
  const status = account.subscriptionStatus;

  const statusLabel = !status
    ? t("noSubscription")
    : KNOWN_STATUSES.includes(status)
      ? tStatus(status)
      : status;

  const renewsLabel =
    account.currentPeriodEnd != null
      ? t("renews", {
          date: new Intl.DateTimeFormat(l === "zh-tw" ? "zh-TW" : "en-US", {
            dateStyle: "medium",
          }).format(account.currentPeriodEnd),
        })
      : undefined;

  // 只有 ACTIVE 訂閱可取消
  const hasActiveSub = !!account.paypalSubscriptionId && status === "ACTIVE";

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      <BillingPanel
        locale={l}
        currentPlan={effectivePlan}
        statusLabel={statusLabel}
        renewsLabel={renewsLabel}
        hasActiveSub={hasActiveSub}
      />
    </div>
  );
}
