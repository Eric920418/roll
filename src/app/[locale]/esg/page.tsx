import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = locale as Locale;
  // 標題／描述改由 CMS「文案翻譯 → ESG」管理（後台可編）
  const t = await getTranslations({ locale, namespace: "ESG" });
  const m = { title: t("metaTitle"), description: t("metaDescription") };
  const url = absoluteUrl("/esg", l);
  const ogImage = `${SITE_URL}${l === "en" ? "" : `/${l}`}/og?title=${encodeURIComponent(m.title)}&subtitle=${encodeURIComponent(m.description.slice(0, 120))}&eyebrow=${encodeURIComponent("ESG")}`;

  return {
    // absolute：避免 root layout 的「%s | ROLL ON.」模板造成品牌後綴重複
    title: { absolute: m.title },
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
      images: [{ url: ogImage, width: 1200, height: 630, alt: m.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: m.title,
      description: m.description,
      images: [ogImage],
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
