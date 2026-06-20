import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

const KNOWN_STATUSES = ["ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED"];

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-dark/10 bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-dark/40 font-[family-name:var(--font-heading)]">
        {label}
      </p>
      <p className="mt-2 text-xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-dark/50">{hint}</p>}
    </div>
  );
}

export default async function DashboardOverview({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard" });

  const account = await getCurrentAccount();
  if (!account) return null; // layout 已 redirect

  const effectivePlan = getEffectivePlan(account);
  const planName = t(`plans.${effectivePlan}`);

  const status = account.subscriptionStatus;
  const statusValue =
    status && KNOWN_STATUSES.includes(status)
      ? t(`status.${status}`)
      : (status ?? t("overview.noSubscription"));

  const renewsHint =
    account.currentPeriodEnd != null
      ? t("overview.renews", {
          date: new Intl.DateTimeFormat(
            l === "zh-tw" ? "zh-TW" : "en-US",
            { dateStyle: "medium" },
          ).format(account.currentPeriodEnd),
        })
      : undefined;

  const onboardingValue = account.completed
    ? t("overview.onboardingComplete")
    : t("overview.stepOf", { step: account.onboardingStep, total: 4 });

  const firstName = account.firstName?.trim();

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("overview.title")}
        {firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("overview.subtitle")}</p>

      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <Card label={t("overview.planCard")} value={planName} />
        <Card
          label={t("overview.statusCard")}
          value={statusValue}
          hint={renewsHint}
        />
        <Card label={t("overview.onboardingCard")} value={onboardingValue} />
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href={pathForLocale("/dashboard/account", l)}
          className="rounded-xl border border-dark/15 px-5 py-3 text-sm font-semibold text-dark/80 transition-colors hover:bg-dark/[0.03] font-[family-name:var(--font-heading)]"
        >
          {t("overview.editAccount")}
        </Link>
        <Link
          href={pathForLocale("/dashboard/billing", l)}
          className="rounded-xl border border-dark/15 px-5 py-3 text-sm font-semibold text-dark/80 transition-colors hover:bg-dark/[0.03] font-[family-name:var(--font-heading)]"
        >
          {t("overview.manageBilling")}
        </Link>
        <Link
          href={pathForLocale("/dashboard/tools", l)}
          className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 font-[family-name:var(--font-heading)]"
        >
          {t("overview.goToTools")}
        </Link>
      </div>
    </div>
  );
}
