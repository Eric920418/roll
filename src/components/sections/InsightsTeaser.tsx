import Link from "next/link";
import type { Locale } from "@/i18n/routing";
import { INSIGHT_SLUGS, pathForLocale } from "@/lib/routes";

type CardCopy = { title: string; blurb: string };
type LocaleCopy = {
  sectionTitle: string;
  ctaAll: string;
  cards: Record<(typeof INSIGHT_SLUGS)[number], CardCopy>;
};

const COPY: Record<Locale, LocaleCopy> = {
  en: {
    sectionTitle: "Insights",
    ctaAll: "Read →",
    cards: {
      "taiwan-market-entry-guide": {
        title: "Taiwan Market Entry Guide",
        blurb:
          "The complete pillar guide for foreign companies assessing Taiwan: entity options, timelines, regulation, and go-to-market playbooks.",
      },
      "foreign-company-setup-taiwan": {
        title: "Foreign Company Setup in Taiwan",
        blurb:
          "Step-by-step walkthrough — FIA filing, entity type, bank account, work permits, and realistic timelines.",
      },
      "asia-expansion-from-taiwan": {
        title: "Asia Expansion from Taiwan",
        blurb:
          "Why Taiwan is the highest-leverage bridge city for Asia rollout, and how to route from Taipei to Tokyo, Seoul, Singapore, HCMC, Bangkok.",
      },
    },
  },
  "zh-tw": {
    sectionTitle: "深度指南",
    ctaAll: "閱讀全文 →",
    cards: {
      "taiwan-market-entry-guide": {
        title: "台灣市場進入完整指南",
        blurb:
          "給評估進入台灣的外商：法人型態選擇、時程、法規、在地 go-to-market 方法論一次看完。",
      },
      "foreign-company-setup-taiwan": {
        title: "外商在台公司設立教學",
        blurb:
          "一步一步走：FIA 送件、法人型態、銀行開戶、工作證、實際時程。",
      },
      "asia-expansion-from-taiwan": {
        title: "從台灣拓展亞洲",
        blurb:
          "為什麼台灣是亞洲拓展槓桿最高的橋樑城市；從台北路由到東京、首爾、新加坡、胡志明、曼谷。",
      },
    },
  },
};

export default function InsightsTeaser({ locale }: { locale: Locale }) {
  const copy = COPY[locale] ?? COPY.en;

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
          {copy.sectionTitle}
        </h2>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {INSIGHT_SLUGS.map((slug) => {
            const card = copy.cards[slug];
            const href = pathForLocale(`/insights/${slug}`, locale);
            return (
              <li key={slug}>
                <Link
                  href={href}
                  className="block h-full rounded-lg border border-dark/10 p-6 transition-colors hover:border-primary hover:bg-primary/[0.03]"
                >
                  <h3 className="text-lg md:text-xl font-semibold text-dark mb-3 font-[family-name:var(--font-heading)]">
                    {card.title}
                  </h3>
                  <p className="text-sm text-dark/70 leading-relaxed mb-4 font-[family-name:var(--font-chinese)]">
                    {card.blurb}
                  </p>
                  <span className="text-sm font-semibold text-primary">
                    {copy.ctaAll}
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
