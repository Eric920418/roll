import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { pathForLocale } from "@/lib/routes";
import type { CompanyListItem } from "@/lib/company/content";
import type { Locale } from "@/i18n/routing";

// TOP OPPORTUNITIES：精選台灣上市公司（真實資料），連到 /company/[slug]。
export default async function TopOpportunitiesRail({
  locale,
  companies,
}: {
  locale: Locale;
  companies: CompanyListItem[];
}) {
  const t = await getTranslations({ locale, namespace: "Dashboard.home.opportunities" });

  return (
    <div className="nova-dashboard-card rounded-2xl border border-dark/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-dark font-[family-name:var(--font-heading)]">
          {t("title")}
        </p>
        <Link
          href={pathForLocale("/dashboard/companies", locale)}
          className="text-xs font-semibold text-primary hover:text-primary-dark font-[family-name:var(--font-heading)]"
        >
          {t("viewAll")}
        </Link>
      </div>
      <p className="mt-0.5 text-xs text-dark/45">{t("subtitle")}</p>

      <ul className="mt-4 flex flex-col gap-1">
        {companies.map((c) => {
          const name = locale === "zh-tw" && c.nameZh ? c.nameZh : c.nameEn;
          return (
            <li key={c.slug}>
              <Link
                href={pathForLocale(`/company/${c.slug}`, locale)}
                className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-dark/[0.03]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-dark group-hover:text-primary font-[family-name:var(--font-heading)]">
                    {name}
                  </p>
                  {c.sector && (
                    <p className="truncate text-xs text-dark/45">{c.sector}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-md bg-dark/[0.04] px-2 py-1 text-[11px] font-semibold text-dark/55">
                  {c.market}:{c.ticker}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
