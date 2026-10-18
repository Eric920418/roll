import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import HomeV10 from "@/components/home/HomeV10";
import { SITE_URL, absoluteUrl } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

// 一小時 ISR 兜底；後台編輯仍透過 tag/path 立即失效。
export const revalidate = 3600;

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
  const ogImage = `${SITE_URL}${l === "en" ? "" : `/${l}`}/og?title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent("Taiwan & Asia Expansion Partner")}`;

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

  return <HomeV10 locale={l} />;
}
