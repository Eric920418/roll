# ROLL ON. 企業官網

協助外商進入台灣與亞洲市場的顧問公司官網。

## 技術棧

- **Next.js 16** (App Router)
- **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Motion** (framer-motion) — 頁面動畫
- **GSAP + ScrollTrigger** — 滾動驅動動畫
- **next-intl** — 雙語 i18n（`en` 預設、`zh-tw`）
- **next-mdx-remote** — 內容頁 MDX 渲染
- **字型**：**Hero New** (Adobe Fonts / Typekit) + Noto Sans TC（中文 fallback）+ **Archivo Black**（About 頁 wordmark 展示字型，next/font/google）
- **zod** — MDX frontmatter 驗證（錯誤完整顯示）
- **pnpm** — 套件管理（禁止 npm / yarn）

## 開發

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # 生產建置
pnpm lint       # ESLint
```

### 效能 / 圖片工具

```bash
# 圖片優化（一次性、原檔自動備份到 public/_originals/，已 git ignored）
node scripts/optimize-images.mjs

# Bundle 分析（開啟 .next/diagnostics/analyze/index.html 查看 treemap）
ANALYZE=true pnpm build
```

## 專案結構

```
src/
├── app/
│   ├── [locale]/              # i18n 路由
│   │   ├── layout.tsx         # HTML 骨架 + JSON-LD @graph
│   │   ├── page.tsx           # 首頁（所有 section 組合）
│   │   ├── not-found.tsx      # 404
│   │   ├── og/route.tsx       # 動態 OG image (next/og)
│   │   ├── insights/[slug]/   # Pillar guides（搜尋意圖對齊）
│   │   ├── cases/[slug]/      # 案例研究
│   │   ├── services/[slug]/   # 服務子頁（6 項）
│   │   ├── from/[country]/    # 國別指南（6 國）Programmatic SEO
│   │   ├── about/             # About Us 品牌哲學頁（靜態）
│   │   └── esg/               # ESG 品牌敘事頁（靜態）
│   ├── sitemap.ts             # 動態 sitemap（含 hreflang）
│   ├── robots.ts              # 含 AI bot 白名單
│   └── layout.tsx             # Root metadata
│
├── components/
│   ├── layout/                # Navbar (client), Footer (client)
│   ├── sections/              # RollMap, TaiwanMap, Work, Events 為 client；Services, Clients, GoldenTicket 為 server (RSC) + ScrollReveal client child；InsightsTeaser 目前未掛在首頁
│   │   ├── about/             # About 頁 sections — 全為 client（Hero / Philosophy / RollUpSpirit (GSAP + 打字機循環) / CoreEquation / Principles / ClosingCTA）
│   │   └── esg/               # ESG 頁 sections — 全為 client（直接用 motion variants）
│   ├── content/               # ContentPage, FaqList, JsonLd（內容頁共用）
│   └── ui/                    # ScrollReveal, CounterAnimation, LanguageSwitch（皆為 client）
│
├── lib/
│   ├── routes.ts              # 所有 slug 集中管理（sitemap / 內部連結共用 source of truth）
│   ├── schema.ts              # JSON-LD 產生器（breadcrumb / article / service / faq / localBusiness）
│   ├── mdx.ts                 # MDX 讀取 + zod frontmatter 驗證
│   ├── content-metadata.ts    # 內容頁 generateMetadata helper
│   ├── render-mdx.tsx         # MDXRemote 包裝（含 remark/rehype 設定）
│   └── gsap-register.ts       # GSAP 註冊
│
├── i18n/
│   ├── routing.ts             # locales, defaultLocale=en, Locale type
│   ├── navigation.ts          # next-intl createNavigation wrapper
│   └── request.ts             # messages loader
│
messages/                       # i18n 翻譯 (en.json, zh-tw.json)
content/                        # MDX 內容（可由非工程師 PR 編輯）
├── insights/                   # {slug}.{locale}.mdx
├── cases/
├── services/
└── from/
public/
├── llms.txt                    # LLM 索引（GEO）
├── google79de9d399ac35a4f.html # Google Search Console 驗證
└── ...                         # logos, case images, social icons
```

## 首頁 Sections（由 `src/app/[locale]/page.tsx` 組合）

1. **Navbar** — 固定導航；漢堡選單只保留 `About` 與 `ESG` 兩個獨立頁面入口（首頁回跳由左上 Logo 提供，避免重複）
2. **RollMap** — 滾動三頁：品牌 Hero → 全球 vs 台灣外商數量對比 → Forbes Global 2000 排名（含 ROLL ON 客戶）
   - 包含 `sr-only` SSR 純文字版本供 LLM / 螢幕閱讀器讀取（視覺化數據雙軌化）
3. **TaiwanMap** — 台灣地圖縮放 → 全球 + 6 座橋樑城市；5 行品牌宣言
4. **Services** — 6 項服務卡片，每張連到 `/services/[slug]` + Investor Access CTA
5. **Work** — 案例章節：`Medix LLC` 可展開/收合（`+` toggle + spring rotate），展開顯示 3 張圖 + 短描述 + `learn more` → `/cases/medix`；標題字元 stagger / 卡片 blur-to-focus + scale 進場
6. **Events** — R Event. 4 張活動卡（日期 pill + 圖片區 + 標題 + 地址），桌機 4 欄、平板 2x2；標題字元 stagger / 卡片 3D `rotateY` + blur + stagger，pill 獨立 spring pop
7. **Clients** — 6 家客戶 logo 牆（server component）
8. **GoldenTicket** — YouTube 頻道預覽（server component）
9. ~~**InsightsTeaser**~~ — 3 篇 pillar guides 入口（**目前未掛在 page.tsx**，預留下一波啟用）
10. **Footer** — 聯絡表單 + 社群

## 內容頁（SEO / GEO 主引擎）

總計 16 主題 × 2 語系 = **32 個可索引 URL**。每個主題綁一個搜尋意圖：

| 路由 | 主搜尋意圖 |
|---|---|
| `/about` | ROLL ON. brand philosophy（Roll On + Roll Up + Impact） |
| `/insights/taiwan-market-entry-guide` | Taiwan market entry consultant |
| `/insights/foreign-company-setup-taiwan` | how to set up a company in Taiwan foreign |
| `/insights/asia-expansion-from-taiwan` | Asia expansion from Taiwan bridge |
| `/cases/medix` | Medix Taiwan case study |
| `/services/{fundraising,market-entry,marketing,legal,sales-channel,investor-access}` | 各服務對應關鍵字 |
| `/from/{japan,korea,china,singapore,vietnam,thailand}` | "{國} company enter Taiwan" |

新增 / 編輯步驟：
1. 在 `src/lib/routes.ts` 新增 slug（會自動進 sitemap、generateStaticParams）
2. 在 `content/{type}/{slug}.{locale}.mdx` 撰寫內容，frontmatter 必填 `title, description, slug, targetQuery, publishedAt, updatedAt, type`，選填 `faqs, heroImage`
3. `pnpm dev` 驗證；frontmatter 錯誤會以完整 zod 錯誤訊息在前端丟出（符合專案規則）

## SEO / GEO 基礎設施

### Metadata
- **Google 搜尋顯示的網站名稱**：`ROLL ON Taiwan`（site name），由 `og:site_name` + WebSite schema `name` 決定；`alternateName: "ROLL ON."` 標註舊名稱以利平滑過渡。法人名稱 `ROLL ON. LTD` 仍保留在 `Organization` schema，不受影響
- `src/app/layout.tsx` — 全站 fallback metadata（OG / Twitter / canonical / keywords）
- `src/app/[locale]/layout.tsx` — locale-specific metadata + **完整 JSON-LD `@graph`**：Organization / ProfessionalService / WebSite / FAQPage（11 題，雙語） / LocalBusiness（地址、geo、營業時間、社群）
- `src/app/[locale]/page.tsx` — 首頁 `generateMetadata`，獨立針對 "Taiwan & Asia market entry consulting" 搜尋意圖
- 每個內容頁 — `generateMetadata` 讀 MDX frontmatter，產 title / description / canonical / hreflang / og:image（動態）
- 每個內容頁 — `BreadcrumbList` + `Article`/`Service` + `FAQPage` schema

### Sitemap & Robots
- `src/app/sitemap.ts` — 動態列出所有路由 × 2 語系 × hreflang alternates（含 `/about`、`/esg`）
- `src/app/robots.ts` — 允許所有爬蟲 + 明確白名單 AI bots：GPTBot / Google-Extended / PerplexityBot / ChatGPT-User / Applebot-Extended / anthropic-ai / CCBot

### GEO（LLM 爬取）
- `public/llms.txt` — 符合 llmstxt.org 規範的 LLM 可引用事實索引
- 所有關鍵事實 SSR 進 DOM（RollMap 數據有 `sr-only` 純文字版本）
- FAQ 使用 `<details>/<summary>` 原生元素，無 JS 也能展開
- 內部連結密度：每個內容頁最少 2-3 個指向其他頁的 contextual link

### OG Image
- `src/app/[locale]/og/route.tsx`（Edge runtime）— 動態產生 1200×630 OG 圖，支援 `?title=&subtitle=&eyebrow=`

## 動畫

- **GSAP + ScrollTrigger**：從 `src/lib/gsap-register.ts`（`"use client"`）統一註冊；所有使用 GSAP 的元件**從此檔 import**（避免重複註冊與 plugin 漏載）
- **Motion (framer-motion)**：非滾動驅動的進場動畫；統一使用 `motion/react` import（已 tree-shake 友善）
- **ScrollReveal pattern**：`src/components/ui/ScrollReveal.tsx` 是無狀態 client wrapper，作為「server parent → client child」的 RSC 模式入口；只用它做 fade/slide 進場的 section 都是 server component（Services / Clients / GoldenTicket）
- **打字機循環（About / RollUpSpirit）**：三排疊字以 `setTimeout` 鏈 + phase machine（`hold → delete → type`）在 `ROLL ON.` ⇄ `ROLL UP.` 之間反覆，第二、三排以 `lineDelayMs` 接力做出殘影瀑布；遵守 `prefers-reduced-motion`（停在 `ROLL ON.` 不動），並用 `aria-hidden` + `sr-only` wordmark 確保螢幕閱讀器不被字元變化干擾。時序常數標 `TODO[USER-TUNE]` 集中在元件頂端方便調味

## 圖片資產與效能

- 所有 `public/` 圖片必須是 **被引用的、合理尺寸（< 2000px 寬）、壓縮過**。任何透過 `<Image>` 載入的圖在 Next.js 自動再轉 AVIF/WebP（次世代格式由 `next.config.ts` 開啟）
- 新增大圖（特別是攝影 / 設計稿）後，跑 `node scripts/optimize-images.mjs`：
  - 原檔自動備份到 `public/_originals/`（已 git-ignore）
  - 大於 2000px 的圖會被縮到 2000px
  - PNG 用 sharp + palette 壓縮、JPG 用 mozjpeg quality 82
  - 已優化的圖再跑一次 idempotent（buf 比原檔小才覆蓋）
- 已知不該載入的「未引用素材」會被腳本印 warning，請手動移到 `public/_originals/unused/`
- 圖片元件統一用 `next/image`，禁止再用原生 `<img>`（除非有特殊 reason，例如非常小的 SVG inline）
- 字型：Typekit 在 `<body>` 用 `<link rel="preload" as="style">` 加速首屏字型解析（React 19 hoist 到 head）；Noto Sans TC + Archivo Black 用 `next/font/google` 自動子集化
- 設計 token（`src/app/globals.css` `@theme`）：
  - 顏色：`--color-primary` `#7B1A2C`、`--color-primary-light/dark`、`--color-accent` 暖金、`--color-cream` `#F4EFE7`（About 頁暖米白底）、`--color-dark` `--color-light`
  - 字型：`--font-heading`（Hero New）、`--font-body`、`--font-chinese`、`--font-display`（Archivo Black，僅 About 頁 wordmark 使用）

