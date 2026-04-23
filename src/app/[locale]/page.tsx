import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import RollMap from "@/components/sections/RollMap";
import TaiwanMap from "@/components/sections/TaiwanMap";
import Services from "@/components/sections/Services";
import Work from "@/components/sections/Work";
import Clients from "@/components/sections/Clients";
import GoldenTicket from "@/components/sections/GoldenTicket";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import InsightsTeaser from "@/components/sections/InsightsTeaser";
import FaqList from "@/components/content/FaqList";
import JsonLd from "@/components/content/JsonLd";
import { faqSchema, SITE_FAQS } from "@/lib/schema";
import { SITE_URL, absoluteUrl } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }>;
};

const HOME_META: Record<Locale, { title: string; description: string }> = {
  en: {
    title:
      "Taiwan & Asia Market Entry Consulting for Foreign Companies | ROLL ON.",
    description:
      "ROLL ON. is the Taipei-based consulting firm helping foreign companies enter Taiwan and scale across Asia — fundraising, company setup, legal compliance, marketing, distribution, and investor access.",
  },
  "zh-tw": {
    title: "外商進入台灣與亞洲市場的顧問公司｜ROLL ON.",
    description:
      "ROLL ON. 協助外商進入台灣與亞洲市場：募資、公司設立、法規合規、精準行銷、通路開發、投資人對接。台北辦公室，服務全亞洲。",
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = locale as Locale;
  const meta = HOME_META[l] ?? HOME_META.en;
  const path = l === "en" ? "/" : "/";
  const url = absoluteUrl(path, l);

  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: url,
      languages: {
        en: `${SITE_URL}/`,
        "zh-TW": `${SITE_URL}/zh-tw`,
      },
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url,
      locale: l === "zh-tw" ? "zh_TW" : "en",
      type: "website",
    },
    twitter: {
      title: meta.title,
      description: meta.description,
    },
  };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  const l = locale as Locale;
  setRequestLocale(locale);

  const faqs = SITE_FAQS[l] ?? SITE_FAQS.en;

  return (
    <main>
      <JsonLd data={faqSchema(faqs)} />
      <Navbar />
      <RollMap />
      <TaiwanMap />
      <Services />
      <Work />
      <Clients />
      <GoldenTicket />
      {/* <InsightsTeaser locale={l} />
      <section
        aria-labelledby="home-faq-heading"
        className="bg-white py-20 px-5 md:px-8"
      >
        <div className="max-w-3xl mx-auto">
          <FaqList faqs={faqs} locale={l} />
        </div>
      </section> */}
      <Footer />
    </main>
  );
}
