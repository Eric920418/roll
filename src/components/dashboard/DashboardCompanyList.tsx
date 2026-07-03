"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { CompanyListItem } from "@/lib/company/content";
import type { Locale } from "@/i18n/routing";

// 後台版台灣公司清單（沿用 dashboard 紅色品牌 token，非 /company 的 navy 主題）。
export default function DashboardCompanyList({
  companies,
}: {
  companies: CompanyListItem[];
}) {
  const t = useTranslations("Dashboard.companies");
  const locale = useLocale() as Locale;
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return companies;
    return companies.filter(
      (c) =>
        c.nameEn.toLowerCase().includes(s) ||
        (c.nameZh?.toLowerCase().includes(s) ?? false) ||
        c.ticker.toLowerCase().includes(s) ||
        (c.sector?.toLowerCase().includes(s) ?? false),
    );
  }, [q, companies]);

  return (
    <div className="mt-7">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full max-w-md rounded-xl border border-dark/10 bg-dark/[0.03] px-4 py-3 text-sm text-dark outline-none transition placeholder:text-dark/35 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]"
      />

      <p className="mt-3 text-sm text-dark/55">
        {t("count", { count: filtered.length })}
      </p>

      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-sm text-dark/55">{t("empty")}</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const name = locale === "zh-tw" && c.nameZh ? c.nameZh : c.nameEn;
            return (
              <Link
                key={c.slug}
                href={pathForLocale(`/company/${c.slug}`, locale)}
                className="group flex flex-col rounded-2xl border border-dark/10 bg-white p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-bold tracking-[-0.01em] text-dark group-hover:text-primary font-[family-name:var(--font-heading)]">
                    {name}
                  </h2>
                  <span className="shrink-0 rounded-md bg-dark/[0.04] px-2 py-1 text-[11px] font-semibold text-dark/55">
                    {c.market}:{c.ticker}
                  </span>
                </div>
                {c.sector && (
                  <p className="mt-1 text-xs uppercase tracking-wide text-accent">
                    {c.sector}
                  </p>
                )}
                {c.summaryEn && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-dark/60">
                    {c.summaryEn}
                  </p>
                )}
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100 font-[family-name:var(--font-heading)]">
                  {t("view")}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