## SEO / GEO 內容狀態

### 內容深度（影響 Google 排名 + AI 引用）

| 路徑 | 雙語檔數 | 字數目標 | 狀態 |
|---|---|---|---|
| `content/insights/{taiwan-market-entry-guide, foreign-company-setup-taiwan, asia-expansion-from-taiwan}` | 6 | 2500–3500 字 / 篇 | 已從 [TODO] 補完 |
| `content/from/{japan, korea, china, singapore, vietnam, thailand}` | 12 | 1500–2500 字 / 篇 | 已從 [TODO] 補完 |
| `content/services/{fundraising, market-entry, marketing, legal, sales-channel, investor-access}` | 12 | 1200–1500 字 / 篇 | 已從 [TODO] 補完 |
| `content/cases/medix` | 2 | — | 待補 |

### ⚠️ VERIFY 標記規則（發布前必讀）

內容由 Claude 依公開資料（截至 2025–2026）補完。**法規 / 稅務 / 簽證 / FIA 流程 / 政府機關名稱 / 具體政府獎勵方案數字 / 服務定價**等時間敏感事實，在 MDX 內以下列 **JSX 註解**標出（MDX 不支援 HTML 註解）：

```jsx
{/* ⚠️ VERIFY: [需要校對的內容] */}
```

