import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import Footer from "@/components/layout/Footer";
import ProductNav from "@/components/sections/product/ProductNav";
import ProductHero from "@/components/sections/product/ProductHero";
import HowItWorks from "@/components/sections/product/HowItWorks";
import Pricing from "@/components/sections/product/Pricing";
import ProductCTA from "@/components/sections/product/ProductCTA";
import { SITE_URL, absoluteUrl } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = locale as Locale;
  // 標題／描述同 Home / ESG，改由 CMS「文案翻譯 → Product」管理（後台可編）
  const t = await getTranslations({ locale, namespace: "Product" });
  const m = { title: t("metaTitle"), description: t("metaDescription") };
  const url = absoluteUrl("/product", l);
  const ogImage = `${SITE_URL}${l === "en" ? "" : `/${l}`}/og?brand=nova&title=${encodeURIComponent(m.title)}&subtitle=${encodeURIComponent(m.description.slice(0, 120))}&eyebrow=${encodeURIComponent("NOVA by ROLL ON")}`;

  return {
    // absolute：避免 root layout 的「%s | ROLL ON.」模板造成品牌後綴重複
    title: { absolute: m.title },
    description: m.description,
    alternates: {
      canonical: url,
      languages: {
        en: `${SITE_URL}/product`,
        "zh-TW": `${SITE_URL}/zh-tw/product`,
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

export default async function ProductPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="nova-theme" data-brand="nova">
      <ProductNav />
      <ProductHero />
      <HowItWorks />
      <Pricing />
      <ProductCTA />
      <Footer brand="nova" />
    </main>
  );
}
