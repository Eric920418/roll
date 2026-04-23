import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Space_Grotesk, Inter, Noto_Sans_TC } from "next/font/google";
import { SITE_URL } from "@/lib/routes";
import { localBusinessSchema } from "@/lib/schema";
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

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  variable: "--font-chinese",
  weight: ["400", "500", "700"],
  display: "swap",
});

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
      className={`${spaceGrotesk.variable} ${inter.variable} ${notoSansTC.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
