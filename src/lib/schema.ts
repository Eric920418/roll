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

/**
 * SpeakableSpecification — 標記頁面中「適合語音播報」的區段
 * 提升 Google Assistant / Siri / Alexa 引用機率
 */
export function speakableSchema(cssSelectors: string[] = [".speakable", "h1", "h2"]) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: cssSelectors,
    },
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
  wordCount?: number;
  articleSection?: string;
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
    author: {
      "@type": "Organization",
      name: input.author,
      url: SITE_URL,
    },
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: input.locale === "zh-tw" ? "zh-TW" : "en",
    image: input.image ?? `${SITE_URL}/horizontal.png`,
    keywords: input.keywords,
    wordCount: input.wordCount,
    articleSection: input.articleSection,
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

/**
 * sameAs URL 清單
 * 缺少的（Crunchbase / 創辦人 LinkedIn / X / Facebook / Wikidata）暫不寫死，
 * 由使用者建立後填入。寫 fake URL 會讓 Google rich result validator 報錯。
 */
const SAME_AS_URLS = [
  "https://www.instagram.com/rollon.tw/",
  "https://www.linkedin.com/company/rollon/",
  "https://www.youtube.com/@GOLDENTICKET-rollon",
  // TODO[USER]: Crunchbase 公司頁建立後填入，例：
  //   "https://www.crunchbase.com/organization/roll-on-ltd",
  // TODO[USER]: 創辦人 Vivian Lee LinkedIn 個人帳號 URL
  // TODO[USER]: 公司 X / Twitter 帳號 URL（如有）
  // TODO[USER]: 公司 Facebook Page URL（如有）
  // TODO[USER]: Wikidata Q ID URL（長期目標）
];

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
    sameAs: SAME_AS_URLS,
    inLanguage: locale === "zh-tw" ? "zh-TW" : "en",
  };
}

