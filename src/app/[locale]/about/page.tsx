import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AboutHero from "@/components/sections/about/Hero";
import AboutPhilosophy from "@/components/sections/about/Philosophy";
import AboutRollUpSpirit from "@/components/sections/about/RollUpSpirit";
import AboutCoreEquation from "@/components/sections/about/CoreEquation";
import AboutPrinciples from "@/components/sections/about/Principles";
import AboutClosingCTA from "@/components/sections/about/ClosingCTA";
import { SITE_URL, absoluteUrl } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "AboutPage" });
  const url = absoluteUrl("/about", l);

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      canonical: url,
      languages: {
        en: `${SITE_URL}/about`,
        "zh-TW": `${SITE_URL}/zh-tw/about`,
      },
    },
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      url,
      locale: l === "zh-tw" ? "zh_TW" : "en",
      type: "website",
    },
    twitter: {
      title: t("metaTitle"),
      description: t("metaDescription"),
    },
  };
}

export default async function AboutPageRoute({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="bg-cream">
      <Navbar />
      <AboutHero />
      <AboutPhilosophy />
      <AboutRollUpSpirit />
      <AboutCoreEquation />
      <AboutPrinciples />
      <AboutClosingCTA />
      <Footer />
    </main>
  );
}
