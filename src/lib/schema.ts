import type { Locale } from "@/i18n/routing";
import type { Faq } from "./mdx";
import { SITE_URL, absoluteUrl } from "./routes";

export type BreadcrumbItem = { name: string; path: string };

export function breadcrumbSchema(items: BreadcrumbItem[], locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path, locale),
    })),
  };
}

export function faqSchema(faqs: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export type ArticleInput = {
  title: string;
  description: string;
  path: string;
  locale: Locale;
  publishedAt: string;
  updatedAt: string;
  author: string;
  image?: string;
  keywords?: string[];
};

export function articleSchema(input: ArticleInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    url: absoluteUrl(input.path, input.locale),
    datePublished: input.publishedAt,
    dateModified: input.updatedAt,
    author: { "@type": "Organization", name: input.author },
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: input.locale === "zh-tw" ? "zh-TW" : "en",
    image: input.image ?? `${SITE_URL}/horizontal.png`,
    keywords: input.keywords,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": absoluteUrl(input.path, input.locale),
    },
  };
}

export type ServiceSchemaInput = {
  name: string;
  description: string;
  path: string;
  locale: Locale;
  serviceType: string;
};

export function serviceSchema(input: ServiceSchemaInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path, input.locale),
    serviceType: input.serviceType,
    provider: { "@id": `${SITE_URL}/#organization` },
    areaServed: [
      { "@type": "Country", name: "Taiwan" },
      { "@type": "Continent", name: "Asia" },
    ],
    availableLanguage: ["English", "Chinese"],
  };
}

export function localBusinessSchema(locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${SITE_URL}/#localbusiness`,
    name: "ROLL ON. LTD",
    image: `${SITE_URL}/horizontal.png`,
    url: SITE_URL,
    telephone: "+886-980-371-946",
    email: "Vivian.lee@roll-grp.com",
    priceRange: "$$$",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Level 34, Taipei Nanshan Plaza, No. 100 Songren Road",
      addressLocality: "Xinyi District",
      addressRegion: "Taipei",
      postalCode: "110",
      addressCountry: "TW",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 25.0338,
      longitude: 121.5645,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "09:30",
        closes: "18:30",
      },
    ],
    sameAs: [
      "https://www.instagram.com/rollon.tw/",
      "https://www.linkedin.com/company/rollon/",
      "https://www.youtube.com/@GOLDENTICKET-rollon",
    ],
    inLanguage: locale === "zh-tw" ? "zh-TW" : "en",
  };
}

