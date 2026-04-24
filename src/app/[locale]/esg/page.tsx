import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import EsgHero from "@/components/sections/esg/Hero";
import RollingForward from "@/components/sections/esg/RollingForward";
import Sustainability from "@/components/sections/esg/Sustainability";
import StrategicImpact from "@/components/sections/esg/StrategicImpact";
import CoreBelief from "@/components/sections/esg/CoreBelief";
import JoinCTA from "@/components/sections/esg/JoinCTA";
import { SITE_URL, absoluteUrl } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

const META: Record<Locale, { title: string; description: string }> = {
  en: {
    title: "ESG & Strategic Impact | ROLL ON.",
    description:
      "ROLL ON views ESG as a vehicle for economic empowerment, talent elevation, and global connectivity — positioning Taiwan as Asia's entry point for foreign companies.",
  },
  "zh-tw": {
    title: "ESG 與戰略影響｜ROLL ON.",
    description:
      "ROLL ON 視 ESG 為經濟賦權、人才提升與全球連結的載體——讓台灣成為外商進入亞洲的第一站。",
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = locale as Locale;
  const m = META[l] ?? META.en;
  const url = absoluteUrl("/esg", l);

  return {
    title: m.title,
    description: m.description,
    alternates: {
      canonical: url,
      languages: {
        en: `${SITE_URL}/esg`,
        "zh-TW": `${SITE_URL}/zh-tw/esg`,
      },
    },
    openGraph: {
      title: m.title,
      description: m.description,
      url,
      locale: l === "zh-tw" ? "zh_TW" : "en",
      type: "website",
    },
    twitter: {
      title: m.title,
      description: m.description,
    },
  };
}

export default async function EsgPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main>
      <Navbar />
      <EsgHero />
      <RollingForward />
      <Sustainability />
      <StrategicImpact />
      <CoreBelief />
      <JoinCTA />
      <Footer />
    </main>
  );
}
