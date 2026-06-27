import type { Metadata } from "next";

const SITE_URL = "https://rollgrp.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og?title=${encodeURIComponent("ROLL ON.")}&subtitle=${encodeURIComponent("Taiwan & Asia Expansion Partner")}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ROLL ON. | From Visions to Big Impacts",
    template: "%s | ROLL ON.",
  },
  description:
    "ROLL ON. is a Taiwan-based market entry & expansion partner helping foreign companies enter Taiwan and Asian markets. Services: fundraising, market entry strategy, legal compliance, marketing, and investor access.",
  keywords: [
    "ROLL ON",
    "台灣市場進入",
    "外商顧問",
    "Asia market entry",
    "Taiwan consulting",
    "foreign company Taiwan",
    "海外拓展",
    "募資",
    "行銷策略",
    "enter Taiwan market",
    "Asia expansion",
    "台灣外商",
    "外商進入台灣",
    "cross-border consulting",
    "fundraising Taiwan",
    "startup Asia",
  ],
  authors: [{ name: "ROLL ON. LTD" }],
  creator: "ROLL ON. LTD",
  publisher: "ROLL ON. LTD",
  category: "Business Consulting",
  openGraph: {
    type: "website",
    locale: "en",
    alternateLocale: "zh-TW",
    url: SITE_URL,
    siteName: "ROLL ON Taiwan",
    title: "ROLL ON. | From Visions to Big Impacts",
    description:
      "ROLL ON. is a Taiwan-based market entry & expansion partner helping foreign companies enter Taiwan and Asian markets. Services: fundraising, market entry strategy, legal compliance, marketing, and investor access.",
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "ROLL ON. — Taiwan & Asia Expansion Partner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ROLL ON. | From Visions to Big Impacts",
    description:
      "ROLL ON. is a Taiwan-based market entry & expansion partner helping foreign companies enter Taiwan and Asian markets. Services: fundraising, market entry strategy, legal compliance, marketing, and investor access.",
    images: [DEFAULT_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
    languages: {
      "en": SITE_URL,
      "zh-TW": `${SITE_URL}/zh-tw`,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