// 全站層 FAQ (供 home + layout 用) — 雙語各 30 對
// 設計原則：把搜尋意圖長尾化 — 「在台設子公司還是分公司」「外資能否全資持股」「外匯管制」等
//          這些問題本身就是 Google 搜尋 query，FAQ schema 命中後直接出 rich result。
export const SITE_FAQS: Record<Locale, Faq[]> = {
  en: [
    {
      q: "What does ROLL ON. do?",
      a: "ROLL ON. is a Taipei-based market entry & expansion partner that helps foreign companies enter the Taiwan and broader Asian markets. Core services: fundraising (angel to IPO), market entry strategy, company setup & legal compliance, marketing, sales channel development, and investor access.",
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
    // Long-tail: 法人型態
    {
      q: "Should a foreign company in Taiwan set up a subsidiary or a branch?",
      a: "Subsidiary (子公司) suits full market activities, local hiring, and liability isolation; capital and governance overhead are higher. Branch (分公司) is faster and cheaper for revenue-generating activities but exposes the parent. Representative Office cannot generate revenue. We decide entity type based on revenue plan, hiring scale, and IP holding strategy.",
    },
    {
      q: "Can a foreign company own 100% of a Taiwan subsidiary?",
      a: "Yes — in most industries foreign investors can hold 100% equity. Restrictions apply in sectors like telecoms, broadcasting, certain logistics, and PRC-origin capital faces tighter rules. We screen for restricted-industry conflicts during the diagnostic.",
    },
    {
      q: "Does Taiwan have foreign exchange controls?",
      a: "Taiwan operates a managed-float currency regime with no general FX controls on commercial transactions, but capital remittances over USD 1M typically require central bank reporting. Cross-border profit repatriation, capital reduction, and shareholder loans have specific filing steps.",
    },
    {
      q: "Does the company representative or director have to be a Taiwanese national?",
      a: "No. Foreign nationals can serve as company representative, director, or supervisor. Some require work permit alignment if they also work in Taiwan; pure board members (non-resident) generally do not need a work permit but must comply with FIA disclosure.",
    },
    // Pricing & engagement
    {
      q: "How does ROLL ON. charge?",
      a: "We use three pricing models depending on engagement type: (1) fixed-scope diagnostic projects (4–6 weeks), (2) monthly retainer for ongoing go-to-market or legal compliance, (3) success fee on fundraising or large distribution wins. Specific numbers depend on scope — we share a fee proposal after a 30-minute discovery call.",
    },
    {
      q: "How is ROLL ON. different from a law firm or accounting firm?",
      a: "Law firms and accountants execute filings; they don't decide your entry strategy, hiring plan, or distribution play. ROLL ON. is the operating partner that designs and runs the program end-to-end, then coordinates with specialist firms for execution. Clients keep one decision-maker on the project, not five vendors.",
    },
    {
      q: "Can ROLL ON. help if I already have a Taiwan entity but it's not growing?",
      a: "Yes. About 30% of our engagements are revival cases — companies with a legal entity that's stuck on hiring, distribution, or product-market fit. We diagnose in 2–4 weeks and propose a tactical 90-day plan.",
    },
    // Taxes
    {
      q: "What are Taiwan's main taxes for a foreign-owned company?",
      a: "Profit-seeking enterprise income tax 20% on net income (with 5% surtax on undistributed earnings); business tax (VAT-equivalent) 5%; withholding tax 21% on dividends to non-resident shareholders (often reduced by treaty). Final structuring should go through a CPA — we coordinate with partner firms.",
    },
    {
      q: "Does Taiwan have a tax treaty with my country?",
      a: "Taiwan has bilateral tax agreements with 30+ jurisdictions including Japan, Singapore, UK, Canada, Australia, India, Vietnam, Thailand, and most EU countries. The US and Korea do not have a comprehensive treaty (as of 2025–2026), which affects withholding tax planning.",
    },
    // Visa / talent
    {
      q: "What's the fastest visa option for a foreign founder relocating to Taiwan?",
      a: "Employment Gold Card is the most flexible — combines work permit, resident visa, and re-entry permit. Eligibility runs through 8 categories (tech, economic, education, finance, etc.). Entrepreneur Visa suits founders who don't yet have local revenue.",
    },
    {
      q: "How much does it cost to hire a senior engineer in Taipei?",
      a: "As of 2025–2026, senior engineer (5–8 yr exp) market salary is roughly NT$1.6M–2.4M / year (~USD 50K–75K), plus statutory employer contributions ~15% on top. Cost of living is materially lower than Tokyo, Seoul, Singapore.",
    },
    {
      q: "Are there government incentives for foreign companies setting up in Taiwan?",
      a: "Yes. Programs include InvesTaiwan (Ministry of Economic Affairs) for capital expenditure incentives, Smart Machinery / Cybersecurity / 5G tax credits, Free Trade Zone benefits, and city-level R&D grants. Eligibility depends on industry and investment size.",
    },
    // Speed / process specifics
    {
      q: "How long does it take to open a corporate bank account in Taiwan?",
      a: "Realistic timeline: 2–6 weeks after FIA approval and company registration. KYC for foreign directors is the slowest gate; some banks require in-person visits. We pre-align documents to compress this to 2 weeks where possible.",
    },
    {
      q: "Can I run a Taiwan operation remotely from Japan / Korea / US?",
      a: "Technically yes for early stages, but distribution, hiring, and government filings require a local representative. We provide interim local-rep services for the first 6–12 months while founders evaluate full relocation.",
    },
    // Asia bridge
    {
      q: "Why use Taiwan as the entry point to Asia instead of Singapore?",
      a: "Taiwan offers lower setup cost, deeper tech talent (semiconductor, hardware, medical), proximity to Northeast Asia markets (Japan, Korea), and English-friendly business operations. Singapore is better for finance / commodities / regional HQ; Taiwan is better for tech ops, hardware, and pan-Asia GTM. Many of our clients use both.",
    },
    // ROLL ON. specifics
    {
      q: "Do you sign NDAs before discovery calls?",
      a: "Yes, on request. We default to a mutual NDA template covering market data, financials, and personnel discussions.",
    },
    {
      q: "Where can I see ROLL ON. case studies?",
      a: "Selected cases are public at /cases (e.g. Medix LLC — foreign medical client landing in Taiwan). Most engagements are confidential; we share anonymized references during scoping calls.",
    },
    {
      q: "Does ROLL ON. take equity instead of fees?",
      a: "Occasionally, in select early-stage engagements where ROLL ON. plays an operating-partner role. Equity arrangements are bilateral and require formal venture-builder terms — not a default option.",
    },
    {
      q: "Is ROLL ON. hiring?",
      a: "We periodically open roles in market entry strategy, business development, and program management. Inquiries: Vivian.lee@roll-grp.com.",
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
    // 法人型態
    {
      q: "外商在台灣應該設子公司還是分公司？",
      a: "子公司（subsidiary）適合完整商業活動、在地招募與責任隔離，資本與治理成本較高；分公司（branch）設立較快、成本較低但母公司直接承擔責任；辦事處（representative office）不能產生營收。我們依據營收計畫、招募規模與 IP 持有策略選擇法人型態。",
    },
    {
      q: "外資可以全資（100%）持有台灣公司嗎？",
      a: "大部分產業可以。電信、廣播、特定物流業有持股限制，陸資（PRC-origin capital）規範更嚴。診斷階段會先篩查行業限制。",
    },
    {
      q: "台灣有外匯管制嗎？",
      a: "台幣採管理浮動匯率制，商業交易沒有一般性外匯管制。單筆超過 100 萬美元的資本匯出入須向央行申報。跨境利潤匯回、減資、股東貸款各有特定程序。",
    },
    {
      q: "公司負責人或董事一定要是台灣人嗎？",
      a: "不需要。外籍人士可擔任公司負責人、董事或監察人。若同時在台工作須對應工作許可；單純董事（非居民）通常不需工作證，但須依 FIA 規範揭露。",
    },
    // 收費 / 合作
    {
      q: "ROLL ON. 怎麼收費？",
      a: "依案型有三種收費結構：(1) 固定範圍診斷專案（4–6 週），(2) 長期顧問 / 法規合規月費，(3) 募資或大型通路成果分潤。具體金額依範圍而定，30 分鐘初談後提供報價。",
    },
    {
      q: "ROLL ON. 跟律師事務所、會計師事務所差在哪？",
      a: "律師與會計師執行特定文件 / 申報；他們不決定你的進入策略、招募計畫或通路打法。ROLL ON. 是負責設計與執行整段 go-to-market 的營運夥伴，再協調專業事務所執行細節。客戶只需面對一位決策窗口，不用同時管 5 個外部夥伴。",
    },
    {
      q: "已經有台灣法人但成長卡關，ROLL ON. 能協助嗎？",
      a: "可以。約 30% 的客戶屬於「重啟案」— 已有法人但卡在招募、通路或 PMF。我們用 2–4 週診斷後提出 90 天戰術計畫。",
    },
    // 稅務
    {
      q: "外資台灣公司主要繳哪些稅？",
      a: "營利事業所得稅 20%（未分配盈餘加徵 5%）；營業稅（加值型）5%；非居民股東股利扣繳 21%（依租稅協定可降）。完整結構規劃由合作會計師處理。",
    },
    {
      q: "台灣與我的母國有租稅協定嗎？",
      a: "台灣與 30+ 個地區有租稅協定，包括日本、新加坡、英國、加拿大、澳洲、印度、越南、泰國及多數歐盟國家。美國與韓國目前（2025–2026）沒有完整協定，影響股利扣繳規劃。",
    },
    // 簽證 / 人才
    {
      q: "外籍創辦人到台灣最快的簽證是哪一種？",
      a: "就業金卡最彈性 — 整合工作許可、居留簽證、重入境許可。資格分 8 大類（科技、經濟、教育、金融等）。創業家簽證適合尚無在地營收的創辦人。",
    },
    {
      q: "台北資深工程師年薪行情？",
      a: "2025–2026 行情，資深工程師（5–8 年經驗）年薪約 NT$1.6M–2.4M（約 USD 50K–75K），加上雇主負擔約 15% 的社保提撥。生活成本明顯低於東京、首爾、新加坡。",
    },
    {
      q: "外商在台灣設立公司有政府獎勵措施嗎？",
      a: "有。包括 InvesTaiwan（經濟部投資台灣方案）的資本支出獎勵、智慧機械 / 資安 / 5G 投資抵減、自由貿易港區優惠、地方政府研發補助。資格依產業與投資規模而定。",
    },
    // 速度 / 程序
    {
      q: "在台灣開公司銀行帳戶要多久？",
      a: "實際時程：FIA 核准與公司登記後 2–6 週。外籍董事 KYC 是最大瓶頸，部分銀行需親臨。我們會預先對齊文件壓縮到 2 週左右。",
    },
    {
      q: "可以從日本／韓國／美國遠距經營台灣業務嗎？",
      a: "早期技術上可行，但通路、招募、政府申報需要在地代表人。我們提供前 6–12 個月過渡性的在地代表服務，創辦人再評估正式遷移。",
    },
    {
      q: "為什麼用台灣而非新加坡作為亞洲進入點？",
      a: "台灣設立成本較低、科技人才（半導體、硬體、醫療）較深、緊鄰日韓市場、商務英文友善。新加坡適合金融 / 大宗商品 / 區域 HQ；台灣適合科技營運、硬體、泛亞洲 GTM。許多客戶兩邊都用。",
    },
    {
      q: "簽 NDA 後才開會嗎？",
      a: "客戶要求即簽。預設使用雙向 NDA 模板，涵蓋市場資料、財務、人才討論。",
    },
    {
      q: "ROLL ON. 案例在哪裡看？",
      a: "公開案例在 /cases（如 Medix LLC — 外籍醫療客戶落地台灣）。多數案件保密，scoping 階段提供匿名 reference。",
    },
    {
      q: "ROLL ON. 接受以股權取代顧問費嗎？",
      a: "少數情況下接受 — 在早期、ROLL ON. 擔任營運夥伴的案件。股權安排雙邊談、正式採用 venture-builder 條款，非預設選項。",
    },
    {
      q: "ROLL ON. 有在徵人嗎？",
      a: "定期開放市場進入策略、業務開發、專案管理職缺。應徵：Vivian.lee@roll-grp.com。",
    },
  ],
};
