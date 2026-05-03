import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Noto_Sans_TC, Archivo_Black } from "next/font/google";
import { SITE_URL } from "@/lib/routes";
import { localBusinessSchema } from "@/lib/schema";
import RedDotCursor from "@/components/ui/RedDotCursor";
import "../globals.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });

  const url = locale === "en" ? SITE_URL : `${SITE_URL}/${locale}`;

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: url,
      languages: {
        "en": SITE_URL,
        "zh-TW": `${SITE_URL}/zh-tw`,
      },
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      url,
      locale: locale === "zh-tw" ? "zh_TW" : "en",
    },
    twitter: {
      title: t("title"),
      description: t("description"),
    },
  };
}

const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  variable: "--font-chinese",
  weight: ["400", "500", "700"],
  display: "swap",
});

// Archivo Black — 用於 About 頁的展示型粗體 wordmark（ROLL ON.）
const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  variable: "--font-display-archivo",
  weight: "400",
  display: "swap",
});

// Adobe Fonts (Typekit) — Hero New
const TYPEKIT_CSS_URL = "https://use.typekit.net/vvw0spn.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${notoSansTC.variable} ${archivoBlack.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        {/* Adobe Fonts (Typekit) — Hero New. React 19 hoists these to <head>.
            preload 必須在 stylesheet 之前才有意義（瀏覽器才會優先下載字型 CSS）。 */}
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="" />
        <link rel="dns-prefetch" href="https://p.typekit.net" />
        <link rel="preload" href={TYPEKIT_CSS_URL} as="style" crossOrigin="" />
        <link rel="stylesheet" href={TYPEKIT_CSS_URL} />
        {/* Organization + ProfessionalService 結構化資料 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://rollgrp.com/#organization",
                  name: "ROLL ON. LTD",
                  url: "https://rollgrp.com",
                  description:
                    locale === "zh-tw"
                      ? "ROLL ON. 協助外商進入台灣與亞洲市場，打破法規與文化的隔閡，讓台灣成為外商進入亞洲的首選橋樑。"
                      : "ROLL ON. helps foreign companies enter Taiwan and Asian markets, breaking through regulatory and cultural barriers.",
                  foundingLocation: {
                    "@type": "Place",
                    name: "Taipei, Taiwan",
                  },
                  areaServed: [
                    { "@type": "Country", name: "Taiwan" },
                    { "@type": "Continent", name: "Asia" },
                  ],
                  knowsAbout: [
                    "Taiwan market entry",
                    "Asia business expansion",
                    "Foreign company consulting",
                    "Cross-border fundraising",
                    "台灣市場進入策略",
                    "亞洲商業拓展",
                  ],
                },
                {
                  "@type": "ProfessionalService",
                  "@id": "https://rollgrp.com/#service",
                  name: "ROLL ON.",
                  provider: { "@id": "https://rollgrp.com/#organization" },
                  url: "https://rollgrp.com",
                  serviceType: [
                    "Market Entry Consulting",
                    "Fundraising Advisory",
                    "Marketing Strategy",
                    "Legal & Compliance Support",
                    "Sales Channel Development",
                    "Investor Access Network",
                  ],
                  areaServed: [
                    { "@type": "Country", name: "Taiwan" },
                    { "@type": "Country", name: "Japan" },
                    { "@type": "Country", name: "Vietnam" },
                    { "@type": "Country", name: "Cambodia" },
                  ],
                  availableLanguage: ["English", "Chinese"],
                },
                {
                  "@type": "WebSite",
                  "@id": "https://rollgrp.com/#website",
                  url: "https://rollgrp.com",
                  name: "ROLL ON.",
                  publisher: { "@id": "https://rollgrp.com/#organization" },
                  inLanguage: ["en", "zh-TW"],
                },
                localBusinessSchema(locale as Locale),
              ],
            }),
          }}
        />
        <NextIntlClientProvider messages={messages}>
          {children}
          <RedDotCursor />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
