import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { requirePlan } from "@/lib/billing/gate";
import { buildChecklist } from "@/lib/tools/checklist";
import ChecklistTool from "@/components/dashboard/ChecklistTool";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export default async function ToolsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard.tools" });

  // gating：layout 已確保登入，此處 null 代表「方案不足」→ 顯示付費牆
  const account = await requirePlan("pro");
  const groups = account
    ? buildChecklist(account.profile?.needs ?? [], l)
    : [];

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      {!account ? (
        // 方案不足：鎖定狀態 + 升級 CTA
        <div className="mt-7 rounded-2xl border border-primary/20 bg-primary/[0.04] p-7">
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
            {t("lockedTitle")}
          </h2>
          <p className="mt-2 text-sm text-dark/70">{t("lockedBody")}</p>
          <Link
            href={pathForLocale("/dashboard/billing", l)}
            className="mt-5 inline-block rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 font-[family-name:var(--font-heading)]"
          >
            {t("upgrade")}
          </Link>
        </div>
      ) : groups.length === 0 ? (
        // 已達 Pro 但尚未填 needs → 引導去帳號頁
        <div className="mt-7 rounded-2xl border border-dark/10 bg-white p-7">
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
            {t("emptyTitle")}
          </h2>
          <p className="mt-2 text-sm text-dark/60">{t("emptyBody")}</p>
          <Link
            href={pathForLocale("/dashboard/account", l)}
            className="mt-5 inline-block rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 font-[family-name:var(--font-heading)]"
          >
            {t("emptyCta")}
          </Link>
        </div>
      ) : (
        <ChecklistTool groups={groups} initialState={account.checklistState} />
      )}
    </div>
  );
}
