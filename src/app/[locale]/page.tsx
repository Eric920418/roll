import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
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
// import FaqList from "@/components/content/FaqList"; // FAQ 視覺區塊暫時隱藏
import { faqSchema, SITE_FAQS } from "@/lib/schema";
import { SITE_URL, absoluteUrl } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

// ISR 兜底：即使主動失效未觸發，最多 60 秒後內容自動更新
export const revalidate = 60;

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = locale as Locale;
  // 標題／描述改由 CMS「文案翻譯 → Metadata」管理（後台可編）
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const title = t("title");
  const description = t("description");
  const url = absoluteUrl("", l);
  const ogImage = `${SITE_URL}${l === "en" ? "" : `/${l}`}/og?title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent("Taiwan & Asia Market Entry Consulting")}`;

  return {
    // absolute：不套用 root layout 的「%s | ROLL ON.」模板，避免品牌後綴重複
    title: { absolute: title },
    description,
    alternates: {
      canonical: url,
      languages: {
        en: SITE_URL,
        "zh-TW": `${SITE_URL}/zh-tw`,
      },
    },
    openGraph: {
      title,
      description,
      url,
      locale: l === "zh-tw" ? "zh_TW" : "en",
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  const l = locale as Locale;
  setRequestLocale(locale);

  const faqs = SITE_FAQS[l] ?? SITE_FAQS.en;
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return (
    <main>
      {/* SEO h1 — 視覺隱藏但 SSR 進 DOM 供搜尋引擎與 AI 爬蟲讀取（首屏視覺由 RollMap 提供品牌印象，不需可見大標題） */}
      <h1 className="sr-only">{t("h1")}</h1>
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
      {/* FAQ 視覺區塊暫時隱藏；JSON-LD schema 保留供搜尋引擎抓 FAQPage rich result */}
      {/*
      <section
        aria-labelledby="faq-heading"
        className="bg-white py-20 px-5 md:px-8"
      >
        <div className="max-w-3xl mx-auto">
          <FaqList faqs={faqs} locale={l} />
        </div>
      </section>
      */}
      <Footer />
    </main>
  );
}