// 全站層 FAQ (供 home + layout 用)
export const SITE_FAQS: Record<Locale, Faq[]> = {
  en: [
    {
      q: "What does ROLL ON. do?",
      a: "ROLL ON. is a Taipei-based consulting firm that helps foreign companies enter the Taiwan and broader Asian markets. Core services: fundraising (angel to IPO), market entry strategy, company setup & legal compliance, marketing, sales channel development, and investor access.",
    },
    {
      q: "Which markets does ROLL ON. cover?",
      a: "Primary market: Taiwan. Expansion capabilities: Japan, Korea, China, Singapore, Vietnam, Cambodia, Thailand, and the wider Southeast Asia region.",
    },
    {
      q: "Do you serve Japanese companies entering Taiwan?",
      a: "Yes. Japan is one of our largest client segments. We support Japanese corporates and startups on legal entity setup, local hiring, distribution, and bilingual go-to-market execution. See /from/japan for details.",
    },
    {
      q: "Do you serve Korean companies entering Taiwan?",
      a: "Yes. We help Korean startups and conglomerates navigate Taiwan regulation, source local partnerships, and fundraise from Taiwanese VCs. See /from/korea for details.",
    },
    {
      q: "How long does it take to set up a foreign-invested company in Taiwan?",
      a: "Typical timeline is 6–10 weeks from Foreign Investment Approval (FIA) filing to bank account opening, depending on entity type (branch vs. subsidiary) and industry-specific licensing.",
    },
    {
      q: "What's the minimum engagement with ROLL ON.?",
      a: "We scope every project to the client's stage. Minimum engagements start at a market entry diagnostic (4–6 weeks); full go-to-market programs run 6–12 months.",
    },
    {
      q: "Do you help with work permits and visas for foreign founders?",
      a: "Yes. Legal compliance includes work permit filings (Employment Gold Card, Entrepreneur Visa) coordinated with our partner attorneys.",
    },
    {
      q: "Where is ROLL ON. located?",
      a: "Level 34, Taipei Nanshan Plaza, No. 100 Songren Road, Xinyi District, Taipei 110, Taiwan. Contact: Vivian.lee@roll-grp.com, +886-980-371-946.",
    },
    {
      q: "Does ROLL ON. help with fundraising?",
      a: "Yes. We support founders from angel round to IPO, with direct access to Taiwanese and Asia-Pacific investors through our Investor Access network.",
    },
    {
      q: "What is All Nighter Community?",
      a: "All Nighter Community is ROLL ON.'s invite-only network connecting foreign entrepreneurs with investors and operators in Taiwan.",
    },
    {
      q: "Does ROLL ON. work with companies outside tech?",
      a: "Yes. While we have strong exposure to semiconductor and medical CDMO, our clients span consumer, fintech, logistics, healthtech, and industrial sectors.",
    },
  ],
  "zh-tw": [
    {
      q: "ROLL ON. 提供哪些服務？",
      a: "ROLL ON. 是一間設址於台北的顧問公司，協助外商進入台灣與亞洲市場。核心服務包含：募資（天使輪到 IPO）、市場進入策略、公司設立與法規合規、精準行銷與品牌定位、銷售通路開發，以及投資人對接（Investor Access）。",
    },
    {
      q: "ROLL ON. 服務哪些市場？",
      a: "主力市場為台灣；拓展能力涵蓋日本、韓國、中國、新加坡、越南、柬埔寨、泰國等東南亞與東亞主要市場。",
    },
    {
      q: "有協助日商進入台灣嗎？",
      a: "有。日商是我們重要的客戶群之一，服務包含法人設立、在地招募、通路建置、雙語行銷落地。詳見 /from/japan。",
    },
    {
      q: "有協助韓商進入台灣嗎？",
      a: "有。協助韓國新創與大型企業處理台灣法規、尋找在地夥伴，並對接台灣創投資金。詳見 /from/korea。",
    },
    {
      q: "外商在台灣設立公司需要多久？",
      a: "典型時程為 6–10 週（從外國人投資申請 FIA 送件到銀行開戶），實際時間依法人型態（分公司 vs 子公司）與行業特許執照而定。",
    },
    {
      q: "最小合作規模是多少？",
      a: "依客戶階段量身訂製。最小起案為市場進入診斷（4–6 週）；完整 go-to-market 專案通常執行 6–12 個月。",
    },
    {
      q: "有協助外籍創辦人辦工作證／簽證嗎？",
      a: "有。法規服務涵蓋就業金卡、創業家簽證等工作許可申請，並由合作律師事務所協同辦理。",
    },
    {
      q: "ROLL ON. 辦公室在哪裡？",
      a: "110 台北市信義區松仁路 100 號 34 樓（台北南山廣場）。聯絡：Vivian.lee@roll-grp.com、+886-980-371-946。",
    },
    {
      q: "ROLL ON. 有協助募資嗎？",
      a: "有。我們陪創辦人從天使輪走到 IPO，並透過 Investor Access 網絡直接對接台灣與亞太投資人。",
    },
    {
      q: "什麼是 All Nighter Community？",
      a: "All Nighter Community 是 ROLL ON. 經營的邀請制社群，串連在台外商創業者、投資人與營運人才。",
    },
    {
      q: "ROLL ON. 只服務科技業嗎？",
      a: "不是。雖然在半導體與醫療 CDMO 領域特別強，我們的客戶橫跨消費、金融科技、物流、健康科技、工業等多元產業。",
    },
  ],
};
