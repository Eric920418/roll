import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

// Pro 方案付費牆（CRM / Pipeline / Notes 共用）。沿用 tools 頁鎖定卡樣式。
export default async function PlanPaywall({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "Dashboard.gate" });
  return (
    <div className="mt-7 rounded-2xl border border-primary/20 bg-primary/[0.04] p-7">
      <h2 className="text-xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
        {t("lockedTitle")}
      </h2>
      <p className="mt-2 text-sm text-dark/70">{t("lockedBody")}</p>
      <Link
        href={pathForLocale("/dashboard/billing", locale)}
        className="mt-5 inline-block rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 font-[family-name:var(--font-heading)]"
      >
        {t("upgrade")}
      </Link>
    </div>
  );
}
