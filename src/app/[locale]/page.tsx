import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import RollMap from "@/components/sections/RollMap";
import TaiwanMap from "@/components/sections/TaiwanMap";
import Services from "@/components/sections/Services";
import Work from "@/components/sections/Work";
import Events from "@/components/sections/Events";
import Clients from "@/components/sections/Clients";
import GoldenTicket from "@/components/sections/GoldenTicket";
import InsightsTeaser from "@/components/sections/InsightsTeaser";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import JsonLd from "@/components/content/JsonLd";
import FaqList from "@/components/content/FaqList";
import { faqSchema, SITE_FAQS } from "@/lib/schema";
import { SITE_URL, absoluteUrl } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }>;
};

const HOME_META: Record<Locale, { title: string; description: string; h1: string }> = {
  en: {
    title:
      "Taiwan & Asia Market Entry Consulting for Foreign Companies | ROLL ON.",
    description:
      "ROLL ON. is the Taipei-based consulting firm helping foreign companies enter Taiwan and scale across Asia — fundraising, company setup, legal compliance, marketing, distribution, and investor access.",
    h1: "ROLL ON. — Taiwan & Asia Market Entry Consulting for Foreign Companies",
  },
  "zh-tw": {
    title: "外商進入台灣與亞洲市場的拓展夥伴｜ROLL ON.",
    description:
      "ROLL ON. 協助外商進入台灣與亞洲市場：募資、公司設立、法規合規、精準行銷、通路開發、投資人對接。台北辦公室，服務全亞洲。",
    h1: "ROLL ON. — 外商進入台灣與亞洲市場的拓展夥伴",
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = locale as Locale;
  const meta = HOME_META[l] ?? HOME_META.en;
  const url = absoluteUrl("", l);
  const ogImage = `${SITE_URL}${l === "en" ? "" : `/${l}`}/og?title=${encodeURIComponent(meta.title)}&subtitle=${encodeURIComponent("Taiwan & Asia Market Entry Consulting")}`;

  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: url,
      languages: {
        en: SITE_URL,
        "zh-TW": `${SITE_URL}/zh-tw`,
      },
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url,
      locale: l === "zh-tw" ? "zh_TW" : "en",
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: meta.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [ogImage],
    },
  };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  const l = locale as Locale;
  setRequestLocale(locale);

  const faqs = SITE_FAQS[l] ?? SITE_FAQS.en;
  const meta = HOME_META[l] ?? HOME_META.en;

  return (
    <main>
      {/* SEO h1 — 視覺隱藏但 SSR 進 DOM 供搜尋引擎與 AI 爬蟲讀取（首屏視覺由 RollMap 提供品牌印象，不需可見大標題） */}
      <h1 className="sr-only">{meta.h1}</h1>
      <JsonLd data={faqSchema(faqs)} />
      <Navbar />
      <RollMap />
      <TaiwanMap />
      <Services />
      <Work />
      <Events />
      <Clients />
      <GoldenTicket />
      <InsightsTeaser locale={l} />
      <section
        aria-labelledby="faq-heading"
        className="bg-white py-20 px-5 md:px-8"
      >
        <div className="max-w-3xl mx-auto">
          <FaqList faqs={faqs} locale={l} />
        </div>
      </section>
      <Footer />
    </main>
  );
}