發布前必須由熟稔 ROLL ON. 業務的內部人員（如 Vivian）校對每個 ⚠️ VERIFY 段落。**未校對段落不應發布**，AI 模型若引用錯誤資訊，責任難以追回且傷品牌信任。

校對流程：
1. `grep -rn "⚠️ VERIFY" content/` 列出所有待校對段落（目前共 56 個 + medix.mdx 內 4 個原 [TODO: VERIFY]）
2. 對照 [InvesTaiwan](https://investtaiwan.nat.gov.tw)、[經濟部投資業務處](https://www.dois.moea.gov.tw/)、[國發會](https://www.ndc.gov.tw/) 等權威來源
3. 校對完移除 `⚠️ VERIFY` 註解（保留實際內容）
4. 內部 review 簽核

### ⚠️ VERIFY 清單彙整（依主題分類）

**A. 法規 / 主管機關 / 程序時程（13 處）**
- 投資審議主管機關名稱與 2025–2026 重組後的正式稱呼（投審會 / 投審處）— 出現於 4 個檔案
- FIA 標準審查工作日數 — 出現於 4 個檔案
- 經濟部商業司外資公司設立規費金額 — 2 個檔案
- 強制簽證財報的營收 / 資本門檻 — 2 個檔案
- 各國驗證費（consularization）典型範圍 — 2 個檔案

**B. 稅務 / 租稅協定扣繳率（12 處）**
- 分公司利潤匯回 vs 子公司股利扣繳差異 — 2 個檔案
- 智慧機械 / 資安 / 5G 投資抵減稅率與落日（2026）— 2 個檔案
- 台灣租稅協定清單與各協定具體 WHT 減免率 — 2 個檔案
- 台日協定股利/權利金/利息優惠扣繳稅率（2026）— 2 個檔案
- 台韓權利金與技術服務費扣繳稅率 + 反濫用立場 — 2 個檔案
- 台星 ASTEP 協定按所得類別的優惠率（2026）— 2 個檔案
- 台越 DTA 優惠稅率（常引用 15%）— 2 個檔案
- 台泰雙重課稅協定現況與優惠稅率（2026）— 2 個檔案

**C. 簽證 / 人才資料（4 處）**
- 創業家簽證資格門檻（資本額 / 募資階段 / 加速器計畫）— 2 個檔案
- 2026 新加坡資深工程師薪資 vs 灣區基準 — 2 個檔案

**D. 陸資（PRC capital）特殊規範（4 處）**
- Type 1/2/3 投資分類定義、門檻、程序細節 — 2 個檔案
- 投審會對陸資的正面表列／限制表列（2026）— 2 個檔案

**E. 行業限制（2 處）**
- MOEA Negative List 最新更新（外資限制行業）— 2 個檔案

**F. 服務定價（12 處）**— 全部在 `content/services/`
- 各服務的成功費%/月費級距/固定範圍診斷價格 — Vivian 直接填入即可
- 涵蓋：fundraising 成功費%、market-entry 診斷價+月費、marketing 月費、legal 設立價+月費、sales-channel 成功費、investor-access 成功費%

**G. 銀行 / 辦公室費率（5 處）**
- 各銀行外商業務部門能力（不公開具名推薦前需確認）— 2 個檔案
- 台北信義區 A 級辦公室年租金（2026）— 2 個檔案
- 新加坡 Raffles/MBFC A 級辦公室年租金（2026）— 2 個檔案
- 越南人在台人口（200K+ — 待 NIA 確認）— 1 個檔案

**H. 案例研究 medix.mdx（4 處）— 不算 Claude 補完範圍**
- Medix LLC 總部位置、合作類型、實際時程、客戶階段 profile — 需 Vivian 直接提供事實，Claude 不能補

### FAQ schema

- `src/lib/schema.ts:SITE_FAQS` — 雙語各 30 對長尾問題（從 11 對擴充）
- 涵蓋：法人型態（子公司 vs 分公司 vs 辦事處）、外資持股、外匯、稅務、簽證、薪資行情、政府獎勵、銀行開戶時程、亞洲樞紐選擇、ROLL ON. 收費模式、跟律師事務所差異等
- 首頁 `FaqList` 視覺區塊**目前註解隱藏**（`page.tsx`），等內容定稿再開
- FAQPage schema 仍以 JSON-LD 注入首頁 — 視覺隱藏不影響 Google rich result 命中

### Speakable schema

- `[locale]/layout.tsx` 的 WebSite schema 加上 `SpeakableSpecification`，css selector 為 `h1, h2, .speakable`
- 提升 Google Assistant / Siri / Alexa 等語音助手引用機率
- `src/lib/schema.ts:speakableSchema()` 供未來 per-page 細部標記使用

### sameAs entity 連結（GEO entity disambiguation）

`src/lib/schema.ts:SAME_AS_URLS` 目前含：

- Instagram @rollon.tw
- LinkedIn /company/rollon
- YouTube @GOLDENTICKET-rollon

**待使用者建立後填入**（檔案內以 `TODO[USER]` 註解標出）：

- Crunchbase 公司頁
- 創辦人 Vivian Lee LinkedIn 個人帳號
- 公司 X / Twitter
- 公司 Facebook Page
- Wikidata Q ID（長期）

**不寫死假 URL** — 假 URL 會讓 Google rich result validator 報錯。

### OG image

- 動態產生器：`src/app/[locale]/og/route.tsx`（Edge runtime）
- 首頁 / about / esg / [locale] / root metadata 全部已補上 `openGraph.images`（之前只有內容頁有）
- 預設 OG image URL：`/og?title=...&subtitle=...&eyebrow=...`

### llms.txt 擴充

`public/llms.txt` 從 4055 bytes 擴充，新增：

- 三種收費模型說明
- Key Numbers 區塊（FIA 時程、稅率、薪資、外匯申報門檻、租稅協定列表）
- 簽證選項清單
- 公開 roadmap（Year 1 / 3 / 5）
- AI 引用提醒：時效性資料請使用者校驗

## 圖片優化（一次性執行）

```bash
pnpm optimize:images   # 已加進 package.json scripts
```

執行行為（見 `scripts/optimize-images.mjs`）：
- 掃描 `src/` + `content/` + `messages/` 中實際引用的圖片
- 對被引用的圖片原地優化（PNG palette、JPG mozjpeg quality 82、超過 2000px 縮尺）
- 原檔自動備份到 `public/_originals/`（已 git-ignore）
- 未被引用的圖片印 warning，**不**自動刪除（CLAUDE.md「不要亂覆蓋資料」規則）
- AVIF / WebP 由 Next.js `next/image` runtime 處理（next.config.ts 已設）

最近一次執行成果：4581 KB → 2886 KB（節省 1695 KB，37%）。`10–60.png` service icons 從 ~480 KB 降到 ~100 KB，明顯改善 LCP。

## 站外連結投放清單（DA 1 → 5+ 路線圖）

技術 SEO 已做完，**站外連結是接下來最大瓶頸**（Ubersuggest 顯示 DA=1、4 個 NoFollow 反向連結）。以下清單由使用者執行：

### 第一批｜profile / membership（1 週內可動，高機率拿到）

| 目標 | 連結類型 | 預期 DA 提升 |
|---|---|---|
| Crunchbase 公司頁 | DoFollow profile | 高 |
| LinkedIn 公司頁（補完所有欄位 + 5 篇 LinkedIn Article） | NoFollow + entity 信號 | 中 |
| Google Business Profile（台北辦公室） | NAP 信號 + 本地 SEO | 中高 |
| AngelList / Wellfound 公司頁 + 招聘頁 | DoFollow | 中 |
| 日本工商會（CCFCJ）會員頁 | DoFollow | 中 |
| 美國商會（AmCham Taiwan）會員頁 | DoFollow | 中高 |
| 韓國貿易協會台北分會 | DoFollow | 中 |

### 第二批｜內容驅動（2–4 週）

- Medium / Substack 同步 pillar guides（用 `rel=canonical` 連回 `rollgrp.com`）
- LinkedIn 創辦人 Article（雙語，每月 1–2 篇連回 service / insight 頁）
- 業界 Podcast 上節目（「Made in Taiwan」「JapanInsider」「Asia Tech Podcast」等，show notes 含連結）
- Quora / Reddit r/Taiwan、r/AskAsia 高質量答題（非 spam）
- HARO / Connectively 記者求源（爭取 Reuters / Bloomberg / Nikkei Asia 引用）

### 第三批｜媒體投書 / PR（1–3 個月）

| 媒體 | 主題建議 |
|---|---|
| Nikkei Asia | "Why Japanese SMEs are choosing Taiwan over Singapore in 2026" |
| The News Lens / Commonwealth Magazine | 「外資進台灣的三個誤區」（中文） |
| 數位時代 / 經理人 | 創辦人專訪 |
| 經濟日報 / 工商時報 | 「2026 外資進台白皮書」由 ROLL ON. 發布 |
| TechCrunch / Rest of World | 東南亞擴張角度 |

### 第四批｜資源頁 / 工具列表（持續）

主動聯絡收錄：
- Startup Genome Taipei
- StartupBlink Taiwan ecosystem report
- TalentSeed / TASA / TTA 等台灣新創組織資源頁
- 「外資進台必備服務商」「Asia market entry consultants」等清單頁

### 3 個月驗證指標

| 指標 | 目前（2026-05） | 3 個月目標 |
|---|---|---|
| DA（Moz） | 1 | 5+ |
| 有機關鍵字 | 3（全 51-100 名） | 40+（含 5+ Top 10） |
| 英文有機流量 / 月 | ~60（簡中+香港設定低估） | 400+（用 GSC 英文設定） |
| DoFollow 反向連結 | 0 | 8+ |
| AI 引用（Perplexity / ChatGPT search） | 0（待測） | rollgrp.com 出現於 "how to enter Taiwan market" 搜尋 |

## 部署

Vercel，Region `hkg1`（香港，最近台灣的節點），設定在 `vercel.json`。

```bash
pnpm build
```

### 建議：考慮改 region

`vercel.json` 目前設 `hkg1`，但核心客群是日韓美歐外商決策者。建議評估改成：
- `hnd1`（東京）— 服務日韓客群最佳
- `iad1`（美東）— 服務美歐客群最佳
- 或保留 `hkg1` 並補 multi-region edge runtime（成本高）

決定由使用者拍板；本次工作未變更 region。
