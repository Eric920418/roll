import { activeBillingCatalog, tokenQuote } from "@/lib/billing/commerce";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import s from "@/components/sections/product/landing.module.css";
import Footer from "@/components/layout/Footer";
import ProductNav from "@/components/sections/product/ProductNav";
import NovaLanding from "@/components/sections/product/NovaLanding";
import Pricing from "@/components/sections/product/Pricing";
import { SITE_URL, absoluteUrl, pathForLocale } from "@/lib/routes";
import { logSecurityError, publicErrorMessage } from "@/lib/security/log";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";
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
  const language = locale as Locale;
  const zh = language === "zh-tw";
  const pricing = await Promise.all([activeBillingCatalog(), tokenQuote()])
    .then(([prices, tokens]) => <Pricing prices={prices.catalog} tokenPricing={tokens} />)
    .catch((error: unknown) => {
      const reference = logSecurityError("nova.public.pricing", error);
      return (
        <section id="pricing" className="mx-auto max-w-[1312px] scroll-mt-24 px-6 py-16" aria-labelledby="pricing-heading">
          <h2 id="pricing-heading" className="text-3xl font-semibold">{zh ? "方案價格" : "Pricing"}</h2>
          <div role="alert" className="mt-4 space-y-2">
            <p>{zh ? "方案價格暫時無法載入。" : "Plan prices are temporarily unavailable."}</p>
            <p className="text-sm">{publicErrorMessage(reference)}</p>
          </div>
          <form method="get" action={`${pathForLocale("/product", language)}#pricing`}>
            <button type="submit" className="mt-3 min-h-11 cursor-pointer underline">
              {zh ? "重新載入價格" : "Reload prices"}
            </button>
          </form>
        </section>
      );
    });

  return (
    <main className={`nova-theme ${s.square}`} data-brand="nova">
      <ProductNav />
      <NovaLanding locale={language} pricing={pricing} />
      <Footer brand="nova" />
    </main>
  );
}
