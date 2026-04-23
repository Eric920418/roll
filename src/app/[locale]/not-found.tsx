import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import {
  INSIGHT_SLUGS,
  SERVICE_SLUGS,
  pathForLocale,
} from "@/lib/routes";

const COPY: Record<Locale, {
  heading: string;
  lead: string;
  home: string;
  insights: string;
  services: string;
  serviceLabels: Record<string, string>;
  insightLabels: Record<string, string>;
}> = {
  en: {
    heading: "Page not found.",
    lead: "The page you're looking for doesn't exist. Here are a few places to try instead:",
    home: "Home",
    insights: "Insights",
    services: "Services",
    serviceLabels: {
      fundraising: "Fundraising",
      "market-entry": "Market Entry",
      marketing: "Marketing",
      legal: "Legal & Compliance",
      "sales-channel": "Sales Channel",
      "investor-access": "Investor Access",
    },
    insightLabels: {
      "taiwan-market-entry-guide": "Taiwan Market Entry Guide",
      "foreign-company-setup-taiwan": "Foreign Company Setup in Taiwan",
      "asia-expansion-from-taiwan": "Asia Expansion from Taiwan",
    },
  },
  "zh-tw": {
    heading: "找不到頁面。",
    lead: "你要找的頁面不存在。可以從這幾個方向找到想看的內容：",
    home: "首頁",
    insights: "深度指南",
    services: "服務項目",
    serviceLabels: {
      fundraising: "募資",
      "market-entry": "市場進入",
      marketing: "行銷",
      legal: "法規合規",
      "sales-channel": "通路開發",
      "investor-access": "投資人對接",
    },
    insightLabels: {
      "taiwan-market-entry-guide": "台灣市場進入完整指南",
      "foreign-company-setup-taiwan": "外商在台公司設立教學",
      "asia-expansion-from-taiwan": "從台灣拓展亞洲",
    },
  },
};

export default async function NotFound() {
  const localeValue = (await getLocale()) as Locale;
  const t = await getTranslations({ locale: localeValue });
  // t is used to force this to be a dynamic async read of locale context
  void t;
  const copy = COPY[localeValue] ?? COPY.en;

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6 py-20">
      <div className="max-w-3xl w-full">
        <p className="text-xs tracking-[0.22em] uppercase text-primary mb-6 font-[family-name:var(--font-heading)]">
          404
        </p>
        <h1 className="text-4xl md:text-6xl font-bold text-dark mb-6 font-[family-name:var(--font-heading)]">
          {copy.heading}
        </h1>
        <p className="text-base md:text-lg text-dark/70 mb-12 font-[family-name:var(--font-chinese)]">
          {copy.lead}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h2 className="text-xs tracking-[0.22em] uppercase text-dark/50 mb-4 font-[family-name:var(--font-heading)]">
              {copy.insights}
            </h2>
            <ul className="space-y-3">
              <li>
                <Link
                  href={pathForLocale("/", localeValue)}
                  className="text-dark hover:text-primary transition-colors"
                >
                  → {copy.home}
                </Link>
              </li>
              {INSIGHT_SLUGS.map((s) => (
                <li key={s}>
                  <Link
                    href={pathForLocale(`/insights/${s}`, localeValue)}
                    className="text-dark hover:text-primary transition-colors"
                  >
                    → {copy.insightLabels[s]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs tracking-[0.22em] uppercase text-dark/50 mb-4 font-[family-name:var(--font-heading)]">
              {copy.services}
            </h2>
            <ul className="space-y-3">
              {SERVICE_SLUGS.map((s) => (
                <li key={s}>
                  <Link
                    href={pathForLocale(`/services/${s}`, localeValue)}
                    className="text-dark hover:text-primary transition-colors"
                  >
                    → {copy.serviceLabels[s]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
