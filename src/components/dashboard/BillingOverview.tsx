import { getTranslations } from "next-intl/server";
import BillingPanel from "@/components/dashboard/BillingPanel";
import { getCurrentAccount } from "@/lib/auth/account";
import {
  getEffectivePlan,
  suspendedGraceActive,
  suspendedGraceEndsAt,
} from "@/lib/billing/gate";
import { paypalManagePaymentUrl } from "@/lib/billing/paypal";
import { getAiUsageSummary } from "@/lib/ai/allowance";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";

const KNOWN_STATUSES = ["ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED"];

export default async function BillingOverview({ locale, embedded = false }: { locale: string; embedded?: boolean }) {
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Billing" });
  const tStatus = await getTranslations({ locale, namespace: "Dashboard.status" });

  const account = await getCurrentAccount();
  if (!account) return null; // layout 已 redirect

  const effectivePlan = getEffectivePlan(account);
  const status = account.subscriptionStatus;

  const statusLabel = account.betaAccess && !status
    ? t("betaAccess")
    : !status
    ? t("noSubscription")
    : KNOWN_STATUSES.includes(status)
      ? tStatus(status)
      : status;

  const dateFmt = new Intl.DateTimeFormat(l === "zh-tw" ? "zh-TW" : "en-US", {
    dateStyle: "medium",
    timeZone: "Asia/Taipei",
    timeStyle: "short",
  });

  const renewsLabel =
    account.currentPeriodEnd != null
      ? t("renews", {
          date: new Intl.DateTimeFormat(l === "zh-tw" ? "zh-TW" : "en-US", {
            dateStyle: "medium",
            timeZone: "Asia/Taipei",
          }).format(account.currentPeriodEnd),
        })
      : undefined;

  // 扣款失敗寬限期（SUSPENDED）：顯示倒數與自救入口。寬限期已過則 gate 已降級為 free，
  // 此時不再顯示「快去更新」的誤導訊息，改由方案卡片引導重新訂閱。
  const graceEnd = suspendedGraceActive(account)
    ? suspendedGraceEndsAt(account)
    : null;
  const suspendedNotice = graceEnd
    ? {
        deadline: dateFmt.format(graceEnd),
        manageUrl: paypalManagePaymentUrl(),
      }
    : undefined;

  // ACTIVE 與 SUSPENDED 都給取消入口 —— SUSPENDED 的客戶若決定不救，也該能自己終止訂閱，
  // 否則只能寫信求客服（PayPal 允許取消 SUSPENDED 訂閱）。
  const hasActiveSub =
    !!account.paypalSubscriptionId &&
    (status === "ACTIVE" || status === "SUSPENDED");

  const usage =
    effectivePlan === "free" ? undefined : (await getAiUsageSummary(account)) ?? undefined;
  const now = new Date();
  const trialLabel =
    account.trialPlan &&
    account.trialStartsAt &&
    account.trialEndsAt &&
    account.trialStartsAt <= now &&
    account.trialEndsAt > now
      ? t("trialUntil", { date: dateFmt.format(account.trialEndsAt) })
      : undefined;
  const paidSubscription = account.paypalSubscriptionId
    ? await prisma.subscription.findUnique({
        where: { paypalSubscriptionId: account.paypalSubscriptionId },
        select: { billingInterval: true },
      })
    : null;
  const currentInterval =
    paidSubscription?.billingInterval === "year" ? "year" : "month";

  return (
    <section id="plan" className="scroll-mt-8 font-[family-name:var(--font-body)]">
      {embedded ? <h2 className="text-2xl font-extrabold text-dark font-[family-name:var(--font-heading)]">{t("title")}</h2> : <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">{t("title")}</h1>}
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      <BillingPanel
        locale={l}
        currentPlan={effectivePlan}
        statusLabel={statusLabel}
        renewsLabel={renewsLabel}
        hasActiveSub={hasActiveSub}
        suspendedNotice={suspendedNotice}
        usage={usage}
        trialLabel={trialLabel}
        currentInterval={currentInterval}
        betaAccess={account.betaAccess}
      />
    </section>
  );
}
