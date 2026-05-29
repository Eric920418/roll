import Link from "next/link";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";
import { getInsightTeasers } from "@/lib/cms/content";
import { pick } from "@/lib/cms/i18n";

// 區塊標題與 CTA 標籤（短標籤，維持雙語內嵌）
const LABELS: Record<Locale, { sectionTitle: string; ctaAll: string }> = {
  en: { sectionTitle: "Insights", ctaAll: "Read →" },
  "zh-tw": { sectionTitle: "深度指南", ctaAll: "閱讀全文 →" },
};

export default async function InsightsTeaser({ locale }: { locale: Locale }) {
  const labels = LABELS[locale] ?? LABELS.en;
  const cards = await getInsightTeasers();

  return (
    <section
      aria-labelledby="home-insights-heading"
      className="bg-white py-20 px-5 md:px-8"
    >
      <div className="max-w-5xl mx-auto">
        <h2
          id="home-insights-heading"
          className="text-3xl md:text-5xl font-bold text-dark mb-10 font-[family-name:var(--font-heading)]"
        >
          {labels.sectionTitle}
        </h2>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card) => {
            const href = pathForLocale(`/insights/${card.slug}`, locale);
            return (
              <li key={card.id}>
                <Link
                  href={href}
                  className="block h-full rounded-lg border border-dark/10 p-6 transition-colors hover:border-primary hover:bg-primary/[0.03]"
                >
                  <h3 className="text-lg md:text-xl font-semibold text-dark mb-3 font-[family-name:var(--font-heading)]">
                    {pick(card.title, locale)}
                  </h3>
                  <p className="text-sm text-dark/70 leading-relaxed mb-4 font-[family-name:var(--font-chinese)]">
                    {pick(card.blurb, locale)}
                  </p>
                  <span className="text-sm font-semibold text-primary">
                    {labels.ctaAll}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
