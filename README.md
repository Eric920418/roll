# ROLL ON. 企業官網

協助外商進入台灣與亞洲市場的顧問公司官網。

## 部署環境檢查

Production、Preview 的環境變數各自設定；非 main 分支的自動 Preview 不會自動繼承 Production。2026-10-03 的 codex/weekly-checkins／8eb1c50 預覽建置失敗原因為 Preview 缺 DATABASE_URL，同一 commit 的 Production 已 READY。預覽應配置獨立測試資料庫的 DATABASE_URL、獨立 AUTH_SECRET 與預覽 NEXT_PUBLIC_APP_URL，完成資料表及其他需驗收功能的設定後重新部署；不要為了建置通過直接共用正式會員 DB／金流／寄信設定。

next build 在編譯前驗證 DATABASE_URL 的存在與 PostgreSQL 格式；Prisma runtime 也做同一檢查。缺失會立即顯示環境名稱，不再隱性使用 localhost 等待多次 60 秒逾時。錯誤不含連線字串或憑證；prisma generate 保留不需要連線的原行为。依使用者選擇，本次只補設定檢查，保留現有正式部署與既有 MDX 追蹤行為；Turbopack NFT 警告不是本次 Preview 失敗原因，未藉由延長逾時或關閉檢查掩蓋。這批修正不更動資料庫或 Vercel 機密，不部署或配置 Preview。 獨立工作樹以正式 origin/main（8eb1c50）為基準驗收：105 項測試通過，pnpm lint 無錯誤（兩項既有警告），pnpm build 成功。缺 DATABASE_URL 的 Next build 約 0.3 秒即失敗並明示 Preview；不依賴本機 .env 冒充 Preview 設定。

## 技術棧

- **Next.js 16** (App Router)
- **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Motion** (framer-motion) — 頁面動畫
- **GSAP + ScrollTrigger** — 滾動驅動動畫
- **next-intl** — 雙語 i18n（`en` 預設、`zh-tw`）
- **next-mdx-remote** — 內容頁 MDX 渲染
- **Prisma 7 + Neon Postgres** — CMS 內容資料庫（`@prisma/adapter-neon` serverless 驅動）
- **Vercel Blob** — CMS 圖片儲存（`@vercel/blob`）
- **jose** — 後台單一管理員認證（簽章 cookie + proxy 保護，未用 NextAuth）
- **字型**：**Hero New** (Adobe Fonts / Typekit) + Noto Sans TC（中文 fallback）+ **Archivo Black**（About 頁 wordmark 展示字型，next/font/google）
- **zod** — MDX frontmatter + CMS 輸入驗證（錯誤完整顯示）
- **pnpm** — 套件管理（禁止 npm / yarn）

## 開發

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test       # Node test runner + tsx 回歸測試
pnpm build      # 生產建置（含 prisma generate）
pnpm lint       # ESLint

# 資料庫（Neon Postgres）
pnpm db:push    # 推送 schema 到 Neon（禁用 --accept-data-loss）
pnpm db:seed    # 灌入初始內容（count-guard，不覆蓋既有資料）
pnpm db:super   # 建立/重置後台超級帳號（pro，見下方「超級帳號」）
pnpm db:studio  # Prisma Studio 檢視資料
```

## 客戶端超級帳號（Super Account）

會員後台入口 `/login`，登入後進 `/dashboard`。要一個「本來就是 pro、直接進後台」的帳號時跑：

```bash
pnpm db:super
# 預設 super@rollgrp.com / RollOn2026!Super，可覆蓋：
SUPER_EMAIL=you@x.com SUPER_PASSWORD='你的密碼' pnpm db:super
SUPER_PLAN=business SUPER_TRIAL_DAYS=30 pnpm db:super
SUPER_PLAN=enterprise pnpm db:super   # 站方管理的 Enterprise
```

腳本 `scripts/create-super-user.ts` 以 `upsert` 建號並重設密碼；Pro／Business 只建立 1–365 天的正式 trial（預設 30 天），不再偽造 PayPal `ACTIVE` 或 2099 到期日，重跑也不覆寫既有 PayPal 付款歷史。`SUPER_PLAN=enterprise` 才是站方人工管理權限。帳號同時設為完成 onboarding／quiz，登入後直達 Dashboard。

2026-09-24：依使用者要求，正式站既有 `super@rollgrp.com` 客戶端超級帳號由 Pro 升為 Business；只更新該會員的 `plan` 與異動時間，保留密碼、會員資料、AI 使用紀錄及既有到期日（DB 原值 `2099-12-31 00:00:00`），未建立 PayPal 訂閱或扣款。此帳號沿用歷史人工 ACTIVE 授權且無 PayPal subscription ID；未來啟用 `BILLING_REQUIRE_EXPLICIT_ENTITLEMENT=true` 前須先遷移人工權限，否則會降回 Free。Business 包含每月 150 次 AI 額度；Investor 逐欄位／逐筆隱藏仍需 Enterprise。前台 `/login` 與 CMS 管理員 `/admin/login` 使用不同帳號系統。

2026-09-29：經使用者確認，已將同一超級帳號重置為初次使用狀態。正式 DB 以單一 Serializable 交易，僅針對固定 user ID／Email 操作：清除公司資料、4 份 Action Plan（連帶 93 筆 action、126 筆 dependency）、31 位 CRM 聯絡人、8 筆商機、6 份筆記、1 筆創辦人測驗、2 筆知識問答、1 筆 AI 使用紀錄；清空 checklist／milestone／閱讀設定，設 `completed=false`、`quizCompleted=false`、`onboardingStep=2`，並將註冊起算日重設為當次時間，避免新填需求後沿用舊日期產生逾期提醒。AI 基本用量歸零，保留加購餘額、登入憑證、Business、原計費／試用欄位、付款紀錄與其他帳號。沒有更動程式、schema 或部署。

重置前完整範圍備份保存在本機 `/Users/eric/.codex/backups/roll/super-reset-2026-09-29T04-18-01-721Z.json`（檔案權限 0600、不在 Git 內；含帳號與關聯資料，勿公開）。SHA-256：`d6dd4af77c5de65f97a63c48b906793a43a7f9eb2760a1a05598028de4072e87`。已先寫入、fsync 並讀回比對備份，再執行清除；交易內斷言確認內容清空及保留欄位／付款紀錄未變。恢復時須以這份備份限定該 user ID，先比對重置後新增內容，避免覆蓋新的正式資料。

重置後驗收通過：原帳密登入 200、回傳未完成 onboarding／step 2；Chrome 實際導向 `/onboarding/company` 且公司欄位空白。正式 agenda 不再包含舊模板任務或測試 Action Plan，Business 仍顯示；AI 用量 API 回傳 used 0／remaining 150／bonusRemaining 0，原額度週期保留。驗收截圖存於同一備份目錄的 `super-reset-2026-09-29.png`。

2026-10-01：登入故障排查確認正式 DB 中 `super@rollgrp.com` 與原 user ID `cmr7nynsy0000xs8o4lf9ic8p` 均已不存在，因此登入回 401。正式站在 9/30 23:35、10/1 10:08 與 10:10（台北時間）有三筆成功的 `POST /api/account/delete`；現有日誌沒有會員 ID，不能把任一請求確定歸因到此帳號。刪帳號端點會 cascade 刪除會員資料，不能拿來代替「清空資料重填」。

使用者明確要求「恢復帳號、保留資料、不要清空」後，已使用上述 **9/29 清空前** 的完整備份恢復原帳號，而非重跑 `db:super`。先核對備份 SHA-256、原密碼雜湊、每筆資料歸屬、正式 DB 欄位與主鍵／Email 衝突，再以單一 Serializable 交易 **只 INSERT 缺失資料**：User、公司資料、創辦人測驗各 1 筆、知識問答 2 筆、CRM 31 筆、商機 8 筆、筆記 6 筆、Action Plan 4 份／Action 93 筆／dependency 126 筆、AI allowance 與 usage 各 1 筆。保留備份中的原憑證、Business、歷史人工 ACTIVE 授權／2099 到期日、註冊日、onboarding 完成狀態、清單／里程碑／閱讀設定與 AI 週期；沒有建立 PayPal 訂閱或扣款。交易內逐欄比對恢復結果與備份，並對每個涉及資料表的其他資料比對筆數與內容指紋，全部通過；不 UPDATE／DELETE 現有資料，不修改 schema，也未部署程式。

**恢復範圍只到 9/29 04:18 UTC 備份**，不代表已找回 9/29 清空後重新填寫、又隨帳號刪除的內容；那些資料需要另有備份或 Neon 歷史還原。操作與驗證記錄：`/Users/eric/.codex/backups/roll/super-restore-2026-10-01T02-30-46-574Z.json`；唯讀預檢脚本：`/Users/eric/.codex/backups/roll/restore-super-2026-10-01.ts`，需先在隔離目錄取得 Production env，再執行 `ROLL_RESTORE_ENV_FILE=/path/to/production.env env -u DATABASE_URL pnpm exec tsx /Users/eric/.codex/backups/roll/restore-super-2026-10-01.ts`（原帳號已恢復後會因衝突而停止，防止重複寫入）。記錄／脚本均在 Git 外、權限 0600；排查用的暫存 Production env 驗收後刪除。

恢復後已用原帳密在正式站實際登入並進入 `/dashboard`，原公司／Action Plan 內容可見；驗收截圖：`/Users/eric/.codex/backups/roll/super-restore-2026-10-01.jpg`。這次只恢復指定帳號的備份與更新本 README，既有其他程式修改未更動。

### 環境變數

Vercel CLI 部署由 `.vercelignore` 明確排除所有 `.env*`；正式憑證只設定在 Vercel Environment Variables，不隨原始碼上傳。

`.env`（Prisma CLI 與 runtime 共用）：

```bash
DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require&channel_binding=require"
```

`.env.local`（僅 Next.js 讀取，後台密鑰）：

```bash
AUTH_SECRET="..."                # jose 簽章密鑰（openssl rand -base64 32）— 後台 admin 與公開用戶 session 共用
ADMIN_EMAIL="admin@roll-grp.com"
ADMIN_PASSWORD_HASH="\$2b\$..."  # bcrypt hash，$ 必須跳脫為 \$（見下方）
BLOB_READ_WRITE_TOKEN="..."      # Vercel 連結 Blob store 後複製
INVESTOR_BLOB_READ_WRITE_TOKEN="..." # Investor Business Plan 專用的獨立 Private Blob store；不得與公開 store 相同

# 公開用戶 Google 登入（缺少時 Email 註冊/登入仍可用，Google 按鈕會在前端顯示設定錯誤）
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"  # 上線改成 https://<網域>/api/auth/google/callback

# 訂閱金流（PayPal）— 只接受精確的 sandbox / live；Vercel Production 強制 live
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID="..."           # PayPal Developer Dashboard 建立 app 取得
PAYPAL_CLIENT_SECRET="..."
PAYPAL_WEBHOOK_ID="..."           # 註冊 webhook（www 正式網域）後取得，供簽章驗證
PAYPAL_PRODUCT_ID="PROD-..."      # NOVA 共用 Product；setup 腳本會建立或重用同名 Product
PAYPAL_PLAN_ID_PRO_MONTHLY_USD="P-..."
PAYPAL_PLAN_ID_PRO_YEARLY_USD="P-..."
PAYPAL_PLAN_ID_BUSINESS_MONTHLY_USD="P-..."
PAYPAL_PLAN_ID_BUSINESS_YEARLY_USD="P-..."
PAYPAL_PLAN_ID_PRO="P-..."        # 舊 TWD plan：只供歷史對帳，不再 checkout
PAYPAL_PLAN_ID_BUSINESS="P-..."   # 舊 TWD plan：只供歷史對帳
BILLING_REQUIRE_EXPLICIT_ENTITLEMENT=false # 兩個舊人工帳號設好 trial 後，Production 才切 true
NEXT_PUBLIC_APP_URL="http://localhost:3000"  # 組 PayPal return/cancel URL；上線填正式網域（不要結尾斜線）

# Investor Portal 邀請信（原生 fetch 呼叫 Resend，不新增套件）
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="NOVA <investor@your-verified-domain.example>"
CRON_SECRET="replace-with-a-random-secret"
REWARD_EMAIL_ENABLED="false"

# 會員 AI Copilot（付費額度或免費獎勵對話）— 上游錯誤完整記錄於 server log，串流不依錯誤內容、只回傳雙語通用訊息
ANTHROPIC_API_KEY="sk-ant-..."   # Claude API 金鑰（platform.claude.com）
ANTHROPIC_MODEL="claude-sonnet-5" # 可選，預設 claude-sonnet-5；成本敏感可改 claude-haiku-4-5
```

> `.env*` 已 `.gitignore`。產生密碼 hash：
> `node -e "console.log(require('bcryptjs').hashSync('你的密碼',12))"`
> ⚠️ **bcrypt hash 內的每個 `$` 在 `.env.local` 必須跳脫為 `\$`**，否則 Next 的 env 載入器（dotenv-expand）會把 `$2b`、`$12` 當成變數展開而破壞 hash，導致登入永遠失敗。
> ⚠️ **shell 已匯出的環境變數會壓過 `.env.local`**：Next.js（與 `node --env-file` / `process.loadEnvFile`）遵循「不覆蓋 process.env 既有值」原則。若你的終端機 profile（或 Claude Code CLI）已 export `ANTHROPIC_API_KEY`，本機 `pnpm dev` 會用那把、忽略 `.env.local` 的值，導致 AI 用到錯的 key。本機要驗 copilot 時用 `env -u ANTHROPIC_API_KEY pnpm dev` 起服務。**Vercel CLI 50.37.3 的 `vercel env run` 會讓本機 `.env*` 與 shell env 覆蓋下載的 Production 值，僅 unset shell 不足以隔離。** 正式複驗須在不含 `.env*`、只放同專案 `.vercel/project.json` 的暫存目錄執行，並移除 shell 同名值。**Sensitive 變數無法下載，CLI 取得空值不代表部署缺少或持有無效金鑰**；呼叫供應商前先確認實際取得非空憑證，否則只能記為未驗證，不能把 401 判定為正式金鑰失效。
> ⚠️ **Vercel Environment Variables UI 只填值本身**：`PAYPAL_ENV` 填 `live`，不可貼入引號、行尾註解或整行 `.env` 範例。Production 遇到非精確值或 `sandbox` 會 fail-closed，不會再靜默切回 sandbox。
> 預設帳號 `admin@roll-grp.com` / 密碼 `rollon-admin-2026`（上線前務必更換）。

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
│   │   ├── esg/               # ESG 品牌敘事頁（靜態）
│   │   └── product/           # 產品著陸頁 /product（SaaS 產品行銷頁，文案走翻譯覆蓋）
│   ├── sitemap.ts             # 動態 sitemap（含 hreflang）
│   ├── robots.ts              # 含 AI bot 白名單
│   └── layout.tsx             # Root metadata
│
├── components/
│   ├── layout/                # Navbar (client), Footer (client)
│   ├── sections/              # RollMap, TaiwanMap, Work, Events 為 client；Services, Clients, GoldenTicket 為 server (RSC) + ScrollReveal client child；InsightsTeaser 目前未掛在首頁
│   │   ├── about/             # About 頁 sections — 全為 client（Hero / Philosophy / RollUpSpirit (GSAP + 打字機循環) / CoreEquation / Principles / ClosingCTA）
│   │   ├── esg/               # ESG 頁 sections — 全為 client（直接用 motion variants）
│   │   └── product/           # 產品著陸頁 sections — 全為 client（ProductNav / ProductHero / HowItWorks / Pricing / ProductCTA）
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

1. **Navbar** — 固定導航；漢堡選單保留 `About`、`ESG`、`Product` 三個獨立頁面入口（首頁回跳由左上 Logo 提供，避免重複）
2. **RollMap** — 滾動三頁：品牌 Hero → 全球 vs 台灣外商數量對比 → Forbes Global 2000 排名（含 ROLL ON 客戶）
   - 包含 `sr-only` SSR 純文字版本供 LLM / 螢幕閱讀器讀取（視覺化數據雙軌化）
   - 手機版 Hero 使用 `svh` 與受高度約束的 `contain` Logo 容器，並保留固定導覽列空間；短螢幕與 Safari 動態工具列不會再把直式 ROLL ON Logo 裁切，桌機仍維持原始最大寬度
3. **TaiwanMap** — 台灣地圖縮放 → 全球 + 6 座橋樑城市；5 行品牌宣言
4. **Services** — 服務卡片（**CMS 管理**），每張連到 `/services/[slug]` + Investor Access CTA
5. **Work** — 案例章節（**CMS 管理**）：`Medix LLC` 可展開/收合；server wrapper 抓資料 → `WorkClient` 渲染 motion
6. **Events** — R Event. 活動卡（**CMS 管理**）；server wrapper → `EventsClient` 渲染 motion
7. **Clients** — 客戶 logo 牆（**CMS 管理**，server component）
8. **GoldenTicket** — YouTube 頻道預覽（**CMS 管理**：影片清單 + 頻道設定）
9. **InsightsTeaser** — 3 篇 pillar guides 入口（**CMS 管理**，已掛在 page.tsx）
10. **Footer** — 聯絡表單（投遞到 `/api/contact` → 後台收件匣）+ 社群連結（**CMS 管理**）

> 所有 section 文字（含區塊標題、About / ESG 整頁）皆可由後台「文案翻譯」即時編輯；清單型內容（4–9）由各自 CRUD 管理。**例外**：RollMap 的數值（mapData / Forbes 排名）與地圖幾何座標仍寫死在程式碼（屬呈現邏輯），其文字標籤可由翻譯覆蓋編輯。

## 產品著陸頁 `/product`（由 `src/app/[locale]/product/page.tsx` 組合）

**NOVA by ROLL ON**（Pro / Business / Enterprise + 專屬 Dashboard）的獨立行銷著陸頁。公開定價不主推 Free；Free 是未訂閱狀態且不能使用 Action Plan。NOVA 採獨立黑白銀品牌系統：Black `#000000`、White `#FAFAFA`、Silver `#BCBDC6`，Motion 維持 `[0.22,1,0.36,1]` 進場；色票以 `.nova-theme[data-brand="nova"]` 局部覆寫，不影響 ROLL ON 官網的暗紅／暖金 token。

1. **ProductNav** — 著陸頁專屬頂部列（非全站漢堡）：NOVA 平面黑 logo → `/product`，`by ROLL ON` → 企業官網，右側 `Login` / `Sign Up` + 語言切換；捲動加玻璃背景
2. **ProductHero / NovaValuePillars** — 金屬 NOVA logo 與四張定位卡片（software、guidance、execution、access，文案沿用翻譯與 CMS 設定）。2026-09-29 移除最右側 Founder ecosystem 卡片，桌機由五欄改為四欄平分原有寬度，每張約加寬 25%；平板兩欄、手機單欄。首頁與產品頁共用同一區塊，兩邊同步生效。下方 Podcast、活動與聯絡入口保留；「六個月內取得亞洲第一張訂單」明示為共同執行目標，不是成交保證。本次僅調整顯示，不修改資料庫。
3. **HowItWorks** — 「如何開始」三步驟（01 註冊 → 02 客製化 Dashboard → 03 媒合夥伴）
4. **Pricing** — 月／年切換的三張公開方案卡：Pro USD 49/月或 USD 468/年一次收取；Business USD 149/月或 USD 1,668/年一次收取並含 Investor Portal；Enterprise 只顯示聯絡報價，不公開內部參考價。沒有虛構原價或限時優惠。
5. **ProductCTA** — 底部黑色 NOVA CTA（`免費開始使用` → `#contact`）
6. **Footer** — 共用 Footer 的 `brand="nova"` 變體：NOVA 白 logo + `by ROLL ON`，保留既有聯絡表單與 ROLL ON 聯絡／版權資訊

### NOVA 品牌邊界與資產

- NOVA 路由範圍：`/[locale]/product`、`login`、`signup`、`onboarding/*`、`quiz/*`、`dashboard/**`
- ROLL ON 保持原樣：首頁、About、ESG、服務、案例、Insights、公司情報、全域 Organization schema、PayPal 商戶識別、CMS `/admin`
- Logo 資產：`public/nova/logo-black.png`、`logo-white.png`、`logo-metal.png`；皆由正式設計檔裁切／壓縮，功能介面用平面版，只有產品 Hero 使用金屬版
- 動態技術：`ogl@1.0.11` 僅由 `/product` 的 client-only 液態金屬元件載入；Hero 使用單一 WebGL context，其他 NOVA 畫面沿用既有 Motion 微動效
- Hero 液態金屬：唯一的 OGL canvas 鋪滿完整 Hero 背景，以高對比黑銀波紋、週期性移動高光與游標光點形成可見的液態金屬流場；速度 `0.5`、游標幅度 `0.18`，再以雙層黑色漸層保護 Logo、標題、CTA 與卡片可讀性。金屬 `logo-metal.png` 保持清楚並只疊加 CSS 掃光。DPR 上限 1.5、粗略指標 30fps、離開 viewport／背景分頁時暫停，reduced-motion、save-data、低記憶體或 WebGL 失敗時不啟動 canvas，Hero 直接降級成純黑靜態背景
- Product 動態語言：Hero 功能卡最多 6px 指標視差、How it works 使用銀色捲動進度軌、Pricing 僅在 hover 執行一次反光與輕抬升、Header 使用金屬訊號線、CTA 反射帶由原生捲動驅動；不做 scroll-jacking
- 功能介面微動效：Auth 品牌欄 Logo 僅首次載入掃光一次；Quiz 題目切換使用 220ms 淡入位移、選取按壓為 180ms；Dashboard 頁面 260ms 進場、active navigation 以 spring 滑動，首頁卡片只在精準指標 hover 時抬升 2px，沒有持續 WebGL
- 共用元件以品牌參數或最近的 `data-brand` 判斷樣式：Footer、LanguageSwitch、RedDotCursor 不會把 NOVA 黑白銀色系回灌到 ROLL ON
- CMS 翻譯仍可編輯 SaaS 文案，但 i18n 合併後會在 `Product`、`Auth`、`Quiz`、`Dashboard` namespace 將獨立品牌字 `Nova` 正規化為正式全大寫 `NOVA`；不改寫資料庫覆寫值
- 語意色不品牌化：錯誤／刪除維持紅、成功維持綠、Google 登入圖示維持官方色
- NOVA 社群預覽使用 `/[locale]/og?brand=nova`；未帶 `brand` 時仍輸出 ROLL ON 暗紅版本
- 視覺 QA（2026-07-24）：production 以 390px／768px／1440px 驗證英文與繁中產品、登入、註冊、NOVA Footer 與 NOVA／ROLL ON 兩種 1200×630 OG；確認黑 `#000000`／霧白 `#FAFAFA`／銀灰 `#BCBDC6` token、三套 logo 深淺背景使用、無 `/horizontal.png`、無橫向溢位。未登入狀態的 onboarding、quiz、quiz result、Dashboard 中英文路由皆正確導向 NOVA login，完整登入錯誤訊息仍以前端 `whitespace-pre-wrap` 顯示。因未建立或污染正式會員資料，本輪未進入需登入的 Dashboard／Quiz 內容狀態；其品牌範圍由共用 `.nova-theme` shell、production build 與硬編碼色票掃描驗證。ROLL ON 首頁、About、CMS login 維持暗紅 `#7B1A2C` 與原 logo，預設 OG 仍為暗紅版本。首輪發現的黑 Hero 導覽對比、金屬 logo 明度、Footer 手機動畫溢位、OG 圖片尺寸型別與 CMS `Nova` 大小寫已修正。
- 動態視覺 QA（2026-07-24）：以 production build 重新檢查 `/product` 英文 1440×1000、繁中 768×1024 與手機 390×844；Hero 在 WebGL 可用時只有一個 canvas，連續影格可觀察到遮罩內銀色紋理緩慢位移，Logo 外框、CTA 與文字不受 canvas 攔截，三種尺寸均無 layout shift、Logo 裁切或 NOVA 頁面水平溢位。桌機捲動後 Header 玻璃背景、How it works 進度軌、Pricing 單次反光與 CTA 銀色反射帶皆維持黑白銀；登入頁只有一次 CSS 掃光且 canvas 數為 0，未登入 Dashboard／Quiz 導回同一 NOVA login 且不載入 WebGL。程式分支另確認 reduced-motion、save-data、低記憶體、粗略指標、離開 viewport 與背景分頁降級；瀏覽器 console 無錯誤。ROLL ON 首頁、About 與 CMS login 的 canvas 數皆為 0，品牌 token、logo 與既有動畫路徑未被 NOVA shader 引入。
- 可見度修正（2026-07-24）：首次版本雖有 WebGL 影格更新，但 canvas 只存在 Logo 遮罩內，固定金屬 PNG 又以 70% 不透明度長駐，且 1.5 秒內 Logo 區域平均色差僅約 `3.6/255`，肉眼近似靜態。修正後將 shader 改為鋪滿整個 Hero 的液態黑銀背景，Logo 回歸清晰金屬識別；Hero 卡片、銀線、步驟數字與 CTA Logo 也加入不需 hover 就能辨識的黑白銀環境動態，Pricing 進入 viewport 時各自掃光一次。reduced-motion 仍完整關閉所有持續動畫並保留清楚的靜態版本。
- 背景動態複驗（2026-07-24）：production 1440px Hero 相隔 1.5 秒的完整畫面平均色差提升至約 `14.68/255`，約 `72.1%` 色彩通道變化超過 4 階，並排影格可直接辨識大面積波紋與高光位置改變；390×844 手機版維持單一 canvas、無水平溢位且 Logo／CTA／三張卡片皆清楚。Pricing 進場掃光、ROLL ON 首頁 canvas 數為 0、瀏覽器 console 無錯誤也已重新確認。

> **文案管理**：整頁文字（含 NT$ 定價）放在 `messages/*.json` 的 `Product` namespace，自動出現在後台「文案翻譯 → Product」分組可即時編輯（沿用 Home / ESG 的翻譯覆蓋機制，**無新增資料表**）。**價格分工**：顯示文案只信 i18n；gating / 驗證邏輯只信 `src/lib/billing/plans.ts`（避免雙重事實來源）。**會員系統與專屬 Dashboard 已實作**，見下方「會員專屬後台 + 訂閱金流」。

## CMS 後台

`/admin` 提供業主自助編輯前台所有內容，資料存 Neon Postgres、圖片存 Vercel Blob。後台位於 `[locale]` 之外，不走 i18n、不被搜尋引擎索引。

### 登入與保護

- 登入頁 `/admin/login`，以 `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH`（bcrypt）驗證
- 通過後簽發 jose JWT 存 httpOnly cookie（`admin_session`，7 天）
- `src/proxy.ts`（Next 16 取代 `middleware`）攔截 `/admin/*` 與 `/api/admin/*`：未登入 → 導向登入 / 回 401；前台其餘路徑交給 next-intl。proxy 跑在 Edge，僅用 jose（不 import prisma）

### 後台頁面

| 路由 | 功能 |
|---|---|
| `/admin` | 儀表板（各內容筆數、未讀訊息數、**待處理問題回報數**、註冊帳戶數） |
| `/admin/services`、`/events`、`/clients`、`/work`、`/videos`、`/insights` | 清單型內容 CRUD（共用泛型表單與列表） |
| `/admin/translations` | 文案翻譯編輯器（依 namespace 分組、en/zh-tw 並排，涵蓋 About / ESG / 全站 UI 文字） |
| `/admin/settings` | 頁尾聯絡資訊、社群連結、Golden Ticket 頻道 |
| `/admin/messages` | 聯絡表單收件匣（標記已讀 / 刪除） |
| `/admin/feedback` | **會員問題回報收件匣（2026-08）** — 列出 `FeedbackReport` 全部回報，含回報者 email／姓名／**方案**（付費會員的功能故障與免費帳號的體驗建議優先級不同，故一併撈 `User`）、分類（Bug／建議／其他）、重現資訊摺疊區（頁面 URL／語系／User-Agent）。可改處理狀態（待處理／處理中／已解決／不處理）、寫**會員看得到的回覆**、刪除。上方為狀態篩選 chip（預設「待處理」，各附筆數）。 |
| `/admin/users` | **註冊帳戶與限時試用管理** — 列出會員、完整 email、登入方式、付款快取與 onboarding 狀態；可設定／延長／撤銷 Pro 或 Business trial，並明確標出沒有 PayPal subscription id 的舊假 ACTIVE。仍不提供刪除會員或直接修改 PayPal 付款狀態。此頁含明碼個資，只能由 admin session 存取，Server select 不讀 `passwordHash`。 |

### 雙語內容模型

- 清單型內容（`Service` / `Event` / `Client` / `WorkCase` / `Video` / `InsightTeaser`）的文字欄位以 Json `{ en, "zh-tw" }` 儲存；非文字欄位（slug / 圖片 URL / 連結 / 排序）為普通 column
- zod `LocalizedString` 在 API 層驗證；前台以 `pick(value, locale)` 取值（fallback：指定語系 → en → 空字串）
- 泛型 CRUD：`src/lib/cms/resources.ts`（server registry：prisma delegate + schema + tag）+ `src/lib/cms/resource-fields.ts`（client 欄位設定）驅動單一 `[resource]` 路由與 `ResourceForm` / `ResourceList`

### 翻譯覆蓋層（核心機制）

讓現有所有 `t()` 呼叫**零改動**即可被 CMS 編輯：

- `src/i18n/request.ts` 載入靜態 `messages/*.json`（base / fallback）後，deep-merge DB 覆蓋值（`Setting` blob `messages.en` / `messages.zh-tw`，只存被改過的鍵）
- 翻譯編輯器清空欄位 = 回退至預設值（deep-merge 視空字串為未覆蓋）

### 圖片上傳（Vercel Blob，client 直傳）

- 採 **client-side 直傳**（`@vercel/blob/client` 的 `upload()`）：瀏覽器直接把檔案送到 Blob，**繞過 Serverless Function 4.5MB body 上限**（否則大圖會被平台層回 `413 FUNCTION_PAYLOAD_TOO_LARGE`）
- `POST /api/admin/upload` 改為 `handleUpload` 的 **token 簽發端點**（不經手檔案位元組），兩階段：
  1. `blob.generate-client-token`（瀏覽器發起、帶 admin cookie）→ 在 `onBeforeGenerateToken` 內以 `getAdminSession()` 驗證管理員
  2. `blob.upload-completed`（Blob 伺服器回呼、無 cookie，由簽章驗證）→ `onUploadCompleted` 清理被取代的舊圖（本機 localhost 不觸發，僅正式環境）
- 因回呼無 cookie，`proxy.ts` 讓 `/api/admin/upload` **略過 cookie 攔截**，授權改在 route 內把關
- 限制：型別 JPG/PNG/GIF/WebP（不含 SVG，避免儲存型 XSS）、≤ 20 MB（前後端一致）
- `next.config.ts` `images.remotePatterns` 已允許 `*.public.blob.vercel-storage.com`
- seed 的初始圖片仍指向 `/public/*.png`；業主在後台上傳後即改為 Blob URL

### 快取與即時更新

未啟用 `cacheComponents`，走 Previous Model：

- 前台 getter（`src/lib/cms/content.ts`）用 `unstable_cache` + tag + `revalidate: 60`
- mutation 後 `src/lib/cms/revalidate.ts` 的 `revalidateContent()` 呼叫 `revalidateTag(tag, "max")`（Next 16 雙參數）+ `revalidatePath("/", "layout")`
- 首頁另設 `export const revalidate = 60` 作為兜底；編輯後前台最多 60 秒內更新（多數情況即時）

### Build 期間 DB 讀取重試（`src/lib/prisma.ts`）

Prisma client 以 extension 包裝：所有**讀取**操作走 `withReadRetry`（4 次、指數退避 + jitter），**寫入不重試**（避免非冪等重複寫入）。
原因：靜態生成上百頁時，多 worker 在 `unstable_cache` 冷啟同時對 Neon 發大量 WebSocket 查詢，偶發連線抖動會丟 `prisma:error undefined` 使單頁 prerender 失敗、整個部署掛掉（非程式碼問題）。讀取重試讓暫時性錯誤自癒，避免新增頁面時 build 隨機失敗。

### 初始化流程

```bash
pnpm db:push && pnpm db:seed   # 建表 + 灌入現有內容（與切換前顯示一致）
pnpm dev                        # /admin/login 登入後即可編輯
```

> seed 使用 count-guard：每個表僅在為空時寫入，重跑不覆蓋業主編輯（符合「不亂覆蓋資料庫資料」規則）。

## 公開用戶系統（註冊 / 登入 / Onboarding）

與後台 admin 完全獨立的公開平台帳號系統，雙語、含 Email + Google 兩種註冊登入方式，以及 3 步驟 onboarding。設計對齊 `Sass design-01/02`。

### 與 admin auth 的隔離

沿用同一套 jose（`AUTH_SECRET`）+ bcrypt，但**獨立 cookie 與角色**，互不干擾：

| | cookie | 角色 | 簽發 / 驗證 |
| --- | --- | --- | --- |
| 後台 admin | `admin_session` | `admin` | `createSession` / `verifySession` |
| 公開用戶 | `user_session` | `user` | `createUserSession` / `verifyUserSession`（見 `src/lib/auth/session.ts`） |

兩個 `verify*` 都會檢查 `payload.role`，admin token 不可冒用為 user，反之亦然。`getUserSession()` 在 `src/lib/auth/guard.ts`。

### 路由

| 路徑 | 說明 |
| --- | --- |
| `/[locale]/signup` | 註冊頁（STEP 1）。Email 分頁＝姓名/Email/密碼；Google 分頁＝Google 登入。 |
| `/[locale]/login` | 登入頁（Email + 密碼，或 Google）。 |
| `/[locale]/onboarding/[step]` | `step` = `company`(Step 2) / `requirements`(Step 3)。**proxy 守衛**：未登入導向 `/login`。 |
| `/api/auth/signup\|login\|logout` | Email 流程（POST，回 `{data}` / `{error,code}`）。 |
| `/api/auth/onboarding` | PATCH，`getUserSession` 把關，寫入 `OnboardingProfile` 並推進 `onboardingStep`。 |
| `/api/auth/google/authorize\|callback` | 手寫 Google OAuth 2.0（locale 無關）。 |

UI 元件全在 `src/components/auth/`（`AuthShell` 雙欄版型、`Stepper`、`SignupForm`、`LoginForm`、`Onboarding*Form` 等）。ProductNav 的 Login/Sign Up 已接到 `/login`、`/signup`。

### 資料模型（`prisma/schema.prisma`）

- `User`：`email`(unique)、`passwordHash`(Google 用戶為 null)、`googleId`(unique)、姓名/頭像、`onboardingStep`(1/2/3/4)、`completed`；**計費快取**：`plan`、`subscriptionStatus`、`paypalSubscriptionId`、`currentPeriodEnd`、`planUpdatedAt`；**人工試用**：`trialPlan`、`trialStartsAt`、`trialEndsAt`。有效權限取真實 PayPal entitlement 與未到期 trial 的較高方案。
- `OnboardingProfile`(1:1)：Step 2 公司/產業/規模/網站/母國；Step 3 `timeline`（語意已改為**公司成立年限**，slug `lt1y/1-3y/3-5y/gt5y`）、`budgetRange`（前端顯示為 **Seed money**，沿用 US$ 級距）、`needs[]`（服務需求）、`notes`、`targetMarkets[]`。
  - **表單欄位調整（2026-06）**：onboarding Step 3 只收「成立年限 / Seed money / 備註」；`targetMarkets` 已自所有表單移除、`needs` 僅保留在後台帳號頁（`/dashboard/account`，供 Tools 個人化）。兩欄仍存在於 DB schema、API 停止覆寫 → **既有資料零遺失、無 migration**。
- `Subscription`：PayPal 訂閱歷史（含 `checkoutRequestId`、月／年、幣別、實收最小貨幣單位與 replacement relation），對帳/審計用；舊 TWD 欄位保留且不回填假資料。
- `AiAllowance` / `AiUsage` / `AiCreditPurchase`：每月 150 次 NOVA、併發 reservation、永久加購餘額與 PayPal Orders/capture 冪等紀錄。Action Plan diagnose/generate 不計入 150 次。
- `InvestorPortal` / `InvestorKpi` / `InvestorMilestone` / `InvestorUpdate` / `InvestorInvitation`：Business/Enterprise 公司共用分享設定、唯讀投資人內容、一次性邀請與 Private Blob PDF metadata；所有分享開關預設關閉。
- `WebhookEvent`：PayPal webhook 事件審計（event id 當主鍵，天然去重）。

### Google OAuth 設定（前置）

1. Google Cloud Console 建 OAuth Web client，同意畫面 scope `openid email profile`。
2. 授權 redirect URI 加 dev + prod 兩組（須與 `GOOGLE_REDIRECT_URI` 完全一致，路徑為 `/api/auth/google/callback`）。
3. 將 client id/secret + redirect uri 填入 `.env.local`（見上方環境變數）。未設定時 Email 流程仍可用，Google 按鈕會在前端顯示設定錯誤。

> Terms / Privacy 連結目前為 `#` placeholder，待有正式條款頁再接。

### NOVA 成長診斷（onboarding 之後）

完成 onboarding（requirements）後 → `/[locale]/quiz`（3 題、每題 A–D 四選一）→ `/[locale]/quiz/result`（回顧瓶頸、成長方式、12 個月目標）→ `/dashboard`。`User.onboardingStep` 的 4 代表 quiz；測驗提交後 `quizCompleted` / `completed` 才設 true。`/quiz/*` 由 proxy 以 `user_session` 守衛。

- **新題目**：依序為 `growth-bottleneck`、`growth-style`、`growth-milestone`。提交 API 從 DB 重新核對已發布的三題、每題一個有效選項，將當次答案的雙語文字快照存入 `QuizSubmission.scores`（`kind: growth-v1`）；結果頁和 NOVA AI 讀取這份快照，不再把新答案算成創辦人風格分數。行動計畫診斷也會收到同一份 context；填完測驗本身不會自動產生完整 12 個月路線圖。
- **保留舊資料**：舊版創辦人配對程式、題目與既有提交均保留供歷史查閱；管理員提交清單可顯示新舊紀錄及 A–D 全部選項。`prisma/seed.ts` 是舊版初始化程式（僅空資料庫才執行），不可用於切換正式題目。
- **正式題目切換**：先部署支援兩種結果格式的程式，再以現有正式資料庫連線執行 `pnpm exec tsx scripts/publish-growth-quiz.ts`。腳本在單一 serializable 交易中建立三題固定 ID 的新題、將已核對的三題舊題設為未發布；如現況不符便中止且不改資料。重跑會安全跳過。無需 schema migration、`db:push`、reset 或資料清除。
- **驗證**：`pnpm test` 包含新舊結果辨識與三題順序檢查；正式切換後應核對三題已發布、舊題未發布、歷史提交筆數不變。

### 後台測驗管理（`/admin`，自動受保護）

- `/admin/quiz-submissions` — 清單（用戶 / 作答 / 新診斷或舊版創辦人配對與分數 / 時間 + 刪除）。
- `/admin/quiz-questions`、`/admin/founders` — 以 JSON 編輯器增刪改（含雙語、timeline、businessDetails 等巢狀結構）；API 在 `/api/admin/{quiz-questions,founders,quiz-submissions}`，皆 `requireAdmin` 把關。

## NOVA 會員專屬後台 + 訂閱金流（PayPal）

2026-10-01 Next steps 建檔修正：正式 runtime log 確認診斷會產生瓶頸 group/code 不一致的 Zod 錯誤。AI 現在只選 bottleneck code，分類由既有 taxonomy 推導；追問以逐輪 Q&A 傳入，伺服器拒絕重複題目、第三題後強制完成診斷，無效回覆最多修復一次，仍失敗以 422 回傳完整驗證原因。診斷 route 的時間上限改為 120 秒以容納修復；每日上限由 10 次 API 呼叫改為 40 次（約十輪完整診斷），避免每題作答都計次、錯誤重試後無法使用。前端只在診斷成功後累積答案，失敗保留原題與草稿，避免重試造成重複作答／超過三題；起始失敗可直接重試。確認後生成的每批任務也會收到三題作答；新 API 欄位預設空陣列相容既有客戶端。測試涵蓋分類推導、重問拒絕、三題上限、五項生成及前端失敗重試。不改 schema 或既有會員資料。44 項測試、TypeScript、lint（僅兩項既有 warnings）及 production build 通過。

2026-10-01 正式生成驗收：從 Home 的 POLARIS「Build action plan」實際作答，第一題問產品／付費客戶，第二題問推薦外的獲客管道，第二次作答後進入 Your diagnosis，沒有要求固定三題。獨立臨時 QA 帳號透過正式登入、diagnose、generate API 成功建立 5 項（201）；Next steps 連續兩次重新讀取均包含同一已儲存計畫，同 requestId 重送回 200／原計畫且 DB 仍只有一份。測試後僅移除此次建立的 QA 帳號及其資料、rate counters；原會員計畫不更動。另實測發現 POLARIS 卡片 hover transform 會限制巢狀 fixed 診斷視窗，現改用 React createPortal 顯示在 document.body，讓所有建檔入口共用正常的全頁視窗，並在 portal 根節點保留 NOVA theme；前端回歸測試核對 portal 目標與失敗重試。沒有 schema 變更。

2026-09-30 客戶驗收調整：Action Plan 新生成固定 5 項（約需 1 分鐘），診斷改為「Your diagnosis」並先確認／修正；卡片只顯示標題、預期成果、預估天數、Why now，八維詳細資料折疊於 Details。優先分數保留作內部排名，對會員顯示 Critical（≥200）／High（≥100）／Medium（≥40）／Low（<40）；移除可見的 Confidence 與 Server-ranked priorities 文案。NOVA 對話新增每會員 CopilotTurn 紀錄，問題先存、回答完成後補上，跨頁載入最近 100 輪（送給 AI 的僅最近 14 輪完整對話）；舊版未曾持久化的對話無法回復。Meeting Notes 增加會議類型選項（客戶／投資人／夥伴／內部／其他）與一般日期輸入，原有標題、內容及會議紀錄保留；新日期以 UTC 日期顯示避免跨時區偏移，舊紀錄維持原本本地時間顯示，編輯舊紀錄但未變更日期時不改寫原時間。

資料庫部署前以 `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` 確認差異僅為 `MeetingNote.meetingType` nullable 欄位與 `CopilotTurn` 新表、索引、外鍵，再執行 `pnpm db:push`；未使用 `--accept-data-loss`，部署後 diff 為空。對話僅會員本人、Pro 以上可讀寫，GET 回應禁止快取。回歸測試名稱也改為對應目前 5 項生成。

Golden Ticket 使用提供的 EP.3 封面 `public/golden-ticket-call-center.jpg`。程式部署後以 `pnpm exec tsx scripts/publish-golden-ticket.ts` 新增排序第 0 的影片，連到已核對的 `https://www.youtube.com/watch?v=CAZhCUssgn0`；舊影片保留、不覆寫。新資料固定 ID，重跑會跳過，views 留空避免捏造觀看數；執行後關閉資料庫連線。正式站視覺檢查後將預告卡改為獨立短卡，不再被影片高度撐滿，也不讓標題和候補按鈕擠在同一行。

2026-09-30 導覽整併：左側只顯示 Home、Profile、Next steps、Customer insights、Share with investors、Account and plan、Feedback；頁面主標題也改為相應名稱。台灣百大企業及募資測驗暫時隱藏入口，舊資料和舊 URL 保留。Profile 新增可編輯的 ICP 欄位，儲存在 `OnboardingProfile.icp`，並提供給 NOVA 個人化上下文；此 schema 變更只新增 nullable 欄位，不改舊會員資料。
ICP 前後端皆限制 2000 字元，過長回明確 400 錯誤，會員仍可保留既有公司檔案欄位。
ICP 編輯欄位放在 Account and plan 的公司資訊區，Profile 頁顯示已儲存內容。
正式站驗收修正：英文與繁中 ICP 欄位使用 `Dashboard.account` 翻譯，避免顯示原始翻譯鍵。
正式資料庫更新前 `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` 僅顯示 `ALTER TABLE "OnboardingProfile" ADD COLUMN "icp" TEXT`，再用 `pnpm db:push` 套用；未使用 `--accept-data-loss`，舊會員資料不受影響。
Customer insights 新頁面 `/dashboard/insights` 並列既有 CRM 聯絡人清單與會議／對話筆記，沿用原 API 與資料；Sales pipeline 從主導覽隱藏，但原有交易資料與舊 URL 保留，不做資料轉移或刪除。
Account and plan 在 `/dashboard/account` 同頁顯示公司檔案、現有 BillingPanel 與帳戶安全設定；既有 `/dashboard/billing` 與付款回跳 URL 保留以維持相容，主導覽只留一個入口。
站內方案升級、付款完成返回與額度返回入口改連到 `/dashboard/account#plan`；原 Billing URL 仍可使用。
Next steps 在 `/dashboard/agenda` 直接包含可編輯的里程碑清單與其完成進度，沿用原 `checklistState`／`milestoneConfig`，不複製或搬移資料；舊 `/dashboard/tools` 導向頁內里程碑區。
舊版落地任務與里程碑共用的系統勾選狀態更新後，`ChecklistTool` 會按新的 server groups 重新載入，避免同頁進度顯示舊值。
Action 排序維持「可執行且高優先級先顯示」，凡有未完成的前置 Action 一律鎖定；API 拒絕提前勾選被阻擋的任務，也拒絕把已完成後續任務的前置項目改回未完成。Next steps 同時顯示 Action 完成進度，勾選成功後由回傳的計畫立即重算。
2026-09-30 依賴驗收：新生成的五項 Action 使用固定 `task_1`–`task_5` 識別碼，AI 必須先列前置任務，再以 `dependsOnKeys` 指向已生成的 ID；server 拒絕缺失或重複的依賴 ID、循環、重複標題、沒有連結 ID 的依賴，以及超過一項 Critical impact，失敗時要求 AI 修正一次。Home 與 Next steps 均使用 `rankActions` 的 Ready／Blocked 結果；舊計畫若只有依賴等級而沒有關聯 ID，顯示為 Blocked，需人工編輯連結，不自動猜測或改寫既有資料。
Action 完成進度以當前 active plan 的 `done` 數量即時計算，與里程碑原有的完成率分別標示。
排序回歸測試以非 Required（level 1）依賴驗證同樣會鎖定，直到前置項目完成。
Share with investors 仍由 Business 以上方案控管；Business 月費從 `PLAN_CONFIG` 讀取 USD 149 顯示在升級提示，不另造價格常數。

登入會員的自助 Dashboard，與 onboarding/quiz 共用 `user_session`。proxy 已把 `/dashboard`（及 `/company` 台灣企業智庫）納入保護（`^/(zh-tw/)?(onboarding|quiz|dashboard|company)`）；proxy 只樂觀驗 session，方案 gating 由各頁面 / API 的 DAL 即時查 DB（不在 proxy 查庫）。

### 路由

| 路徑 | 說明 |
| --- | --- |
| `/[locale]/dashboard` | **NOVA 決策總覽（2026-08）**：首屏固定依序顯示 Today’s priority、Company stage／Current bottleneck／Subscription、伺服器排名的 Next 3 moves 與 Product／Sales／Fundraising／Expansion 四類完成率，再顯示 Investor DD & Global Founder Hub 預告與 Golden Ticket Podcast。Priority 的 precedence 為：非 Pro 升級 → active plan 第 1 Action → Required 依賴阻擋 → 全部完成；沒有 active plan 才回到 onboarding → quiz → Build Action Plan。四類進度只由 active Action 的 `outcomeCategory` 與 `done` 即時計算，`custom` 排除、無適用 Action 顯示 `—`，不產生假百分比。Free 會員看診斷空狀態與升級入口，不洩漏降級前保留的 Pro plan 內容。原每日 Alerts row 移除；Key Metrics 列已於 2026-09-29 移除，下方為 POLARIS、標竿企業發展路線與 NOVA AI Event。所有卡片維持 NOVA 品牌設計、雙語與 44px 操作區。 |
| `/[locale]/dashboard/profile` | **Profile / 公司檔案**（2026-07；英文介面於 2026-08 簡化名稱）：唯讀展示會員 `OnboardingProfile`（公司/需求兩區，slug 經 `Auth.options.*` 轉 label），附「編輯」→ `/dashboard/account`；未填顯示引導卡。 |
| `/[locale]/dashboard/companies` | **Taiwan top 100 / 台灣百大企業**（2026-07；英文介面於 2026-08 統一更名）：`getCompanyList()`（`content/companies/*.json`，現 103 家）→ `DashboardCompanyList`（前台品牌紅版，含搜尋），每張卡連 `/company/[slug]`。公開目錄列表頁 `/company` 已移除，此後台頁為公司清單的唯一入口。 |
| `/[locale]/dashboard/playbooks`（+`[slug]`） | **Fundraising / 知識手冊（2026-07；2026-08 從側欄移除但保留頁面與教材）**：ROLL ON 募資／成長方法論指南，登入即可看。一份＝一個 `content/playbooks/<slug>.json`（`pnpm ingest:playbook` 把 PDF 經 Claude 轉雙語 JSON）。**每個紅色標題＝一個 segment**；詳情頁 `PlaybookReader` 分段渲染 + 每段「標為已讀」+「全部／未讀／已讀」filter（狀態存 `User.playbookReads`），列表頁顯示各份已讀進度。**雙用**：同內容餵 Nova AI（`get_playbook`）並供 Fundraising quiz 出題。 |
| `/[locale]/dashboard/quiz` | **Fundraising quiz / 募資測驗**（2026-07；2026-08 由 Founder quiz 更名，與 `/quiz` 的創辦人決策風格測驗明確區隔）：每兩週一批選擇題，題庫來自 playbook 各段（ingest 時每段產 2 題）。以會員註冊日為錨**即時算第幾個雙週**（`src/lib/playbook/quiz.ts`，無 cron），全部題庫循環出題；`PlaybookQuizClient` 作答 → server 端重算分數＋對錯＋解析，每期一筆存 `PlaybookQuizAttempt`。**不寄 email、不排程**、**不**綁 onboarding。 |
| `/[locale]/dashboard/crm\|pipeline\|notes` | **真 CRUD（2026-07，Pro 方案限定）**：各對應新 Prisma 表（`Contact` / `Deal` / `MeetingNote`，`userId` scope + `onDelete: Cascade`）。`requirePlan("pro")`→null 顯示付費牆（`PlanPaywall`），否則查該會員資料傳給 client 元件（`CrmManager` / `PipelineBoard` / `NotesManager`），新增/編輯/刪除後 `router.refresh()`。CRM `Contact.category` 是底層欄位，UI 顯示為可選的自由文字 `Project`，新增與編輯皆會保存，清單以專案標籤顯示，舊資料維持相容。Pipeline 為 stage 分欄看板（MVP 用下拉改階段，不做拖拉）。Deal 可選連 CRM `Contact`（`SetNull`）。 |
| `/[locale]/dashboard/account` | 帳號 / 個人資料：顯示 + 編輯 `OnboardingProfile`（**不**推進 onboardingStep）+ 變更/設定密碼 + 刪除帳號（危險區，需輸入確認字）。 |
| `/[locale]/dashboard/billing` | **BILLING**：目前付費／trial 狀態、Pro / Business 月年繳、Enterprise 洽詢、每月 150 次 NOVA 額度／重置日與 USD 5 加購 10 次。年繳同時顯示等效月費及實際一次收取總額。SUSPENDED 在 1 天寬限期內顯示更新 PayPal 付款方式；取消後仍保留到已付款週期結束，不自動退款。 |
| `/[locale]/dashboard/billing/return` | PayPal 核准後返回頁，呼叫 confirm 即時對帳。 |
| `/[locale]/dashboard/investors` | **Business / Enterprise Investor Portal**：全公司單一分享設定；Profile、stage/bottleneck、Action Plan、KPI、Milestone、Update、Business Plan 全部預設關閉。Enterprise 另有逐欄位隱藏與逐筆隱藏（Business 唯讀、既有設定持續生效）；KPI 可維護時間序列數值供投資人端走勢圖。KPI/Milestone/Update 完整 CRUD；PDF 由瀏覽器直傳，限 10 MB 且同時驗 MIME、副檔名、`%PDF-` 檔頭，驗證失敗會刪除該 Private Blob。Email 邀請 7 天、token 只存 hash、同 Email 登入後才能接受；撤銷或降級立即失效，資料保留。Pro 顯示升級入口。 |
| `/[locale]/investor`、`/investor/[portalId]`、`/investor/invite/[token]` | 投資人獨立唯讀入口；公司頁含完整公司檔案（產業／規模／國家／官網／目標市場／公司年資／種子資金／服務需求／補充說明）、階段與瓶頸、Action Plan（Next 3＋完成進度＋完整動作清單）、KPI（有時間序列就畫走勢圖）、里程碑、公司更新、Business Plan。被隱藏的欄位與項目完全不進 RSC payload，不留佔位。同一 User 可同時是創辦人與多家公司的投資人。邀請登入／註冊會安全返回原邀請；跨公司或已撤銷權限回 404。PDF 每次下載重新驗 owner 或 accepted membership，回 `private, no-store` + `nosniff`，不暴露 Blob URL。 |
| `/[locale]/dashboard/tools` | **MILESTONES / 里程碑**（Pro+）——依 `OnboardingProfile.needs` 顯示既有進入市場清單，並固定加入「每週 / Weekly」與「每月 / Monthly」群組。頁面可新增自訂里程碑，**系統預設項目與自訂項目一律可編輯文字與刪除**，所有群組（含 Market entry）皆可改名；系統清單完成狀態繼續存 `User.checklistState`，群組改名、自訂項目與系統項目覆寫另存 `User.milestoneConfig` JSON，兩者互不覆寫。系統項目採覆寫層而非改寫模板：改名寫入 `systemTitles`、刪除只記 key 到 `hiddenSystemKeys`（軟刪），因此 item key 永遠穩定、勾選狀態不會變孤兒，群組標題旁的「還原預設 / Restore defaults」可一鍵還原該群組所有預設項目（只在該群組有覆寫時出現）。系統 item key 一律用 `ALL_CHECKLIST_KEYS` 白名單驗證。沒有 needs 仍可使用每週／每月群組；方案不足顯示升級牆。所有操作區至少 44px，進度條含 ARIA 數值，API 錯誤在前端完整換行顯示。 |
| `/[locale]/dashboard/agenda` | **NOVA ACTION PLAN（Pro+，2026-08）**：首頁 NOVA 的 `Build action plan` 或本頁 `Regenerate with NOVA` 啟動診斷；每次只問一題、固定三題全部回答後，使用者才可確認／修改 7 階段與「群組＋具體問題」瓶頸，確認後才生成 5 個 Actions（約需 1 分鐘）。每項含 Impact、Urgency、Dependency、Difficulty+Action time、Company stage+Stage fit、Bottleneck+Bottleneck fit、Expected outcome+Estimated time 八維資料。Action time 以 15 分鐘精度輸入、AI 生成與排序；`ActionItem.actionTimeMinMinutes/MaxMinutes` 為 nullable 新欄位，舊資料回退到 hours × 60，新寫入同時以 floor／ceil 保存舊 hours 欄位相容。`src/lib/action-plan/ranking.ts` 依 `Impact × Urgency × Stage fit × Bottleneck fit ÷ Difficulty` 即時計分（不存 score/rank/blocked），排除完成與 Required 未解除依賴後，依分數→緊急度→影響力→較短分鐘數→建立時間得出 Next 3。完整清單可搜尋、篩 Ready/Blocked/Done、新增、編輯、完成與刪除；修改哪一個 Fit 都必填理由、只清空該 Fit 的 AI confidence，並以獨立 flag 標示該欄為使用者調整；被其他 Action 依賴者禁止刪除並回 409。重新生成以 transaction 封存舊版、建立新版，任何失敗都回滾。原 `LandingTask`、`User.checklistState` 與既有期限計算完全不遷移、不覆寫，移至頁面下方 **Legacy landing tasks** 獨立保留。 |
| `/[locale]/dashboard/feedback` | **REPORT AN ISSUE / 問題回報（2026-08）**：會員回報產品 bug 或提建議，並看得到自己每則回報的處理狀態與我們的回覆。**刻意不套 `requirePlan`**——其他會員工具是 Pro 限定，但 bug／建議是我們想要更多、不是更少的訊號，把免費會員擋在付費牆後面等於自斷回饋來源；濫用護欄改由 rate limit 承擔（見下方 API）。左欄表單（分類／摘要／描述／選填「發生在哪個頁面」），右欄自己的回報清單（狀態徽章 + 管理員回覆區塊）。送出後**不開放會員自行修改／刪除**：回報是重現問題的事證，且管理員可能已據此回覆，事後被改寫會讓後台處理紀錄失去意義——要補充就再送一則。元件 `FeedbackManager`。**狀態語氣刻意兩套**：後台 `wontfix` 標「不處理」（分流用、要短），會員端同一狀態顯示「已評估，暫不處理 / Reviewed — not planned」——資訊不隱藏（會員不會傻等），但不用「不予處理」這種對願意花時間回報的人偏冷的字眼；徽章配色也走中性灰而非紅色。 |
| `/api/account/profile` | PATCH 更新 profile（自守衛 `getUserSession`）。 |
| `/api/account/password` | POST 變更/設定密碼（有密碼者需驗舊密碼；Google-only 免舊密碼直接設定）。 |
| `/api/account/delete` | POST 刪帳號（best-effort 取消 PayPal；若有私密 Business Plan，Blob 必須先成功刪除，否則整個刪帳失敗；之後 DB cascade + 清 session）。 |
| `/api/tools/checklist` | PATCH 更新落地清單勾選（`requirePlan("pro")` 守衛，merge 進 `User.checklistState`）。 |
| `/api/tools/milestones` | PATCH 執行 Milestones 群組改名、自訂項目的新增／編輯／完成／刪除，以及系統預設項目的改名（`updateSystemItem`）、軟刪（`deleteSystemItem`）與整組還原（`restoreSystemItems`）；`requirePlan("pro")`、Zod 白名單、每戶最多 100 筆，自動以登入 userId scope 寫入 `User.milestoneConfig`。 |
| `/api/{crm\|pipeline\|notes}` + `/[id]` | **會員 CRUD（2026-07）**：POST 建立 / PATCH 更新 / DELETE 刪除。自守衛 `getUserSession`（401）+ `requirePlan("pro")`（403），每筆以 `session.uid` scope（`updateMany`/`deleteMany` count 檢查，或 findFirst 驗擁有權），zod 驗證於 `src/lib/dashboard/schemas.ts`。**不重用** admin generic CRUD（那是 admin-only 且無 userId 過濾）。 |
| `/api/feedback` | **問題回報送出（2026-08）**：POST，僅 `getUserSession` 守衛（**無 `requirePlan`**）＋ **每會員每日 10 則 rate limit**（`feedback:<userId>`，取代付費牆的成本／濫用護欄）。zod 驗證（描述至少 10 字——一句「壞掉了」無法重現）；`userAgent` 由 server 從 header 取並截斷 500 字，**不信 client 傳入**。 |
| `/api/admin/feedback/[id]` | **後台處理回報（2026-08）**：PATCH 改 `status` / 寫 `adminReply`（會員看得到）、DELETE 刪除。會員填寫的內容一律唯讀（保留原始事證）。`resolvedAt` 於**首次進入終局狀態**（`resolved`/`wontfix`）時蓋章，被重新打開就清掉，讓處理時長永遠對應目前這一輪。 |
| `/api/copilot` | **AI Copilot 串流**：Pro / Business / Enterprise 與有效 trial 每個 entitlement 月含 150 次成功回答，按訂閱／trial 開始日每月重置（年繳仍按月）。DB reservation 防多分頁超發；只有 Anthropic 串流完整成功才確認消耗，失敗立即釋放。基本額度用完再使用永久 bonus；全部用完回 429 並引導 Billing。 |
| `/api/action-plans/*` | **結構化 NOVA Action Plan API（2026-08）**：`diagnose` 每會員每日 40 次請求（約十輪完整診斷），系統逐題詢問固定三題、三份回答後才呼叫 AI；`generate` 拒絕不足三份回答。讀取最多 30 則當前 client 對話，NOVA 對話由 CopilotTurn 持久化；`generate` 最近 24 小時最多 3 份成功計畫（失敗不占成功次數），另有每日 10 次請求保護；生成期間比對啟用計畫版本，衝突回 409；`requestId` 冪等，Anthropic strict tool schema 對新請求固定生成 5 項（舊計畫仍可保留 20–100 項），route 最長執行時間為 300 秒。生成採每批最多 2 項逐批累積，後批會收到既有 key/title 並只能依賴先前或同批較早的 Action；每批使用動態 `action1…actionN` 必填欄位，而非 strict schema 無法限制長度的陣列，因此供應商不能再只回 1～2 項。兩項上限依 Anthropic 官方「schema 過於複雜時拆成多次請求」原則與正式 grammar 探針決定；Action tool 使用單層欄位，已確認的 stage／bottleneck 由伺服器注入，避免重複的巢狀 schema 與大型 enum 超過內部 grammar 限制，DTO、Zod 與 DB 仍保留全部八維資料。這同時避開不支援 `minItems` 的限制並天然阻止跨批循環。AI 輸出層以 `0`／空字串表示 nullable 值並在 Zod 信任邊界還原，避免 union 欄位超過供應商 16 個上限。數值範圍寫入欄位說明並由原有 Zod 契約再次驗證，避免 `minimum`／`maximum`／`minItems`／`maxItems`／過量 `anyOf` 回 400；回歸測試會阻止這些關鍵字重新進入 tool schema。AI 的 Immediate／Urgent `urgencyDays` 會標準化為 `null`；Scheduled 缺天數仍由 Zod 拒絕。每次完整生成至多允許一次無效批次 repair；湊滿指定數量後再由 Zod 驗證 enum/時間/Fit/clientKey/同計畫依賴與循環，仍失敗零寫入。`actions` POST 與 `actions/[id]` PATCH/DELETE 完整 userId+active plan scope，每計畫上限 100。Builder 先讀取原始 response text 再解析 JSON，Vercel timeout 等非 JSON 回應會完整顯示 HTTP status 與原文，不再退化成瀏覽器的 pattern 例外。所有路由沿用 session、Pro gate、`{data}`/`{error}`；4xx 業務錯誤完整回傳，非預期 500 僅回安全錯誤碼並保留 server log。Active plan 的診斷與 Next 3 同步加入後續 `/api/copilot` system context。 |
| `/api/billing/subscribe\|confirm\|cancel` | `plan + interval + requestId` 建立／變更／確認／取消 USD 訂閱。同 Product USD 方案走 PayPal revise 並要求會員重新同意；舊 TWD 轉換用舊週期結束日作 future start，新方案核准後才取消舊方案。 |
| `/api/billing/credits/*`、`/api/ai-usage` | PayPal Orders v2 建立/capture USD 5 額度包；order id、requestId、capture id unique，return 與 webhook 重送只入帳一次。`GET /api/ai-usage` 回 included/used/remaining/bonus/reset。 |
| `/api/investor-portal/*`、`/api/investor/invitations/accept` | Business owner-scoped CRUD、私密 PDF、Resend 邀請／撤銷與投資人接受。CRUD 跨公司回 404；每天每公司 20 封、同 Email 5 次；寄信錯誤完整顯示可重試，憑證與內部堆疊不下送。 |
| `/api/admin/users/[id]/trial` | admin session 才能建立、延長或撤銷 Pro / Business 限時試用；後台明確標出沒有 PayPal subscription id 的舊假 ACTIVE。 |
| `/api/billing/webhook` | PayPal 簽章驗證、事件審計與訂閱對帳；另處理 `PAYMENT.CAPTURE.COMPLETED` 額度入帳。重送安全，非預期錯誤只回安全 code、完整細節留 server log。 |

2026-09-29 Meeting notes 編輯版面：桌面採左側筆記摘要清單、右側約 2/3 寬的大編輯區；點標題或 Edit 載入全文，新增按鈕切換空白表單。內容框至少 18 行且可垂直拉高；手機版上下排列、清單限制高度。保留原有新增／更新／刪除 API 與完整錯誤顯示；切換筆記、新增或取消前會確認是否放棄未儲存內容，請求進行中停用編輯／切換，避免覆蓋草稿。不需修改資料庫。`pnpm exec tsx --test tests/notes-editor.test.ts` 驗證拒絕放棄時保留草稿、確認後切換及取消、重選同筆不覆蓋。新增／更新／錯誤保留草稿以本機模擬 API 操作驗收，390px 手機版無橫向溢出；35 項測試、型別檢查與正式建置通過。正式部署 `roll-k0ge1j78s-erics-projects-57e51613.vercel.app` 已生效至 `www.rollgrp.com`，登入實測左側 354px／右側 708px、0 筆記錄與 Business 權限維持。

2026-09-29 會員首頁標註調整：移除 Key Metrics 列與其統計計算，創辦人配對區改為 Investor DD & Global Founder Hub 預告；影片改標 Golden Ticket Podcast，AI 區改標 POLARIS 並移除創辦人配對／探索企業捷徑，保留里程碑、公司檔案及原有對話與行動計畫。企業區標 TOP COMPANIES ROADMAPS／Reference templates & benchmarks，活動區標 NOVA AI Event／Virtual & in-person events for founders。新顯示名稱使用對應語意翻譯鍵，避免舊 CMS 標題覆蓋新標註；未改寫 CMS 資料。候補 CTA 經既有 `/api/contact` 將會員姓名、Email 與固定候補訊息存入 `ContactMessage`，在 `/admin/messages` 查看；回到首頁會依登入會員 Email 與該候補訊息確認已登記，前端完整顯示錯誤並允許重試。僅為候補登記，不改會員方案、不自動寄信、不需 schema 更新。`tests/hub-waitlist.test.ts` 以模擬回應驗證送出契約、完整錯誤、重試與避免重送，不寫入正式候補資料。

UI 元件在 `src/components/dashboard/`（含 `ActionPlanBuilder`、`ActionPlanManager`、Dashboard `ActionPlanOverview` 與保留 legacy 區的 `AgendaBoard`）。Action Plan 的分類、Zod 契約、排名、Dashboard priority/progress 純函式、分鐘格式、AI strict tools 與 persistence service 集中在 `src/lib/action-plan/`；`tests/action-plan.test.ts` 覆蓋權重、公式、分鐘相容與格式、Dashboard precedence/progress、完成排除、Required gate、依賴解除、循環與 5/20/24/100 邊界。i18n 的 `Dashboard.actionPlan` 與 `Dashboard.home.actionSummary` 在 en/zh-tw 保持平行。新資料表 `ActionPlan` / `ActionItem` / `ActionDependency` 與分鐘欄位皆為純新增，`ActionPlan.activeKey` nullable unique 保證每位會員最多一份 active plan，`[userId, requestId]` 保證生成冪等；舊 `LandingTask` / `checklistState` 不回填。連同既有新資料表與欄位一律使用 `pnpm db:push`，禁止 `--accept-data-loss`。其餘 Dashboard 元件、CRM、Billing、Playbook、Feedback 與安全架構維持既有契約。

**入口接通**：登入 / onboarding / 測驗完成後由 `destinationFor`（`src/lib/auth/onboarding.ts`，`completed → /dashboard`）導向後台；全站 Navbar 有「會員中心」入口（靜態連結 → `/dashboard`，未登入由 proxy 導 `/login`）。

### 方案與 gating

- 方案與真實收款單一事實來源：`src/lib/billing/plans.ts`。Pro = USD 49/月、USD 468/年；Business = USD 149/月、USD 1,668/年；Enterprise 只聯絡報價。公開 Pricing 與 Billing 都由相同 amountMinor 產生，不顯示虛構原價。Free 是未訂閱狀態，不能使用 Action Plan。
- gating：`src/lib/billing/gate.ts` 的 `getEffectivePlan` / `getUserPlan` / `requirePlan`。**兩種寬限期，起算點刻意不同**：
  - **ACTIVE / CANCELLED** → 需 `currentPeriodEnd > now`。已取消者付到本期末才降級；即使 PayPal 漏送 CANCELLED，到期也會自動降級。
  - **SUSPENDED（扣款失敗）** → 走 `SUSPENDED_GRACE_MS`（**1 天**），以 `planUpdatedAt` 起算，**刻意不看 `currentPeriodEnd`**。因為扣款失敗的時間點正是本期到期日，SUSPENDED 時 `currentPeriodEnd` 必然已過期，且 PayPal 轉 SUSPENDED 前會先重試扣款數天 — 若用 `currentPeriodEnd` 當起點，寬限期會在 SUSPENDED 事件送達前就過完＝完全沒有寬限。設計意圖：最常見的扣款失敗原因是信用卡到期，給 1 天讓客戶更新付款方式，避免長期客戶在收到通知前就先失去存取。UI 用 `suspendedGraceEndsAt` / `suspendedGraceActive`（時間比較收在 gate 內，server component render body 直接呼叫 `Date.now()` 會違反 `react-hooks/purity`）。
  - **前提**：`reconcile` 只在 plan/status **真的變化**時才更新 `planUpdatedAt`。若每次對帳都無條件刷新，PayPal 的重送／重複投遞會不斷延長寬限期，讓扣款失敗的帳號無限期保有付費存取。
  - `BILLING_REQUIRE_EXPLICIT_ENTITLEMENT=true` 後，Pro／Business 必須有 PayPal subscription id 或未到期 trial；舊 `plan=pro + ACTIVE` 假資料不再授權。切換前需先在 `/admin/users` 逐戶設定 trial。有效付費與 trial 同時存在時取較高方案；`enterprise` 由站方人工管理。
- **Investor Portal 的兩層隱藏（Business vs Enterprise）**：
  - **Business 以上** — `InvestorPortal.share*` 七個 section 開關（Profile / stage-bottleneck / Action Plan / KPI / Milestone / Update / Business Plan），以及 KPI 時間序列數值（`InvestorKpiPoint`）的維護。
  - **Enterprise** — 逐欄位隱藏（`InvestorPortal.hiddenFields`，白名單見 `src/lib/investor/fields.ts`）與逐筆隱藏（`InvestorKpi/Milestone/Update.hidden`）。
  - **關鍵規則：受方案限制的是「修改」，不是「生效」。** `getInvestorView()` 一律無條件套用 `hiddenFields` 與 `hidden`，與擁有者當下方案無關。若把套用也綁在 Enterprise 判斷後面，Enterprise 降級成 Business 的瞬間，刻意藏起來的種子資金／營收會突然對所有已接受邀請的投資人曝光——那是資料外洩，不是降級。降級後 owner 端該區塊轉為唯讀並標示「仍生效」。
  - API 只在請求**真的帶了** `hiddenFields` / `hidden` 時才做 Enterprise 檢查，否則 Business 連 section 開關與一般內容編輯都會被 403 擋下。對應地，前端存檔必須逐欄位組 payload，不可 spread 整個 item state。
  - 投資人頁不會看到 NOVA 的內部評分：`InvestorActionView` 是明確白名單（`id` / `rank` / `title` / `outcomeText` / `outcomeCategory` / `done`），刻意不 spread `ActionPlanActionDto`。
- DAL：`src/lib/auth/account.ts` 的 `getCurrentAccount()`（React `cache()` 包裝、回安全 DTO，不含 passwordHash；含 `hasPassword` 布林、`checklistState`、`milestoneConfig`，以及 `planUpdatedAt`——SUSPENDED 寬限期的起算點，gate 需要它才能算寬限期）。

### PayPal 訂閱流程

1. **一次性設定**：`node --env-file=.env.local scripts/paypal-setup.mjs` 預設只 dry-run；加 `--apply` 才在同一 NOVA Product 建立缺少的四個 USD plans。腳本會按既有 env id / Product 內同名 plan 重用，遇到 id 漂移直接停止，不重複建立。舊 TWD plan id 保留歷史對帳，停止新 checkout。
2. **訂閱**：Billing 月／年切換 → `POST /api/billing/subscribe` → PayPal 核准 → return confirm。USD 互換走 revise，未重新同意時舊方案照常；舊 TWD 若存在則 future-start，新 USD 核准成功後才取消舊訂閱。
3. **對帳權威來源**：`/api/billing/webhook`（驗章 → `WebhookEvent` 審計 → `reconcileById` 以 PayPal 為準更新 `User` + `Subscription`）。`reconcile` 為 idempotent，故 webhook 失敗回 500 讓 PayPal 重送是安全的。
4. PayPal 直打 REST（無 SDK／新套件）；subscription checkout 與 USD 5 credit order 都有 idempotency key。`scripts/paypal-reconcile.mjs` 預設唯讀輸出差異，只有 `--apply` 才補建缺少的 Subscription 稽核紀錄，永不刪除或降級 User。

> **schema 演進零資料遺失**：計費欄位 / 表全為 nullable 或有 default 的純疊加；用 `prisma db push`，**禁止 `--accept-data-loss`**（若 push 要求該旗標代表改成破壞性了，需退回改正）。
>
> **台灣電子發票（上線阻擋條件）**：本 Epic 不做自動開票；新 USD 正式收款公開前，必須指定人工電子發票責任人與處理流程。PayPal 收據不能當成台灣電子發票。

### Production 上線（Vercel）

正式站 canonical = **`https://www.rollgrp.com`**（apex `rollgrp.com` 會 307 導向 www）。⚠️ **webhook 與 `NEXT_PUBLIC_APP_URL` 一律用 `www`**，避免 PayPal POST 經過重新導向。Vercel Functions 固定 `sin1`，與 Neon `ap-southeast-1` 同區；region 設定見 `vercel.json`。

Production 直接使用 PayPal Live；帳號持有人須在 Vercel UI 安全輸入 secrets，不經聊天、shell history 或 Git：

1. 先以 additive Prisma diff 確認沒有 drop／rename／重建，再執行 `pnpm db:push`；禁止 `--accept-data-loss`。部署 trial 後台，為舊人工 Pro 帳號設定真實期限，最後才把 `BILLING_REQUIRE_EXPLICIT_ENTITLEMENT` 切為 `true`。
2. Sandbox 以 `scripts/paypal-setup.mjs --apply` 建四個 USD plans，測月／年、revise、future-start 與 USD 5 capture；webhook 必須包含訂閱事件、`PAYMENT.SALE.COMPLETED` 與 `PAYMENT.CAPTURE.COMPLETED`。
3. 設定獨立 Private Blob token、Resend key/from，完成寄件網域 SPF／DKIM；不得沿用公開圖片 Blob store。
4. Live 建四個 plans，更新 Vercel Production env，並以唯讀 API 驗證 Anthropic、PayPal OAuth、四個 plan ACTIVE、webhook 事件與 Resend／Blob 設定；再跑 `pnpm test`、`pnpm lint`、`pnpm build`。
5. 從乾淨隔離 worktree 執行 Production deploy，避免把其他未提交修改一起上線；`NEXT_PUBLIC_APP_URL` 是 build-time 設定，必須先完成環境更新。
6. 只用已授權正式測試帳號完成 USD 訂閱、150 次週期、額度加購、Investor 邀請／撤銷／私密 PDF；不得自行建立、升級或刪除其他會員。驗收取消不自動退款，保留已付期間權限。
7. 驗收時檢查 webhook response 的 `x-vercel-id` 含 `sin1`，並監看 Vercel server log。使用者只會看到通用錯誤，完整上游錯誤只留後端。

既有 orphan `APPROVAL_PENDING` 不刪除、不覆寫；它保留作為跨 PayPal app 設定漂移的審計證據。webhook 腳本重跑也只補事件、不改任何訂閱資料。任何 schema 操作都禁止 `--accept-data-loss`。

### 2026-09-11 正式版檢查與更新

檢查對象：`www.rollgrp.com` → deployment `dpl_A1ZcsaAK4P493mLfkxmJQTPVwke3`，Git commit `11946921ef435c650b919a606e3435129403b94e`，狀態 Ready。首次檢查後，經使用者授權已套用純新增 DB 結構，並建立、連接獨立 Private Blob。未修改會員或既有訂閱，未寄信、建立測試帳號或實際扣款；原有 Anthropic／PayPal Sensitive 金鑰保持不變。

| 優先序 | 已確認問題 | 影響與必要處理 |
| --- | --- | --- |
| 已完成 | 正式 DB 已同步 | 已新增 `InvestorKpiPoint`、`InvestorPortal.hiddenFields`、`InvestorKpi.hidden/unit`、`InvestorMilestone.hidden`、`InvestorUpdate.hidden` 及相關索引／外鍵；使用隔離正式連線執行 `prisma db push`，未使用資料遺失旗標，更新後 diff 為 `No difference detected`。 |
| 待正式 runtime 驗證 | 更正 Anthropic 金鑰檢查 | 前次 CLI 呼叫 `/v1/models` 的 401 是因 Sensitive 金鑰下載為空值，**不是正式金鑰失效的證據**。本機專案金鑰可取得模型清單，但不能據此推論正式金鑰狀態；未替換正式金鑰，也未做付費生成測試。PayPal Sensitive 憑證亦不可用 CLI 下載值驗證。 |
| 已設定並部署（2026-09-14） | 四個 USD PayPal Plan ID | 已依使用者提供的方案名稱與 ID 設定 Production，對照見下表；隔離本機 env 後四個值均驗證一致。舊 `PAYPAL_PLAN_ID_PRO/BUSINESS` 與 Sensitive 憑證保持原樣。PayPal 實際金額、週期及付款流程仍待驗收。 |
| P1 | Production 缺 `RESEND_API_KEY`／`RESEND_FROM_EMAIL` | Investor 邀請無法寄送；需設定已驗證寄件網域與金鑰，再重新部署。未實際寄信。 |
| 已完成 | Investor Private Blob | 已建立 `roll-investor-business-plans`（`store_TDpORmqOaIHYsR0y`，`sin1`，Private），僅連接本專案 Production，自訂 prefix `INVESTOR_BLOB` 產生 `INVESTOR_BLOB_READ_WRITE_TOKEN`；保留原公開圖片 store 與 token。已重新部署使設定生效。 |

更新前正式 DB → `prisma/schema.prisma` 的完整 diff 只有上述新增欄位、新表、兩個索引及外鍵，沒有 DROP、rename、重建或資料回填；Action Plan／AI allowance／trial 等較早變更已無 schema 差異。正式 DB 更新前仍須重新 diff，確認期間沒有其他變更；只針對確認的正式連線操作，禁止 `--accept-data-loss`，不需重跑 seed。`pnpm build` 的 `prisma generate` **只產生 client，不會更新 DB**，因此 Vercel Ready 並不能證明 schema 已同步。

驗證：`pnpm test` 34/34 通過、`pnpm lint` 0 errors／2 個既有 warnings、`pnpm build` 通過（另有既有 NFT tracing warning）。正式首頁、英／中產品頁、登入頁 HTTP 200；未登入 Investor／Dashboard 正常導向登入，受保護 API 回 401。正式 `PAYPAL_ENV=live` 與 `NEXT_PUBLIC_APP_URL=https://www.rollgrp.com` 正確。未完成登入後互動、付款、邀請、PDF 與 AI 生成端到端驗收，不能以公開頁面 200 推論這些功能正常。

更新驗收：同一 commit 已重新部署為 `dpl_3AoVKRcT4dkQQ5tu2KXg2PfjQvpn`（`https://roll-75p0q0pkc-erics-projects-57e51613.vercel.app`），Ready 並已接上 `www.rollgrp.com`。正式 Prisma 可讀取 Portal 與 KPI points 等關聯；獨立 Private Blob token 可正常執行唯讀 list。部署後首頁、英／中產品頁 HTTP 200；Dashboard 未登入導向登入；PDF 上傳 token 入口對未登入請求回 401，已通過原先會阻擋的私密儲存設定檢查。未實際上傳會員文件。

2026-09-14 PayPal Production 設定（ID 由使用者提供；金額是網站預期值，尚未從 PayPal 後台獨立核實）：

| 使用者方案名稱 | Production 變數 | Plan ID | 網站預期收費 |
| --- | --- | --- | --- |
| NOVA AI PRO | `PAYPAL_PLAN_ID_PRO_MONTHLY_USD` | `P-4N9467757S0676023NKTIQVY` | USD 49／月 |
| NOVA AI PRO 12 months | `PAYPAL_PLAN_ID_PRO_YEARLY_USD` | `P-1M717124B4455531ENKTJKVQ` | USD 468／年 |
| NOVA Business | `PAYPAL_PLAN_ID_BUSINESS_MONTHLY_USD` | `P-33E98130HA1920135NKTJQZY` | USD 149／月 |
| NOVA Business (12 months) | `PAYPAL_PLAN_ID_BUSINESS_YEARLY_USD` | `P-0DX10850JY725084FNKTJX5I` | USD 1,668／年 |

沿用既有後端 checkout／webhook 流程，沒有嵌入使用者貼上的 PayPal 按鈕程式。公開 PayPal 方案入口導向登入／訪客 Email 頁，未取得收費摘要；未輸入付款資料或完成訂閱。Sensitive Client ID／Secret 無法透過 CLI 讀回，不能據此聲稱已核實商家帳號相容性或付款成功。

部署驗收：以當時正式 commit `a90654d6bf2c0bf6c235c7946d611060775c70d8` 重新部署，產生 `dpl_B1YeWJymMFxygipRfzduxFPXQHvD`（`https://roll-gou153y9m-erics-projects-57e51613.vercel.app`）並接上 `www.rollgrp.com`。Build 通過；英／中產品頁 HTTP 200、未登入 Billing 導向登入、訂閱 API 拒絕未登入請求（401）。本次沒有資料庫結構或資料異動。

仍待補齊：Resend 金鑰及已驗證寄件地址；已請使用者透過 Vercel Production 安全設定，不在聊天貼憑證。設定完成後需再次部署並使用已授權測試帳號驗收。往後發布需把 schema 差異與必要環境變數檢查納入上線條件，Sensitive 值則在實際部署環境驗證。

2026-09-14 補充非扣款驗證（使用者回報先前 Sandbox 付款與訂閱啟用已測試，本次未重跑）：

- `pnpm test` 34/34 通過；`pnpm lint` 無錯誤，保留 Navbar hook dependency、TaiwanMap unused import 兩項既有 warnings。
- 正式 DB 唯讀 `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` 回報 `No difference detected`；不需再次更新結構，未修改會員或訂閱資料。
- 正式 API 共 17 項未登入／無簽章／格式錯誤檢查符合預期：Investor、邀請接受、AI 生成／診斷／Copilot、Billing、額度、試用管理等拒絕未登入請求（401），不支援的 milestones POST 回 405；webhook 無簽章回 401、無效 JSON 回 400。這不代表已驗證合法 webhook 簽章或登入後操作。
- 使用獨立 Private Blob token 上傳合成測試位元組、授權讀回逐 byte 比對成功；匿名讀取回 403。測試物件已刪除，prefix list 確認無殘留。這是儲存層驗證，未驗收完整 PDF 格式、應用程式上傳介面或會員文件權限流程。
- 對實際 `billing/gate.ts` 原始碼做一次性純函式檢查，僅隔離 server-only／帳號讀取依賴：24 項通過，涵蓋到期當刻、取消後已付期間、pending／expired、24 小時 SUSPENDED 寬限期邊界、嚴格訂閱 ID 要求、試用起迄、較高方案優先及人工 Enterprise。未讀寫會員資料；不是正式帳號端到端驗收。
- 可查的近 3 日 Vercel error logs 無結果；正式 DB 近 3 日 AiUsage、ActionPlan、WebhookEvent 查無紀錄。訂閱狀態彙總只有 2 筆 `APPROVAL_PENDING`，InvestorPortal 為 0 筆。因此沒有近期正式成功使用的紀錄可供佐證，不能據此宣稱 AI、付款啟用或 Investor 完整流程已通過。

確定待補項仍為 Production 的 `RESEND_API_KEY`／`RESEND_FROM_EMAIL`；正式 AI 生成、PayPal Live 實際金額／週期及付款啟用、邀請信與登入後 PDF 操作仍未驗收。本次僅新增驗證紀錄，沒有應用程式碼變更或新部署。

2026-09-14 Resend 設定進度：已依使用者授權進入 Resend，建立 `rollgrp.com` 的網域設定流程（ID `606a0cbe-602a-466c-af81-6820099f617c`，Tokyo）。權威 DNS 為 GoDaddy；自動設定目前停在 GoDaddy 登入頁，等待使用者完成登入／兩步驟驗證。所需紀錄為 `resend._domainkey` TXT、`send` TXT（`v=spf1 include:amazonses.com ~all`）、`send` MX（`feedback-smtp.ap-northeast-1.amazonses.com`，priority 10）；Receiving 保持關閉。尚未修改 DNS、建立寄信金鑰、寫入 Vercel env 或寄出郵件；既有其他專案網域與金鑰保持原樣。網域完成後再建立僅供此網域使用的 Sending access 金鑰並部署。

2026-10-03 13:50（Asia/Taipei）Resend 寄件網域驗證完成：使用者授權新增三筆 DNS 並親自完成 GoDaddy 簡訊驗證；GoDaddy 顯示成功，權威名稱伺服器查詢確認 `resend._domainkey` TXT、`send` TXT 與 priority 10 的 `send` MX 內容正確。Resend 的 `rollgrp.com` 網域及三筆紀錄皆為 Verified。此次僅新增三筆 DNS，保留既有 Vercel A／CNAME、DMARC 與其他紀錄，Receiving 保持關閉。尚未建立／讀出 API 金鑰、寫入 Vercel 環境變數、部署 Rewards 或寄出測試郵件；每日提醒仍未啟用。後續需設定限定此網域的 Sending access 金鑰與寄件地址，完成測試帳號的收信及退訂驗收後再啟用提醒；Verified 不代表實際郵件送達。

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

## 公司分析頁（Company Profiles，FinMind 驅動）

英文版台股上市公司深度分析頁，風格對標 startups.rip。**詳情** `/company/[slug]`（**會員限定**，未登入由 `proxy.ts` 導 `/login`）。公開目錄列表頁 `/company` 已移除，改由**後台** `/[locale]/dashboard/companies` 呈現清單（每張卡仍連 `/company/[slug]`）。

- **資料**：純檔案 JSON，每家一檔於 `content/companies/<slug>.json`，build 時由 `src/lib/company/content.ts` 以 `fs` 讀取（無 DB；Vercel FS 唯讀也能用）。
- **事實來源**：FinMind 開放 API（月營收、損益、資產負債、現金流、股利、估值、股價）→ 由外部 ingest 管線 `tw-industry-report/ingest/pipeline.py <ticker> --no-generate` 正規化後寫入。**所有數字必為 FinMind 來源**。
- **英文分析**：10 段（overview / founding-story / timeline / financing / thesis / business-model / industry / swot / risks / outlook），由 Claude Code 親手撰寫並逐一**查證**（交叉比對維基/官方財報/新聞），不捏造、最高級用語需來源、虧損/循環/槓桿誠實兩面講。
- **渲染韌性**：缺指標自動略過（如金控無毛利率/ROE；92% 負債比為存款＋保險準備金的正常結構，非危機）。
- **狀態**：**會員限定（台灣企業智庫）** — `/company/**` 已納入 `proxy.ts` 登入保護，未登入一律導 `/login`；`noindex`、未上公開導覽列，清單入口為後台 `/[locale]/dashboard/companies`。

| Ticker | Slug | 公司 | 產業 |
|---|---|---|---|
| 1216 | `uni-president` | Uni-President Enterprises | Food & Beverage |
| 2330 | `tsmc` | TSMC | Semiconductors |
| 2317 | `hon-hai` | Hon Hai (Foxconn) | Electronics Manufacturing |
| 2412 | `chunghwa-telecom` | Chunghwa Telecom | Communications & Networking |
| 1476 | `eclat-textile` | Eclat Textile | Textiles & Apparel |
| 9921 | `giant` | Giant Manufacturing | Bicycles |
| 6472 | `bora` | Bora Pharmaceuticals | Pharmaceuticals (CDMO) |
| 2727 | `wowprime` | Wowprime | Restaurants |
| 2603 | `evergreen-marine` | Evergreen Marine | Shipping |
| 2881 | `fubon-financial` | Fubon Financial Holding | Financials |
| 3034 | `novatek` | Novatek Microelectronics | Semiconductors (fabless) |
| 2548 | `huaku` | Huaku Development | Real Estate & Construction |
| 4147 | `taimed` | TaiMed Biologics（TPEx 上櫃） | Biotech & Healthcare |
| 1304 | `usi` | USI Corporation 台聚 | Plastics（commodity petrochemical） |
| 3293 | `igs` | International Games System 鈊象（TPEx 上櫃） | Gaming & Digital Entertainment |
| 2618 | `eva-air` | EVA Air 長榮航空 | Airlines |
| 9904 | `pou-chen` | Pou Chen 寶成工業 | Footwear Manufacturing |
| 2015 | `feng-hsin` | Feng Hsin Steel 豐興鋼鐵 | Steel |
| 2731 | `lion-travel` | Lion Travel 雄獅旅遊 | Travel Services |
| 6469 | `great-tree` | Great Tree Pharmacy 大樹醫藥（TPEx 上櫃） | Pharmacy Retail |
| 2327 | `yageo` | Yageo 國巨 | Electronic Components |
| 9908 | `great-taipei-gas` | Great Taipei Gas 大台北瓦斯 | Gas Utility |
| 2408 | `nanya-tech` | Nanya Technology 南亞科 | Semiconductors（DRAM） |
| 2308 | `delta-electronics` | Delta Electronics 台達電子 | Power Electronics |
| 3711 | `ase` | ASE Technology 日月光投控 | Semiconductors（OSAT） |
| 1101 | `taiwan-cement` | Taiwan Cement 台灣水泥 | Cement |
| 2454 | `mediatek` | MediaTek 聯發科 | Semiconductors（fabless SoC） |
| 2303 | `umc` | United Microelectronics (UMC) 聯電 | Semiconductors（mature-node foundry） |
| 2207 | `hotai-motor` | Hotai Motor 和泰汽車 | Automotive |
| 3008 | `largan` | Largan Precision 大立光 | Optoelectronics |
| 5871 | `chailease` | Chailease Holding 中租控股（中租-KY） | Leasing & Finance |
| 2912 | `president-chain-store` | President Chain Store 統一超商（7-ELEVEN） | Convenience Retail |
| 2395 | `advantech` | Advantech 研華科技 | Industrial Computing & IoT |
| 1722 | `taiwan-fertilizer` | Taiwan Fertilizer 台灣肥料 | Chemicals（land-asset / NAV play） |
| 2382 | `quanta` | Quanta Computer 廣達電腦 | Computer & Server ODM |
| 1210 | `dachan` | Dachan Great Wall 大成長城 | Agribusiness & Food |
| 2707 | `formosa-hotels` | Formosa Int'l Hotels 晶華國際酒店（Regent） | Hotels & Hospitality |
| 5274 | `aspeed` | Aspeed Technology 信驊科技（TPEx 上櫃） | Semiconductors（BMC monopoly） |
| 2409 | `auo` | AUO Corporation 友達光電 | Display Panels（commodity TFT-LCD / 雙軸轉型） |
| 2634 | `aidc` | AIDC 漢翔航空工業 | Aerospace & Defense（國機國造 / F-16 MRO；薄利） |
| 9933 | `ctci` | CTCI 中鼎工程 | Engineering & Construction（EPC 統包；BKRF 踩雷） |
| 2105 | `maxxis` | Cheng Shin Rubber 正新橡膠（Maxxis） | Tires & Rubber（全球品牌；高息價值股） |
| 1319 | `tong-yang` | Tong Yang Industry 東陽實業（TYG） | Auto Parts（AM 碰撞件全球第一；業外撐獲利） |
| 3702 | `wpg` | WPG Holdings 大聯大控股 | Electronics Distribution（亞洲最大半導體通路；薄利/成長吞現金） |
| 1907 | `yfy` | YFY 永豐餘投控（Yuen Foong Yu） | Paper & Materials（百年紙業控股；本業虧/靠 E Ink；0.57× 淨值） |
| 2345 | `accton` | Accton 智邦科技 | Networking Hardware（白牌交換器全球龍頭；AI 網通成長贏家／估值貴） |
| 2885 | `yuanta-financial` | Yuanta Financial 元大金控 | Financials（證券/ETF 為主金控；0050·0056；ETF 狂潮順風／經紀循環） |
| 2903 | `feds` | Far Eastern Department Stores 遠東百貨 | Department Stores（最大百貨集團+SOGO；高息近淨值；58% 毛利為抽成假象） |
| 3037 | `unimicron` | Unimicron 欣興電子 | PCB & IC Substrates（全球最大載板廠／ABF 近寡占；深度循環；估值已 price 滿） |
| 1301 | `formosa-plastics` | Formosa Plastics 台塑 | Petrochemicals（台塑集團旗艦；史上首虧／靠轉投資撐／跌破淨值；中國產能過剩） |
| 2201 | `yulon` | Yulon Motor 裕隆汽車 | Automotive（汽車先驅；自有品牌夢碎→2025 賣 Luxgen 給鴻海；0.47× 淨值深度價值） |
| 1565 | `st-shine` | St. Shine Optical 精華光學（TPEx 上櫃） | Contact Lenses（全球最大隱形眼鏡 ODM；昔日暴利→結構性褪色；無負債高息／跌破淨值） |
| 1707 | `grape-king` | Grape King Bio 葡萄王生技 | Health Supplements（靈芝樟芝 >50% 市佔；70% 毛利／15% ROE／6.6% 高息；近期溫和退溫） |
| 2049 | `hiwin` | Hiwin Technologies 上銀科技 | Motion Control & Automation（滾珠螺桿/線性滑軌世界 #2-#3；深度循環復甦；人形機器人題材／估值貴） |
| 9911 | `sakura` | Taiwan Sakura 台灣櫻花 | Home Appliances（廚衛家電第一品牌；安裝基礎服務護城河；22% ROE 穩定複利／6% 高息成長） |
| 8454 | `momo` | Fubon Multimedia 富邦媒體科技（momo） | E-Commerce（最大 B2C 電商／衛星倉物流；1P 薄利高週轉；蝦皮酷澎夾殺、EPS 3 年 −30%） |
| 9917 | `taiwan-secom` | Taiwan Secom 中興保全科技 | Security & Smart Services（台灣首家保全／契約經常性收入；21% ROE、5.6% 高息；轉型智慧城市） |
| 6409 | `voltronic` | Voltronic 旭隼科技 | UPS & Solar Inverters（新興市場離網電力隱形冠軍；30% ROE／千金股；銀銅匯率紅海關稅多重擠壓） |
| 8422 | `cleanaway` | Cleanaway 可寧衛 | Waste Management & Environmental（有害廢棄物龍頭／許可證護城河；1拆10 與 BOT 認列兩大數據陷阱已釐清） |
| 3661 | `alchip` | Alchip 世芯-KY | ASIC Design Services（雲端巨頭 AI 晶片 turnkey；營收腰斬但毛利破 50%＝組合假象，非變強） |
| 2891 | `ctbc-financial` | CTBC Financial 中國信託金融控股 | Financials（銀行引擎金控；FY2025 淨利 806 億／ROE 16.9% 業界之冠；2.25× 淨值溢價） |
| 2633 | `thsrc` | Taiwan High Speed Rail 台灣高鐵 | Rail Transport（特許獨占至 2068；營益率 43% 但淨利率 15%＝利息吃掉；BOT 失敗→國有民營） |
| 6488 | `globalwafers` | GlobalWafers 環球晶圓（TPEx 上櫃） | Silicon Wafers（全球前三大矽晶圓；EPS 自峰 −66%、股利 25→7.7；CHIPS 補助＋美光 10 年約） |
| 3529 | `ememory` | eMemory 力旺電子 | Semiconductor IP（純 IP 授權；毛利 100%＝模式產物，營益率 60% 才是真；ROE 46%／P/B 41×） |
| 1519 | `fortune-electric` | Fortune Electric 華城電機 | Heavy Electrical Equipment（AI 電網瓶頸；Stargate 變壓器單、在手 300 億到 2028；P/B 27.9× 且月營收轉負） |
| 5904 | `poya` | Poya 寶雅國際（TPEx 上櫃） | Beauty & Lifestyle Retail（美妝生活雜貨約 9 成市佔；45% 毛利／46% ROE；FinMind P/E 196× 為錯誤，實為 ~20×） |
| 2002 | `china-steel` | China Steel 中國鋼鐵 | Steel（132 萬股東的國民股；FY2025 轉虧 EPS −0.29、股利 3.1→0.15；中國產能過剩） |
| 6669 | `wiwynn` | Wiwynn 緯穎科技 | Cloud & AI Server ODM（全球前三大 AI 伺服器 ODM／CSP-only；EPS 81→275；但毛利僅 7.5%、OCF −162 億） |
| 6214 | `systex` | Systex 精誠資訊 | IT Services（最大系統整合；AI 剛需帶動 Q1 獲利 +164%、6 月營收 +77%；營益率僅 4.9%） |
| 2646 | `starlux` | STARLUX 星宇航空 | Airlines（2020 開航即遇疫情；營收 +40%、機隊拚 43 架；獲利仍微薄、P/E 240× 為近零獲利假象） |
| 2059 | `king-slide` | King Slide 川湖科技 | Precision Mechanical Components（伺服器滑軌全球約 3 成／毛利 77.7%；6 月營收 +220%；P/B 25× 且 2025Q2 有未解一次性） |
| 8299 | `phison` | Phison 群聯電子（TPEx 上櫃） | NAND Flash Controllers（NAND 控制晶片＋模組；2026Q1 單季 EPS 68.8 超越全年；庫存 722 億是雙面刃） |
| 2723 | `gourmet-master` | Gourmet Master 美食-KY（85°C） | Restaurants & Bakery（中國關 180 店、認列逾 10 億減損轉虧；美國雙位數成長、台灣連 4 季正成長） |
| 2383 | `emc` | Elite Material 台光電 | Copper-Clad Laminates（高速 CCL 全球市佔第一／M7 以上逾 6 成；月營收 +120%，但毛利平穩＝純量增，P/B 33×） |
| 2449 | `kyec` | King Yuan Electronics 京元電子 | Semiconductor Testing（純測試代工龍頭；毛利 33.5%→39.7%；出清中國子公司獲利 38.3 億＝FY2025 EPS 含 3.13 一次性） |
| 6592 | `hotai-finance` | Hotai Finance 和潤企業 | Auto Finance（和泰集團車貸；中古車放款壞帳致 EPS 7.04→4.53，主動砍量 30-40%；P/B 1.17×／5.5% 息） |
| 2208 | `csbc` | CSBC 台灣國際造船 | Shipbuilding & Naval Defense（海鯤號潛艦主承包商／訂單排到 2031；十年虧九年、2026Q1 營業現金流 −38 億對現金 16 億） |
| 1736 | `johnson-health-tech` | Johnson Health Tech 喬山 | Fitness Equipment（代工轉品牌成功／毛利 51%；Q4 扛全年 EPS 5.65 vs Q1 0.08；4,000 萬美元關稅退稅含 3,000 萬列業外） |
| 5876 | `scsb` | SCSB 上海商業儲蓄銀行 | Commercial Banking（1915 上海創立／唯一遷台復業民營銀行；持香港上銀 57.6%、權益佔資產 11.3%；EPS 四年原地踏步） |
| 2851 | `central-re` | Central Re 中央再保險 | Reinsurance（台灣唯一本土專業再保／長榮國際持股 27.32%；ROE 17.6%、6.4% 息；2022 防疫險虧到停配息） |
| 2606 | `u-ming` | U-Ming 裕民航運 | Dry Bulk Shipping（遠東集團散裝 36 艘／淡水河谷 25 年約；與長榮貨櫃是不同循環；股利曾自 8.5 元崩到 0.75 元） |
| 1605 | `walsin-lihwa` | Walsin Lihwa 華新麗華 | Wire & Cable / Stainless / Nickel（印尼鎳礦→不鏽鋼垂直整合；2026Q1 EPS 0.81 假象：營益率僅 1.33%、業外撐起，另有 56 億未實現損失） |
| 1802 | `taiwan-glass` | Taiwan Glass 台灣玻璃 | Glass & Fiberglass（中國房市拖累連 6 季虧損／2021 後未配息；靠 AI 用低介電玻纖布翻身，位於台光電上游；P/E 370× 為真實低獲利） |
| 5306 | `kmc` | KMC 桂盟國際 | Bicycle & Industrial Chains（全球自行車鏈條約 7 成市佔／毛利 42-45%；2022 泡沫頂點上市，隔年 EPS 崩 61%；汽車正時系統佔 17%） |
| 1590 | `airtac` | Airtac 亞德客-KY | Pneumatic Components（1988 創立、堅持自有品牌連虧 8 年；中國氣動元件市佔 27% 次於 SMC；毛利 48%／負債比 17.8%，但全押中國設備投資） |
| 2393 | `everlight` | Everlight 億光電子 | LED & Optoelectronics（靠不可見光 40%／車用 16% 逃離 LED 紅海；7.1% 高息但配發率約 98%，毛利已從 30.4% 降到 24.7%） |
| 1563 | `superalloy` | Superalloy 巧新科技 | Forged Aluminium Wheels（Porsche/BMW/賓士/JLR 鍛造鋁圈；季度損益被匯率主宰雙向失真，只能看營益率；FY2025 配息 2.0 元 > EPS 1.38 元） |
| 6443 | `tsec` | TSEC 元晶太陽能 | Solar Cells & Modules（台灣太陽能崩盤縮影：營收年減 59.6%、EPS −6.24、現金僅 3.95 億；2025Q4 巨額損失組成無法查證，已據實標明） |
| 9958 | `century-iron-steel` | Century Iron & Steel 世紀鋼 | Offshore Wind Foundations（台北港製 90 公尺／2,000 噸水下基礎；在手訂單逾 500 億至 2029；專案認列使單季 EPS 2.66↔0.40 劇烈跳動） |
| 1504 | `teco` | TECO 東元電機 | Electric Motors & Power（1956 老牌馬達廠轉攻 AI 資料中心電力；電力事業群 +30%、董座稱訂單翻倍——但 EPS 連三年下滑且本益比 28×） |
| 4904 | `fareastone` | FarEasTone 遠傳電信 | Telecommunications（2023/12 併亞太電信，FY2025 營收獲利 EPS 三創新高；但用戶反減 18 萬、仍居第三 30.4%，配發率近 100%、P/B 3.99×） |
| 1215 | `charoen-pokphand-taiwan` | CP Taiwan 卜蜂企業 | Poultry & Animal Feed（飼料→養殖→屠宰→品牌食品垂直整合／ROE 24.9%；FY2025 EPS 10.40 創高，2026Q1 營收 +7.1% 但淨利 −47.1%） |
| 2027 | `ta-chen` | Ta Chen 大成鋼 | Metals Distribution US（逾九成營收在美、全美最大鋁捲板通路；美國 25% 鋼鋁關稅推升毛利 19.3%→27.3%，但那是價格效果非本業改善） |
| 6005 | `capital-securities` | Capital Securities 群益金鼎證券 | Securities Brokerage（非金控純券商／本集合循環性最強：FY2022 全年 EPS 0.39 vs 2026Q1 單季 1.34；殖利率欄位查證錯誤已剔除） |
| 4137 | `chlitina` | Chlitina 麗豐-KY | Beauty Franchise（克麗緹娜／中國最大美容連鎖加盟，毛利 80%；配息 10 元 = 盈餘 7 元＋資本公積 3 元；店數自約 5,033 家縮至 4,096 家） |
| 6605 | `depo-auto-lamp` | Depo 帝寶工業 | Automotive Lighting AM（全球最大售後車燈廠／毛利 33.5%；賓士設計專利案二審敗訴約 1,812 萬、最高法院已發回更審；股價僅約 1.05× 淨值） |
| 1904 | `cheng-loong` | Cheng Loong 正隆 | Containerboard & Packaging（工業用紙龍頭／再生紙原料；營益率自十年低點回升，2026Q1 單季賺贏去年全年七成五且為本業貢獻；P/B 0.80） |
| 3023 | `sinbon` | Sinbon 信邦電子 | Connectors & Cable Assemblies（客製化線束佔 76.95%／五大終端市場分散；ROE 19.3%、股利十年自 2.75 元增至 10 元；綠能與通訊兩塊正在衰退） |
| 1503 | `shihlin-electric` | Shihlin Electric 士林電機 | Heavy Electrical & Green Energy（重電佔營收 66%；台電 94 億標案入列＋與三菱電機合作切入美國 AIDC；ROE 僅 9.4% 卻 28× 本益比，且創高季營業現金流為負） |
| 3045 | `taiwan-mobile` | Taiwan Mobile 台灣大哥大 | Telecommunications & E-Commerce（2023/12 併台灣之星／5G 3.5GHz 100MHz 最大頻寬；ROE 16.6% 優於遠傳，但毛利 21.6% 是併入 momo 所致，不可直接與同業比） |
| 3653 | `jentech` | Jentech 健策精密 | Thermal Solutions（LED 導線架轉型 AI 均熱片／美系 GPU 主供應商；毛利 41.8%、ROE 25%；但 2026Q1 EPS 持平於營收 +58%，且 93× 本益比、23× 淨值） |
| 2474 | `catcher` | Catcher 可成科技 | Metal Casings & Diversification（營益率 6.45% vs 淨利率 40.69%＝獲利幾乎全來自利息與投資；營收年減 55%；P/B 0.73 並執行庫藏股） |
| 2337 | `macronix` | Macronix 旺宏電子 | NOR Flash & Memory（連虧 10 季後 2026Q1 轉盈、Q2 毛利率衝 64.4%／EPS 3.91；三星停產 MLC、Kioxia EOL 讓出市場，但定價權來自對手退出、且已編 158 億資本支出） |

新增一家：ingest 端加 seed → `pipeline.py <ticker> --no-generate` → 查證 → 撰寫 10 段寫回 JSON → `pnpm build` → push `main`。

## SEO / GEO 基礎設施

### Metadata
- **Google 搜尋顯示的網站名稱**：`ROLL ON Taiwan`（site name），由 `og:site_name` + WebSite schema `name` 決定；`alternateName: "ROLL ON."` 標註舊名稱以利平滑過渡。法人名稱 `ROLL ON. LTD` 仍保留在 `Organization` schema，不受影響
- `src/app/layout.tsx` — 全站 fallback metadata（OG / Twitter / canonical / keywords）
- `src/app/[locale]/layout.tsx` — locale-specific metadata + **完整 JSON-LD `@graph`**：Organization / ProfessionalService / WebSite / FAQPage（11 題，雙語） / LocalBusiness（地址、geo、營業時間、社群）
- `src/app/[locale]/page.tsx` — 首頁 `generateMetadata`，獨立針對 "Taiwan & Asia market entry / expansion partner" 搜尋意圖
  - ⚠️ 首頁 `Metadata.title` / `description` 由 `t()` 讀翻譯，**可被後台「文案翻譯」的 DB override（`Setting.messages.<locale>` → `Metadata.title`）覆蓋且 override 優先於 `messages/*.json`**。改正式站標題要同步改這筆 override（後台 `/admin/translations` 或直接更新該列），只改 json 不會生效
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
  - NOVA 局部 token：`.nova-theme` 內把 `primary/dark/black` 映射到 `#000000`、`light/cream/white` 映射到 `#FAFAFA`、`accent/primary-light` 映射到 `#BCBDC6`；全域 ROLL ON token 不變
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

### 2026-10-02 全站免費 Enterprise 測試

正式 CMS 將最高方案 `enterprise` 顯示為 **ALLIANCE**；免費測試提示透過既有方案翻譯取得名稱，與實際帳號徽章一致。

Investor 邀請接受、投資人共享頁／清單、私密 Business Plan 下載也讀取相同測試開關；邀請有效期、會員身分、分享設定與欄位隱藏照常驗證，不公開私密資料。回歸測試額外確認無已接受邀請時，免費測試仍不能取得共享公司清單。

回歸檢查見 `tests/beta-access.test.ts`，涵蓋新舊會員、開關即時生效、原權限還原、未登入、誤購拒絕及 NOVA 額度／試用週期不變；免費授權保留既有試用會員的 NOVA 週期，避免開關測試時意外重置額度。

以既有 `Setting` 的 `billing.betaAccess = { "enabled": true }` 開放所有現有會員及測試期間新註冊會員的 Enterprise 權限，不限註冊日期、不設自動到期，待站方通知再撤銷。DAL 每次請求讀取開關，未登入仍無權限；只覆蓋有效方案，不修改 `User.plan`、人工 trial、PayPal 訂閱、會員內容或資料庫結構。Email／Google 註冊共用此權限，無需逐戶回填。帳號方案頁顯示免費測試說明，測試期間隱藏方案購買卡片，訂閱 API 回 409 防止誤購；既有訂閱的取消與 webhook 對帳照常。沿用每月 150 次 NOVA 與原本週期／加購額度，不提供無限生成或免費加購。

開啟：`pnpm exec tsx scripts/set-beta-access.ts enable`；收到停止指示後執行 `pnpm exec tsx scripts/set-beta-access.ts disable`。腳本只更新這一筆設定，關閉後下次請求恢復原有付費／有效 trial／Free 權限，不刪會員或使用紀錄。腳本預設讀取 `.env`，正式操作必須確認連線與 Vercel Production 相同；也可由已驗證管理員透過既有 `PUT /api/admin/settings` 更新此 key。

正式啟用：2026-10-02 01:20（Asia/Taipei）已確認本機與 Vercel Production 資料庫相同，開啟 `billing.betaAccess`。以正式部署的基底 `125f46a` 隔離發布本次修改，不含另一項開發中的 ICP／schema 變更，未執行 schema push、seed 或資料遺失旗標。49 項測試、TypeScript 與 lint 通過（僅兩個既有 warnings），正式 build 通過。正式 API 驗證原有 9 個帳號及檢查期間新增 2 個帳號均取得免費測試授權並拒絕訂閱誤購；Free 原方案會員通過 Enterprise 專屬欄位權限，無效欄位在寫入前回 400，Dashboard 顯示 ALLIANCE，未登入仍回 401。以啟用前 9 位會員的計費／試用／訂閱紀錄指紋比對，原資料相同；新增帳號不納入舊會員指紋，未為驗證建立或刪除會員。最終部署 `dpl_9uy5aRJhJjWx6jTWtHmNAqNuUcJV`，正式網域 `www.rollgrp.com`。

Vercel Functions 使用 Region `sin1`（新加坡），與 Neon `ap-southeast-1` 同區，設定在 `vercel.json`。函式靠近主要資料來源可降低每次資料庫往返延遲；參考 [Vercel region 文件](https://vercel.com/docs/functions/configuring-functions/region)。

```bash
pnpm test
pnpm lint
pnpm build
```

### 2026-10-02 Profile / POLARIS ICP

Profile 改為公司資料、六欄 ICP 與公司現況；新增一句話介紹、手動公司階段（與客戶階段分開）、單選成長目標。舊服務需求與舊 ICP 文字保留，不自動拆分／回填；手動摘要沿用 2000 字元上限，避免舊 ICP 因新限制而無法編輯，其他六欄各 500 字元。ICP 固定為 Hypothesis，人工 Save 才更新正式 Profile；未確認草稿不影響 POLARIS／Next steps 的會員 context，也不新增對投資人公開欄位。

- `/api/account/profile` PATCH 僅更新明確提交的欄位，網址／型別錯誤回 400；ICP 移到 `/api/account/icp`（GET 恢復、POST 回答／重試、PATCH 修改／確認），Account 表單不再送出 ICP。確認儲存以交易更新工作區與 Profile 版本，409 保留本機編輯並要求重新載入。
- 每會員一份工作區，保存對話、草稿、revision；分析鎖及 requestId + revision 防重送與遲到結果覆蓋。過期鎖可由手動編輯恢復。沿用 Pro 以上 AI 權限與 150 次／月配額，另有 40 次／日護欄；只有成功 AI 回答計費，手動編輯免費。
- 固定三種追問由系統依缺少欄位選擇，最多三輪且不重問已答題。AI 值需附使用者回答引文，未知資料留空，不從公司所在地猜客戶所在地；無效輸出最多修復一次。Try again 沿用回答，已存 Profile 不被改寫。
- 右側大型 POLARIS 使用原生 dialog + portal（焦點限制、Escape／關閉回到觸發鈕），本機輸入依會員 ID 暫存並驗證格式；Save draft 儲存伺服器草稿，Save to profile 才確認更新。中英文完整標籤與錯誤訊息、長字串換行，不新增套件。斷線後以原題 revision／回答位置核對伺服器已收下的回答，才清除本機輸入；尚未提交的不同內容會保留。

驗證：新增 `tests/icp.test.ts` 覆蓋欄位保留、追問上限、引文、草稿隔離、用量／失敗、並發鎖、版本衝突、逾時遲到結果及已存 ICP 進入 Next steps context；ICP、既有試用與跨時區日期的整合測試／型別／建置通過，lint 僅兩個既有 warnings。本機真實 AI 三輪、30 項 API 檢查、17 項桌面／390px 手機互動與實際配額耗盡 429 均通過。API 401／403／400／409、未知客戶所在地保持空白、重送不重複扣額、跨頁草稿恢復、逾時編輯保留均已驗證；不寄信、不付款、不改既有會員。資料庫僅新增欄位／工作區表，已同步且 diff 為 No difference detected，未使用 `accept-data-loss`。

正式站瀏覽器驗收發現 Account 的額度重置日期採不同預設時區而發生 hydration mismatch；BillingPanel／BillingOverview 統一 Asia/Taipei，回歸測試比較 UTC 伺服器與台灣瀏覽器文字相同。ICP 最後一題只問未知的客戶市場或階段，不重問已知部分。正式站 `https://www.rollgrp.com` 已切換至 `dpl_6mGYf92yopNgHrVX4VVkoNcT5X12`（程式碼 `bb4c60c`）；從隔離工作樹部署。最終 60 項測試、型別檢查與建置通過；該部署 33 項 API 檢查／三輪真實 AI、正式網域 17 項桌面手機互動及 8 項雙分頁／雙擊／長文字／鍵盤焦點檢查均通過，瀏覽器執行錯誤為 0。資料庫再次比對 No difference detected。兩個專用 QA 帳號及其關聯測試資料已移除，並核對其他公司欄位未變及三次成功 AI 計量；既有會員資料未改動。切換前已實測正式站全站試用權限（Free 可查用量、checkout 回 409 禁止誤購）；這批已上線而未提交的試用程式碼一併整合，避免發布 ICP 時回退既有正式功能，不異動試用開關或會員原方案。本機驗收已排除執行環境注入金鑰與專案設定不一致，未更換正式金鑰。


### AI 目標與里程碑

Next steps 的目標規劃沿用 ActionPlan／ActionItem／ActionDependency。AI 提供 3–5 個依序里程碑和當期五項任務，草稿確認後才啟用；任務完成進度自動計算，成果需會員填寫說明確認。每會員獨立 RoadmapWorkspace 保存草稿，舊計畫封存且可唯讀查看；僅新增相容欄位、PlanMilestone 與工作區，不改舊清單、不回填、禁用 accept-data-loss。生成沿用 Pro／有效試用與 AI 配額，一次成功草稿計一次用量，內部分批不另扣。新增工作區 API `/api/action-plans/roadmap`（GET 恢復／本人歷史、POST 新目標／下一階段、PATCH 草稿／啟用）及里程碑成果 PATCH；同一會員的任務／成果／計畫啟用交易先鎖定 ActionPlan 並遞增 revision，杜絕跨分頁矛盾。任務變更同步 Home／Next steps／POLARIS；任務全完成仍待成果確認。日期採日曆日期與台灣今日，月末加月截到月底；手動期限優先，其次讀取 ISO／年月日／斜線／英文完整日期及明確期間，無期限預設六個月，無效文字日期在呼叫 AI 前拒絕。草稿及未提交成果說明依會員暫存；遲到回應不可清除另一輪新輸入。資料庫已確認只有新增並同步，未改既有紀錄。本機五階段真實 AI 及 98 項 API 流程通過；額度耗盡 429 無呼叫／扣額且輸入保留。72 項測試、TypeScript 與建置通過，lint 僅兩個既有 warnings。本機另通過 18 項桌面／390px 手機互動及 11 項任務完成／成果暫存／Home 狀態同步驗證，瀏覽器錯誤為 0；若啟用後原階段按鈕已移除，關閉面板會把焦點送回固定的規劃按鈕。正式環境同版 API 完整五階段及 99 項檢查通過，另於最終部署驗證工作區恢復、登入、帳號隔離及既有免費 Enterprise 授權。正式網域 `https://www.rollgrp.com` 已切換至 `dpl_H9drR9q6pkykGMdmyPzhe5DhiQUL`（程式碼 `0961f1b`，隔離工作樹等同提交 `95fe60e`）。正式網址通過 19 項桌面／390px 手機／雙分頁／雙擊／斷線重試／跨頁恢復檢查與 13 項任務完成／成果確認／下一階段追加／Home 同步／焦點檢查，瀏覽器錯誤為 0；原生 dialog 的 close 事件採非同步驗證焦點，避免測試提早判斷。實際配額耗盡回 429，未呼叫／扣額且保留輸入。最終資料庫 diff 為 No difference detected，僅新增相容 schema；核對八次成功生成的計量、原公司欄位與舊任務完成紀錄後，已移除兩個專用 QA 帳號及關聯測試資料，未改動既有會員。全站免費 Enterprise 開關、原會員方案／訂閱與投資人公開欄位未變。


### 2026-10-02 Profile + ICP 介面文案

Profile 頁名與選單改為 Profile + ICP（中文：公司檔案 + ICP）。右側已儲存 ICP 的摘要與六欄尚未提供時顯示 Not provided／未提供，不以測驗狀態清空既有資料；未確認 AI 草稿的未知欄位仍顯示尚未確認。移除 Profile 與草稿卡的 Hypothesis 標籤，按鈕改為 Ask POLARIS to sharpen my ICP，公司現況卡另加 Sharpen my ICP，兩個入口共用既有對話與工作區。首則助理訊息顯示 Let's define your ICP.，舊對話不改寫；僅調整呈現，AI 及 Next steps 仍將 ICP 視為未驗證假設，權限、配額與人工確認儲存不變。不新增套件、不異動資料庫 schema 或既有會員資料。

驗證：72 項既有測試、TypeScript 與建置通過，lint 只有兩個既有 warnings。本機以尚未完成測驗且無 ICP 的專用帳號通過 17 項桌面／390px 手機檢查：空白摘要與六欄、兩個入口共用未送出回答、開場不重複、關閉焦點返回、草稿及人工儲存、重整恢復與公司資料保留；瀏覽器錯誤為 0，未呼叫 AI 或扣額。正式站 `https://www.rollgrp.com` 已切換至 `dpl_BPTTDKWjQ1FZ3Gd7gsFpfug1gwP1`（程式碼 `af96fc7`）。候選版本先通過 SSR 文案／空白狀態／按鈕／開場與無 Hypothesis 標籤檢查；正式網域再通過同一組 17 項桌面／手機互動檢查，瀏覽器錯誤為 0。兩次驗證的專用帳號各自核對公司欄位與未完成測驗狀態、零 AI 用量後移除；既有會員資料與所有權限／配額不變，未執行資料庫 schema 更新。


### 2026-10-02 Action plan 保證先詢問

原診斷允許 AI 依 Profile／既有對話判定資料充分而立即 ready，會出現零追問；原驗收未將「至少一題」設為必要條件。現在由系統保證先詢問當前最重要的瓶頸，使用者回答後才交 AI 判斷是否需要補問，最多三題且保留既有不重問／修復規則；任務生成 API 同步拒絕零回答或省略回答，未通過時不呼叫模型或異動計畫。中英文說明明示 1–3 題、確認診斷後才生成。新增回歸測試覆蓋 Profile／對話完整時仍詢問、首題不呼叫 AI、中英文首題、零回答 API 驗證及回答後允許 ready；既有 ICP context 測試改在首題回答後檢查假設及公司／客戶階段隔離。新的「規劃我的目標」依已確認方案仍輸入方向後直接生成可編輯草稿，不強制答題；不改資料庫、不動既有計畫或會員資料。

驗證：74 項測試、型別檢查、建置通過，lint 僅兩個既有 warnings。本機使用完整 MVP 公司資料與已存 ICP 的專用帳號，通過 18 項桌面／390px 手機檢查與真實 AI 流程：先詢問一題、作答後確認診斷、最後才生成五項任務；零回答生成回 400 且不建立計畫，重新生成仍會詢問，目標規劃入口保留，瀏覽器錯誤為 0。正式站 `https://www.rollgrp.com` 已切換至 `dpl_GH7fETtmj1VmGtD2CpdR1tPk3dji`（程式碼 `de3c687`）。候選部署先通過首題、零回答 400、未建立計畫與未登入 401 檢查；正式網域再通過同一組 18 項桌面／390px 手機檢查及真實 AI 問答、人工確認與五項任務生成，瀏覽器錯誤為 0。核對公司資料及未完成測驗狀態後，只移除各輪專用 QA 帳號與其關聯資料、診斷／生成 rate counters；未改既有會員資料或資料庫 schema，未異動目標規劃流程。

### 2026-10-02 ICP 未知回答修正

原 ICP 將格式正確、但沒有可支持客戶資訊的空白結果當成模型格式錯誤，使用者回答「I don't know／我不知道」會重試後回 422 並停止追問。現在接受符合 schema 的空白結果，未知欄位仍留空、繼續下一個未問過的主題，缺少客戶身分時以具體產品使用情境引導。空白結果不扣成功 AI 用量，不能儲存覆蓋既有 ICP；前端明示尚未定義，仍可回答或手動編輯。無效 AI 格式、供應商錯誤、逾時、配額與版本衝突仍保留原安全錯誤及重試。重試可恢復先前失敗的已存回答，不清空對話、Profile 或資料庫，不新增套件／schema。

驗證：正式站專用帳號以截圖原文「I don’ t know」重現 422；77 項測試、型別及建置通過，lint 僅兩項既有 warnings。本機真實 AI 及 33 項桌面／390px 手機檢查通過：恢復舊失敗、三輪未知不重問／不杜撰／不扣成功用量、重送不追加、跨頁恢復、禁止空白儲存及手動確認後保留 Profile。另以人工確認的客戶描述實測重新生成非空白草稿成功，保留已存 ICP、重送只計一次成功用量。正式站 `https://www.rollgrp.com` 已切換至 `dpl_Hch1ni6Zbxu1GsETfQSd9HX63wi7`（程式碼 `48d481a`）。候選版本先確認舊失敗回答保留、空白儲存 400、未登入 401 與原失敗未扣額；正式網域再通過 40 項桌面／390px 手機檢查及真實 AI：從既有 422 按 Try again 恢復，三輪未知保持七欄空白且成功用量為 0，跨頁恢復、手動確認與非空白重新生成成功、已存版本保留及重送只計一次成功用量，瀏覽器錯誤為 0。每輪均核對公司欄位、未完成測驗狀態與 AI 計量後移除專用 QA 帳號及其關聯測試資料／rate counter；既有會員、對話與 ICP 未改動，未更新資料庫 schema。

### 2026-10-02 Home 四列配置

依客戶配置重新排列 Home：第一列 Investor DD／POLARIS 聊天，第二列公司階段與當前瓶頸／Your progress，第三列 Next Three Moves 佔整列，第四列 NOVA AI Events／Golden Ticket Podcast。移除 Home 上方重複優先橫幅、訂閱摘要及企業榜單，帳務與企業資料仍由原有頁面管理。任務排名／依賴／階段解鎖與成果待確認沿用既有狀態，進度仍由實際任務完成比例計算。頁首加入原生錨點直達三項行動；手機依列順序單欄排列，聊天記錄區域限制高度可捲動，長文字換行並補輸入可存取標籤。沿用聊天、候補名單、影片封面及活動資料／API，不新增套件、不改資料庫或既有會員資料。

驗證：77 項測試、型別與建置通過，lint 僅兩項既有 warnings。本機專用帳號通過 38 項桌面／390px 手機檢查：四列位置、Next Three Moves 整列寬度、原生錨點跳轉、任務連結、三項 Ready／排除 Blocked、實際完成進度、空計畫仍先問瓶頸、全部依賴阻擋、任務完成仍待成果確認、聊天跨頁歷史／長文字／區域捲動，以及模擬聊天與候補名單錯誤可見；瀏覽器錯誤為 0。頁內連結使用原生 a，避免框架僅將目標帶至視窗底部的捲動行為。正式站 `https://www.rollgrp.com` 已切換至 `dpl_8CPTNztFmWsqEDoqnHJogHuv1jDC`（程式碼 `db433b9`）；候選部署先驗證 SSR 實際呈現（排除序列化翻譯字串）及區塊順序，正式網域再通過同一組 38 項桌面／手機互動檢查，瀏覽器錯誤為 0。各輪均未呼叫真實 AI 或寄信，核對公司欄位與零 AI 用量後，只移除專用 QA 帳號／fixture／診斷 rate counter；既有會員、任務、ICP、聊天歷史、方案及影片／活動資料未改動，不需資料庫更新。

### 2026-10-02 完整五項任務顯示

完整 Action plan 原本預設 Ready 篩選；即使已生成五項，只有一項可開始時，上方 Next 3 與下方「完整計畫（5）」都只顯示一項，容易被誤認為生成不足。完整清單現在預設全部，新計畫切換恢復全部／清除搜尋；Next 3 顯示計畫總數、可開始、等待前置條件與已完成數，提供查看全部入口（同時解除篩選與搜尋）。移除湊三格的空框及重複長依賴清單，桌面依實際卡片數分欄；完整清單不再延後繪製畫面外卡片，避免大片空白及捲動後高度跳動。無可開始／全部任務完成分別說明，成果仍需人工確認。沿用同一套依賴與階段解鎖判斷，等待中的任務仍可查看但不可完成，不重寫既有任務／依賴、不重新生成、不改資料庫、不新增套件。

驗證：78 項測試、型別檢查及建置通過；lint 無錯誤，只有 Navbar／TaiwanMap 兩項既有警告。新增回歸測試重現一項 Ready／四項 Blocked，確認完整五項預設可見、受阻擋仍不可完成、查看全部會清除搜尋與篩選。本機專用帳號通過 35 項桌面／390px 手機檢查：五項與中英文狀態數、無空順位、完整入口與鍵盤焦點、篩選／搜尋／重整、完成前置後解鎖四項且 Next 3 只取三項、Home 同步、全阻擋與全部完成提示；瀏覽器錯誤為 0，未呼叫真實 AI 或寄信。

正式站 `https://www.rollgrp.com` 已切換至 `dpl_7o25YPYw1Vgcbc3VNkysLafNsi67`（程式碼 `19935fb`），Git 已推送。候選部署先驗證中英文 SSR 的五項任務、預設全部篩選、完整清單連結及移除空白卡片；正式網域再通過同一組 35 項桌面／手機檢查，完成前置任務後其餘四項確實解鎖，Home 與 Next steps 一致，瀏覽器錯誤為 0。本輪只使用專用 QA 帳號，不呼叫 AI／寄信；核對公司欄位與零 AI 用量後，已移除該 QA 帳號及其關聯 fixture。既有會員任務與依賴不重寫，無資料庫 schema 更新。

### 2026-10-02 POLARIS 彈出面板游標修正

正式站專用帳號重現原生 dialog 內的背景、標籤、按鈕與 backdrop 游標均為 none，只有 textarea 保留 text。原因是自訂圓點游標位於文件層、被 showModal 的 top layer 蓋住，而全站原生游標隱藏規則仍生效。共用樣式改為原生 modal 內使用正常游標，按鈕／連結為 pointer、文字區域為 text；modal 開啟時隱藏自訂圓點／外圈，關閉後自動恢復。ICP 與目標規劃沿用同一規則，不新增滑鼠事件、套件或變更對話／草稿／資料庫。

驗證：78 項既有測試、型別及建置通過；lint 無錯誤，僅 Navbar／TaiwanMap 兩項既有警告。本機專用帳號通過 44 項瀏覽器檢查：ICP 七個輸入框滑鼠移入後維持文字游標及草稿區塊、面板背景／標籤／backdrop 原生游標、按鈕手形、modal 內兩層自訂游標隱藏、Esc 焦點返回、未提交編輯重開保留、目標規劃共用規則、關閉 modal 後自訂游標恢復、390px 手機不啟用自訂游標及七欄編輯／無橫向溢出；瀏覽器錯誤為 0，未呼叫 AI／寄信／儲存 Profile。

正式站 `https://www.rollgrp.com` 已切換至 `dpl_DH6bxLeE48xUt6zve1tQKhDzkjb2`（程式碼 `f5a3aea`），Git 已推送。候選部署先核對實際 CSS 包含 modal 原生游標／兩層自訂游標隱藏規則；正式網域再通過同一組 44 項桌面／手機檢查，瀏覽器錯誤為 0。對話、已儲存 ICP 與 Profile 未修改；測試僅保留本機未提交文字，未呼叫 AI／扣額／寄信；核對公司欄位及零 AI 用量後移除專用 QA 帳號與其關聯 fixture，無資料庫 schema 更新。

### 2026-10-03 Action plan 固定三題

原流程是 1–3 題，AI 可在第一／第二份回答後回 ready，生成 API 只要求至少一份回答；題號卻顯示 / 3，與使用者期待固定三題不一致。現在由共用診斷函式依序提供三個不同主題：當前瓶頸、實際進展／已嘗試的方法、下一個成果／期限／資源。前三題不呼叫模型，第三份回答後才交 AI 診斷；模型工具只允許 ready，意外繼續追問最多修復一次，仍無效則回安全錯誤。前端拒絕未完成三份回答的 ready／生成，生成 API 同步拒絕不足三份回答，保留答案與既有錯誤重試方式。中英文 Home／Next steps／建立視窗改為明示固定三題；人工確認後才生成五項任務。ICP 仍最多三輪，「規劃我的目標」仍依已確認方案輸入方向直接生成草稿，不套用這個診斷門檻；不改資料庫、不覆寫既有計畫、不新增套件。

驗證：79 項測試、型別檢查與建置通過，lint 僅兩項既有警告。回歸測試覆蓋 Profile／對話充分或回答未知時仍問三個不同主題、不足三份回答不能生成、三份 Q&A 皆傳給模型、模型額外追問拒絕與修復，以及前端拒絕提前 ready 並保留答案。本機專用帳號通過 39 項桌面／390px 手機檢查：逐題三題、第二題後仍有第三題、0／1／2 回答生成 API 回 400、安全重試與答案保留、第三題後真實 AI 完成診斷、人工確認後成功生成五項、完整清單／重整、同 requestId 重送只回原計畫、重新生成從第一題開始及目標規劃入口保留；瀏覽器錯誤為 0。

正式站完整驗收另發現跨日時段會員在 Next steps 重整會觸發 React hydration 418：Legacy landing tasks 以會員建立時間推算期限，但 AgendaBoard 日期格式使用各執行環境預設時區。專用帳號期限的同一 ISO 時刻，Vercel UTC SSR 顯示 11/16、Asia/Taipei 瀏覽器顯示 11/17；UTC 瀏覽器不出錯。日期格式現在明確使用 Asia/Taipei，沿用既有 Billing 日期呈現慣例，不改儲存時刻、期限推算或任務狀態；新增元件回歸測試核對 UTC／Taipei／Los Angeles 預設環境、中英文皆顯示相同台灣日期，未使用 suppressHydrationWarning 掩蓋錯誤。

日期修正後，本機以 UTC 伺服器／Taipei 瀏覽器重新通過 39 項真實 AI 問答與五項生成檢查，瀏覽器錯誤為 0；另比對無 JavaScript SSR、Taipei 與 UTC 瀏覽器三種環境的截止日期一致，皆無 hydration 錯誤。79 項測試、型別及建置通過，lint 僅兩項既有警告。

正式站 `https://www.rollgrp.com` 已切換至 `dpl_6FG7MRqJt1KCT9WSiH2akWpLhVfe`（程式碼 `4bd1a37`，包含固定三題修正 `5bf0148`），Git 已推送。候選部署先通過三題／兩答拒絕／未登入隔離 API 與 UTC SSR 日期檢查；正式網域再通過完整 39 項桌面／390px 手機驗收，第三份回答後真實 AI 完成診斷、人工確認後成功生成五項，重整保留與同 requestId 重送回原計畫，瀏覽器錯誤為 0。正式站無 JavaScript SSR／Taipei／UTC 瀏覽器日期一致且零 hydration 錯誤。本輪僅使用專用 QA 帳號；核對公司資料不變、舊版五項任務及完成紀錄封存、新版恰五項與無重複計畫後，已移除專用帳號、關聯 fixture 與該帳號診斷／生成限流計數；未修改真實會員資料，未執行資料庫 schema 更新。

### 2026-10-03 Action plan 完整流程保護檢查

舊版生成在模型成功前扣每日三次請求限流，失敗重試會耗盡；另缺少生成開始時的啟用計畫版本檢查。現將最近 24 小時三份成功計畫與每日十次請求保護分開，成功數在模型前及寫入交易內檢查，失敗不占成功計畫數。生成開始記錄啟用計畫 ID／revision，寫入交易沿用 lockActivePlan 比對；較晚結果遇到計畫已被修改／替換則回 409，不封存新版本；相同 requestId 已完成仍回原版本，不再次建立或封存。逾時回安全 504，回答留在視窗供重試。無資料庫 schema 更新，不改舊資料；新回歸測試覆蓋權限、題數、失敗三次後重試、額度、重送、逾時、交易內檢查及雙分頁較晚結果。

模型請求明確設為診斷每次 45 秒、任務生成每批最多 60 秒（目標規劃沿用 35 秒），停用 SDK 隱性重試；兩次診斷／四批生成的上限低於 API 120／300 秒。缺少工具回應視為格式不合格，沿用最多一次修復，仍不合格回安全驗證錯誤，不寫入計畫。

同分／同期限／同執行時間／同建立時間的 Ready 任務新增 clientKey 自然順序及 ID 決勝，避免資料庫回傳順序改變 Next 3；Home 與 Next steps 沿用同一 ranking 函式，新增打亂輸入仍同結果的回歸測試。

驗證：87 項測試、型別及建置通過；lint 無錯誤，僅兩項既有警告。專用帳號完成 37 項本機 HTTP／真實 Neon 資料庫檢查：未登入、跨帳號修改／歷史拒絕、缺少／自己／循環依賴拒絕、前置未完成不可勾選或刪除、解鎖／撤銷後續限制、編輯／新增／刪除、不同請求併發恰一個成功且另一個 409、同 requestId 併發回同版本、三份成功後限額及重送、Profile 與舊版五項任務／完成紀錄保留。另用本機供應商模擬連續三次缺工具回應，皆安全 422、原計畫未封存；同帳號隨後通過 39 項真實 AI 桌面／390px 手機流程，成功生成五項，重整及重送保留，瀏覽器錯誤為 0。測試帳號及其限流計數已核對並移除；不改真實會員資料。

正式站 `https://www.rollgrp.com` 已切換至 `dpl_2vomDTbtJJjjPs98F2dif4k9Ebpw`（程式碼 `191e38b`），Git 已推送。候選 API 與 UTC SSR 日期檢查通過；正式站專用帳號通過 46 項 HTTP／Neon 檢查，在本機 37 項基礎上補查明確依賴錯誤原因、交易內成功額度不足會回滾 revision／啟用狀態，以及沒有舊計畫時的併發首次建檔。不同請求併發恰一個成功／另一個 409，相同 requestId 回同版本；跨帳號寫入／歷史拒絕，舊紀錄與 Profile 保留。另以新專用帳號正式通過 39 項真實 AI 桌面／390px 手機完整流程：固定三題、第三題後診斷與人工確認、五項任務、重整、同 requestId 重送、錯誤重試保留回答，瀏覽器錯誤為 0；無 JavaScript SSR／Taipei／UTC 日期一致且無 hydration 錯誤。專用帳號及關聯資料／限流計數均已核對並移除。本次驗收只涵蓋記錄的流程與失敗情境，不宣稱所有功能零缺陷或外部 AI／網路永不故障；舊版未完成診斷的回答在原視窗錯誤重試時保留，整頁重整未完成問答仍會重新開始，ICP／目標規劃才使用各自伺服器工作區恢復。

### 里程碑與 Weekly Check-in（實作中）
沿用 ActionItem / milestoneId；共用穩定依賴排序與階段內顯示編號，完成狀態不重排編號。新增可空執行順序、完成時間、數量進度，以及私人 WeeklyCheckIn。僅相容新增，不回填舊成果或公開週記。任務寫入新增期望版本檢查與伺服器完成時間，數量達標不自動完成；AI 任務生成提供全部里程碑範圍以避免跨階段重複。尚未部署，驗收完成前不視為上線。


## Home Rewards 與每日提醒（2026-10-03）

已實作，尚未部署：NOVA Home 新增積分卡與 Rewards 頁面。Schema 僅疊加 RewardAccount／RewardEntry／RewardRedemption／RewardReminder／RewardDelivery，AiAllowance 新增 rewardBalance（預設 0）。禁止 accept-data-loss、重置或覆寫既有資料；保留既有 WeeklyCheckIn 與 Action Plan 改動。Email 預設停用，測試驗收後才能啟用。

Weekly Check-in 以台北週一起始，快照保留階段編號與累計數量；資料型摘要先保存，AI 提供最多三項真實 Ready 任務與可選數量目標草稿，不將未知數量當零。AI 工具呼叫沿用現有 Anthropic 與配額，格式修復不另計費。

積分核心：每日回訪 5 分、任務 30 分（每項一次、每日最多 2 項）、每期完整測驗 50 分、首次六欄公司資料完整 50 分。100 分兌換 5 次，每台北月份最多 20 次。交易鎖 RewardAccount，使用 Serializable 與有限競態重試；首次初始化將既有完成任務記為 0 分，避免取消再勾選補領。ledger 不依賴 task 外鍵，刪除任務仍保留請領紀錄。GET 只讀；Home POST 領回訪並核對一次性資料獎勵。日期／限額統一台北時間，提醒用會員時區；夏令缺失時間採下一個有效分鐘。

`/api/action-plans/check-ins` 依登入會員限定存取；週記、數量與快照以交易保存，週末後與封存計畫唯讀。AI 生成防重送、預留額度及過期恢复；排序另行確認並鎖定計畫版本，AI 失敗不撤销回報或改原排序。

任務／公司資料／雙週測驗已接入交易內獎勵；測驗必須完整且每題有唯一有效答案。POLARIS 對話允許免費會員消耗獎勵，其他 AI 服務的 reserveAiUsage 預設仍需付費方案。消耗順序為 included → reward → bonus，過期預扣與失敗原路退回。CopilotTurn 新增 rewardOnly，免費對話只讀 rewardOnly 歷史且不載入付費 Action Plan 上下文；免費使用量 included／bonus = 0、resetsAt = null，新增 rewardRemaining。

里程碑、完整任務列表及 Home 改用共用 ActionTaskRow：數字與 checkbox 分開、預設一行摘要、Show more 完整內容、前置任務反灰；Goal roadmap 直接讀同一 ActionItem，跨分頁 BroadcastChannel 與焦點刷新同步進度。

API：GET /api/rewards（私有 no-store、每頁 50 筆／cursor）、POST /api/rewards/visit、POST /api/rewards/redeem（UUID requestId）、PATCH /api/rewards/reminder（enabled/time/timeZone/locale）、POST /api/rewards/unsubscribe（簽章 token）；會員寫入要求同 Origin。GET /api/cron/reward-reminders 只接受 CRON_SECRET Bearer。Vercel Pro 每 15 分鐘排程、每批最多 100 位；REWARD_EMAIL_ENABLED=true 且 RESEND_API_KEY／RESEND_FROM_EMAIL／CRON_SECRET／AUTH_SECRET／NEXT_PUBLIC_APP_URL 齊備才開放。預設不寄。台北每日一筆 outbox、5 分鐘 lease、固定 payload／Resend 冪等鍵，最多 3 次、2 小時後失效；已完成有效行動／無任務／退訂／設定變更則跳過。退訂 GET 頁只顯示确认，POST 才執行；郵件 List-Unsubscribe 支援 One-Click POST。accepted 僅代表 Resend 接受，不代表送達。

Next steps 新增右側 Weekly Check-in 面板與本週可修訂表單、私人時間軸；Home 提供入口與部分數量。輸入依會員/計畫本機暫存，成功保存清除；歷史可讀，AI 逾時可恢復，建議/數量目標皆需確認。

私人投資人草稿只在 Business+本人 Share with investors 表單預填；發布另需明確確認、週記版本檢查及唯一來源鍵防重複，不自動寄信、不改分享開關。

Roadmap 工作區新增 review / editCorrection / correct：完整里程碑檢查階段重疊，產生未完成任務的前後對照草稿；確認時版本鎖定、整張依賴圖驗證及交易更新，任務 ID、完成紀錄與舊週快照保留。

前端：RewardsProvider 共用會員即時積分，Home 小卡 POST 回訪、Rewards 頁包含真實機會／兌換確認／每月額度／提醒設定／50 筆分頁紀錄，請求失敗完整顯示可重試。兌換 requestId 以會員 ID 分隔存 sessionStorage，網路失敗或重新整理可重用。公開退訂頁不需登入，GET 無資料異動、點確認才 POST；頁面禁止索引、no-referrer。

Roadmap 右側面板增加階段檢查、修正前後對照、標題/成果/Why now/實際依賴 ID 的編輯及人工確認；已完成任務不列為修正目標。

驗收中：修正工作區以草稿資料欄位分流，保留既有目標/下一階段 API 行為。

Home 桌面 Investor DD 下方為 Rewards 小卡，右欄保留 POLARIS；手機先顯示積分再 POLARIS，Investor DD 保留在其左欄組內。側欄 Rewards 顯示即時積分與載入錯誤，RewardsProvider 定期及切回頁面刷新，中英文已補齊。免費獎勵對話不顯示付費建檔 CTA。寄送 outbox 加 reminderVersion，設定／退訂變動以版本取消舊工作；排程每封至少間隔 550ms、250 秒處理預算。

測試同步新排序規則，原診斷與 Roadmap 測試保留；週記保存驗證週起始日避免週日/週一切換誤存；數量有值時必須有人工確認單位。

手機順序已調整為 Home 歡迎 → Rewards → POLARIS → 行動摘要 → Investor DD → 活動／影片。Provider 使用版本避免較早 GET 蓋掉回訪或兌換後的新餘額，付費頁的重設時間型別允許免費 null。

新增可執行回歸測試涵蓋穩定拓撲排序、階段編號/引用、內部代碼、台北週界線、未知數量、任務/成果區別、週報推薦實際 Ready ID、階段修正完整依賴圖、AI 格式修復及端點授權。

資料庫更新採逐條檢查後的新增 SQL，只包含本次 ActionItem 可空欄位、WeeklyCheckIn 與 InvestorUpdate 唯一來源鍵；不處理並行 Rewards 結構，不執行刪除或資料回填。

本機隔離驗收：pnpm 引入 @prisma/adapter-pg 7.8.0（供開發／測試使用，因靜態 import 放 dependencies），ROLL_LOCAL_POSTGRES=true 只在非 production 生效，且 URL 必須指向 loopback 與 roll_rewards_qa 開頭的資料庫；正式環境維持 Neon。ROLL_REWARDS_TEST_DATABASE_URL 同樣限定本機 QA 資料庫，用於真實 PostgreSQL 的交易／並行／退款／寄信 mock 整合測試。測試資料不寫入正式 DB。

目前 97 項回歸測試通過，型別與建置成功；實際資料庫已僅套用本次相容新增。完整任務編輯保留開啟時的版本，過期回應不覆蓋較新計畫。專用帳號正式流程驗收仍進行中。

驗收新增 tests/rewards.test.ts（台北跨日、六欄資料、測驗答案、時區／夏令時間、雙語）與 tests/rewards-db.test.ts（獨立本機 PostgreSQL 並行回訪／兌換／回滾／限額／歷史任務／AI 分來源退款／測驗去重／排程重疊／退訂／寄信重試）。整合測試須設定 ROLL_REWARDS_TEST_DATABASE_URL；未設定則 skip，絕不使用一般 DATABASE_URL。Email 以 mock 驗收，不發真信。

本機真實交易測試首輪已通過並行回訪、兌換、回滾、月上限、歷史任務、AI 退款與測驗去重；寄信 mock harness 補齊 URL global 後重跑。交易重試耗盡改回 409/reward_busy，讓前端明確提示重試，不隱藏競態原因。

真實 PostgreSQL 測試揭露 JSONB 會重排物件鍵，首封與重試的 JSON bytes 可能不同；已將 Resend body 統一排序序列化，確保固定 idempotency key 對應完全相同 payload。

驗收發現並行 Rewards 程式已接入任務 API，而其新增資料表尚未套用，導致共用環境 500；本輪未清空或更動 Rewards 資料。先修正週記深連結自動開面板、數量編輯版本及依賴文案，待環境一致後重跑實際驗收。

驗收：新增 16 項獎勵測試（含 10 項真實本機 PostgreSQL 子測試）全部通過，瀏覽器已驗證免費會員扣 100 分、增加 5 次 AI 獎勵，Home 開放對話但不出現付費建檔入口。390px 手機 DOM 寬度無橫向溢出，Rewards 排在 POLARIS 前；手機側欄帳號／登出改為同列以減少首屏佔用，積分卡間距收緊。

任務編輯在寫入前觀察 alreadyDone：即使會員已有積分帳戶，任何沒有獎勵紀錄的已完成任務也先登記 0 分，防止「建立時即 done／歷史任務」透過 undo 後再完成取得補領。

上線 SQL：prisma/rewards.sql 僅含本功能的 5 張表與 AiAllowance.rewardBalance／CopilotTurn.rewardOnly，疊加且可重跑；不包含同步開發中的 WeeklyCheckIn 等其他變更、不寫會員資料。@prisma/adapter-pg 放 dependencies 以確保 production-only 安裝能解析模組，ROLL_LOCAL_POSTGRES 仍只允許非正式環境。翻譯檔已保留原有格式及其他功能新增鍵，減少無關 diff。

每週唯讀成效檢查：pnpm exec tsx scripts/reward-metrics.ts，統計近 28 天每週回訪人數／回訪天數、回訪後有效行動、成熟 D1／D7 回訪、寄信接受／失敗／跳過、接受後退訂、兌換與成功獎勵 AI 用量。退訂在 ledger 記為 0 分 audit，不影響餘額與前端積分紀錄；不新增第三方追蹤或寄送自動報表。

Cron Bearer 驗證先比較 UTF-8 byte 長度，避免異常 Unicode header 造成 timingSafeEqual 例外。

隔離本機環境已通過 44 項實際 API/DB 檢查：五項同 ID、版本衝突、4/10、依賴完成順序、待確認成果/解鎖及舊快照未被改寫。Roadmap AI 不截斷里程碑上下文；週報 AI 只提供所需任務事實，避免重複八維欄位膨脹上下文。真實 AI 與瀏覽器驗收仍進行中。

真實 AI 驗收攔截到週報模型推薦 Blocked 任務：未套用排序且釋放額度。已將生成工具候選 ID 限為實際 Ready 任務，語意驗證納入一次修復；阶段修正也在工具修復內檢查依賴圖。

每週統計脚本以 Node 原生 loadEnvFile 讀取 .env.local／.env，保留 shell 的顯式 QA URL，不依賴未宣告的 @next/env 套件。

新增 API 邊界回歸：未登入／異站 Origin／非法兌換 UUID／偽造 userId／限流／錯誤時區／Cron 缺設定及 Unicode token 全部在異動前拒絕；成功回應 private,no-store。

免費 POLARIS 文案已改為「積分兌換或升級」，避免誤稱全為 Pro 功能；開放獎勵對話時顯示剩餘次數，建檔仍有 Pro 邊界。兌換確認視窗使用明確的手機寬度計算。

兌換遇到「交易已成功、HTTP 回應遺失」時，GET /api/rewards 可附 redemptionRequestId（UUID），只核對目前會員自己的兌換；Provider 以伺服器確認清除 sessionStorage 的 pending ID 並顯示已入帳，避免下次兌換误重播舊成功交易。整合測試驗證成功確認與跨帳號不可讀。

週記補強：本機未送出輸入保留原始版本，跨分頁更新後提交會得到 409，使用者明確重新載入才採用新版本；暫存依台北週界線失效。已確認成果階段的數量唯讀，歷史投資人草稿複製使用對應歷史內容。里程碑任務詳細頁提供原任務編輯入口。

週記中的本人任務勾選成功會採用該次交易的新計畫版本，避免同一表單正常勾選後被自身版本變更阻擋；外部分頁更新仍保留原版本衝突檢查。

階段修正入口先確認會員本人計畫，不同帳號回傳 404；本機修正草稿支援暫時空白欄位恢復，提交仍套用完整嚴格驗證。

真實 AI 週記已驗證 29 項 API／資料庫檢查；修正 AI 的輸出 ID 僅能選當期未完成任務，依賴只允許本人計畫當期及以前任務，完整圖仍由伺服器驗證。格式與語意修復用量合併一次；失敗保留原資料並釋放預留。

可重跑的相容新增 SQL 保存於 prisma/weekly-checkins.sql；只新增可空欄位、週記表、索引與外鍵，不回填或刪除資料。

最終檢查補強：今日任務機會僅列剩餘可領分數量；Email 在發送節流等待後再次查核開關、有效行動與同類機會，避免等待期間完成後仍寄送。兌換暫存 UUID 異常時清除，不阻塞讀取。全專案測試發現並行週記測試的 console mock 缺 warn，僅補 mock 方法以保留原錯誤斷言。正式 Vercel 環境僅核對變數名稱，尚缺 RESEND_API_KEY、RESEND_FROM_EMAIL、CRON_SECRET、REWARD_EMAIL_ENABLED；未讀出金鑰或發送真信。

週記尚有未儲存回答／數量時，生成或套用建議會要求先保存，避免用旧事实生成並清除未提交內容；只儲存投資人草稿會保留其他本機輸入。階段修正 14 項真實 AI/API 檢查與 22 項桌面／手機檢查已通過。

新增可重跑週記工作區回歸測試：成功重送、帳號隔離、格式錯誤／逾時退款、額度不足與計畫變更後拒絕晚到結果。

POLARIS 首次讀取獎勵餘額時顯示載入狀態，避免先閃現升級卡；首次對話歷史載入完成前禁止送出，快捷入口點擊高度統一至少 44px。新增真實交易測試驗證剩餘可領任務數，以及寄送等待期間完成行動／退訂會阻止供應商請求。

桌面 POLARIS 卡延伸至左側 Rewards 底部，輸入列貼齊卡片下緣；手機維持內容高度與既定順序。上線順序：先審核 prisma/rewards.sql 與目標 DB 差異，再以 pnpm exec prisma db execute --file prisma/rewards.sql 套用相容新增；確認會員既有方案／加購與資料保留後部署積分功能。Email 保持 REWARD_EMAIL_ENABLED=false，補齊 CRON_SECRET 與已驗證 Resend 寄件網域／金鑰，僅對測試帳號驗收實際收信與退訂後才開 true。不要以 db push 一次套用工作區其他尚在驗收的 schema，也不使用 accept-data-loss。

故障驗收 28 項實際 API／資料庫檢查通過（額度、格式錯誤、晚到結果、逾時退款及封存唯讀）。數量表單跟隨伺服器已確認值更新，輸入中保留原版本；本人週記勾選會同步本機暫存版本。

數量編輯以未修改時的伺服器值呈現，已修改值獨立保留；409/儲存失敗不清除草稿。無額外同步 effect，避免欄位更新造成陳舊狀態。

Rewards 最終本機驗收：全專案 123 項測試通過（包含 22 項獎勵測試／12 項真實隔離 PostgreSQL 子測試）、pnpm lint 無錯誤（僅 Navbar/TaiwanMap 兩個既有警告）、pnpm build 成功。Rewards-only SQL 在以 HEAD schema 建立的獨立 DB 連續套用兩次，既有 bonusBalance=9、includedUsed=7 保留且 rewardBalance=0；週報統計腳本成功執行。瀏覽器確認實際兌換 100 分／增加 5 次、免費付費建檔隔離、提醒關閉下保存 09:15/America/Los_Angeles、390px 無溢出與 Rewards 在 POLARIS 前，前端 console error 為 0。所有 QA 帳號／積分／郵件 mock 僅位於隔離本機 DB。本功能未部署、未套用正式 Rewards schema、未寄真信；先完成工作區同步功能的整合發佈，再依上述順序上線。評估重點為回訪後有效行動率與每次有效行動的獎勵 AI 成本，不能只以登入／Email 接受率判斷留存。

2026-10-03 里程碑／Weekly Check-in 已由隔離工作目錄推送 main（功能 commit 1284efd），部署 dpl_EihZNmpadcuMjSDhyovpMKaG166D 已切換 www.rollgrp.com。101 項回歸、型別／建置通過；正式候選 44 項 API/DB、37 項真實 AI、22 項桌面/手機驗收，公開網址再通過 8 項資料/授權及 22 項介面檢查。正式及本機本輪專用 weekly-qa-* 帳號及關聯資料已清除，其他並行修改仍保留。

2026-10-03 任務勾選鎖定 UX：共用 TaskCheckbox；受依賴阻擋時方格灰底、框內鎖頭、原生 disabled 與「先完成」原因，獨立編號不變。里程碑、Next steps、Weekly Check-in 一致；已完成與儲存中不誤標鎖頭。44px 操作區、鍵盤焦點；22 項桌面／手機檢查、101 項回歸、型別、相關 ESLint 及正式建置通過，不需資料庫更新。

鎖頭 UX 已於 2026-10-03 推送 995b733 並上線 dpl_7qG5KqYRmCLkt932thkq5LEjKJ55；候選與公開 www.rollgrp.com 各通過 34 項真實桌面／手機檢查，包含三個任務入口的灰底鎖頭、前置完成解鎖、鍵盤勾選、計數同步、重整恢復及撤銷再鎖。此輪專用帳號及關聯資料已清除，未修改真實會員資料；未做資料庫結構更新。

2026-10-03 Next steps 移除整個 Legacy landing tasks 舊流程區塊及專用查詢；保留 Goal roadmap、目前任務、Weekly Check-in 與獨立里程碑。既有 LandingTask／checklistState 資料保留，不需資料庫更新。

Legacy landing tasks 移除驗證：TypeScript 與正式建置通過；候選與公開 www.rollgrp.com 各通過 32 項中英文桌面／手機檢查，確認舊區塊消失、五項任務與鎖頭、Goal roadmap、Milestones、Weekly Check-in 保留，無橫向溢出及瀏覽器錯誤。40b7e02 已推送並上線 dpl_EEcAzBtTNBA8337yxXRS4QgUe27M；本轮專用帳號與關聯測試資料已清除。

## 新使用者引導（2026-10-03）

Home 以真實資料判斷三步：補充公司名稱／一句話介紹／公司階段／目前最需要 → 現有三題問答與人工診斷確認 → 生成五項任務並開啟第一項 Ready 任務。已有公司資料或啟用計畫不需重做；ICP 選填，Goal roadmap 是進階入口，不自動呼叫 AI、不新增必填阻擋或方案授權。尚無計畫時，Home 次要內容收進探索更多，Next steps 優先顯示建檔入口；建立計畫後 Next Three Moves 優先呈現。

公司引導沿用 AccountProfileForm 與原 Profile PATCH，只提交四個基本欄位，其他資料與 ICP 保留，進入時定位第一個缺漏欄位。第一項任務連結展開完整內容及鍵盤焦點；受阻擋項目不列為第一步，而顯示前置或里程碑成果確認原因。中英文文案、手機版、44px 操作區與原生 dialog 焦點／Escape 已驗證。

/api/account/getting-started 的 GET 回本人狀態，PATCH 僅接受 dismiss／reopen；不能偽造完成或指定其他會員。User 新增 gettingStartedVersion、gettingStartedDismissedAt、gettingStartedCompletedAt 三個可空欄位，prisma/getting-started.sql 僅相容新增，沒有回填、刪除或改用途。首次 ActionItem 成功完成在既有交易內記錄；撤銷不重設，既有完成會員預設收起。偏好提交使用 keepalive，避免離頁取消，完成提示依會員及首次完成時間本機去重；無本機儲存時有提示。

ActionPlanBuilder 與伺服器共用三個不同題目。回答、未送出文字、診斷、requestId、revision 依會員本機保存；恢復不重做 AI，診斷必須再確認，同分頁雙擊及不同分頁覆寫皆防護。generate GET 只查本人既有 requestId 結果，不呼叫 AI／不扣額；生成中的重整只輪詢結果，五分鐘等待结束後才提供人工重試。失敗保留回答，格式檢查及前端安全錯誤不外洩伺服器堆疊。引導資料與 Home／Next steps 沿用會員通知及焦點刷新，晚到讀取不覆蓋新狀態。

驗收：113 項回歸測試、TypeScript、相關 ESLint（零錯誤／警告）及 pnpm build 通過。實際模型完成三题、診斷確認、五項任務與第一項完成／撤銷；候選完整流程與即時重整檢查通過。公開 www.rollgrp.com 通過 23 項完整流程、13 項手機／跨頁恢復／雙分頁／帳號隔離檢查，以及三次收起後立即重整、成功回應後恢復及無瀏覽器錯誤檢查。另驗證受阻擋不勾選、既有完成會員預設收起及跨會員任務／生成查詢隔離。本輪八個專用帳號及關聯資料已清除，未清空真實會員資料。

1544e7f、fcd3850 已推送 main；正式部署 dpl_B1JswCmALLo7MnENnxfFdQehnfZg（roll-9mozsion2-erics-projects-57e51613.vercel.app）已切換公開站。並行 Rewards 的本機修改與交易邏輯保留，未包含在此獨立部署中。

2026-10-03 Rewards／Email 正式發布準備：以最新 origin/main 99fb7e5 為基底的隔離工作樹整合積分、AI 獎勵與提醒，保留已上線的 Weekly Check-in／任務鎖定與移除舊流程。寄件网域已 Verified；測試收件人已由使用者指定，金鑰限 rollgrp.com Sending access，提醒開放前完成真實收信及退訂驗收。會員 opt-in 預設關閉，發布不代替會員開啟提醒。

Rewards 發布整合檢查：AgendaBoard 以有條件的 render 狀態同步取代 effect 直接 setState，保留較新的任務 revision 並避免 lint 錯誤。移除只驗證已下架 Legacy landing 截止日期的過期測試；Billing 台北日期與 Roadmap 日期／週界線回歸仍保留。

正式 Rewards schema 已僅套用 prisma/rewards.sql。前後比對 User 10 筆、OnboardingProfile 9 筆、AiAllowance 3 筆、ActionPlan 6 筆、ActionItem 103 筆與 PlaybookQuizAttempt 3 筆內容指紋均相同。後續差異檢查發現正式環境另有三個可空 gettingStarted 欄位；僅同步 Prisma 宣告以保留並行新欄位，沒有刪除、回填或更改其值。126 項含本機真實 PostgreSQL 的回歸通過，lint 0 errors／2 既有 warnings、pnpm build 通過。

本機 QA 資料庫同步新增相同三個可空 gettingStarted 欄位，供最新 Prisma Client 回歸；未修改既有值。

2026-10-03 Rewards 整合最新 main 1544e7f 的新會員引導：保留 DashboardUserProvider、引導狀態及首次完成交易，任務完成同一交易亦入獎勵帳。積分卡在無計畫引導時仍可見；一般 Home 桌面左 Investor DD／Rewards、右 POLARIS，手機 Rewards 先於 POLARIS；不覆蓋 Getting Started 資料或功能。先前候選完成 51 項正式 API 檢查；合併後重新建置驗收，Email 保持關閉。
上線前輸入審核修正雙週測驗：原流程 Number(null)／Number(空字串) 會把空答案視為選項 0；改為嚴格 number/integer 驗證，不接受空值、字串、布林或缺值，再核對每題完整性。新增實際端點的空答案回歸，確保入帳交易前拒絕。

整合驗收：140 項回歸（含 12 項隔離 PostgreSQL 子測試）通過。全專案 lint 揭露新引導測試 fixture 的 module 區域變數命名違反 Next 規則，僅改名 loaded；不改測試行為或業務流程。

Home 整合手機順序再確認：同一 grid 的 Rewards → POLARIS → 行動摘要 → Investor DD，桌面摘要仍在雙欄下方，避免引導元件整合後把 Investor DD 移到行動前方。

整合候選手機驗收發現活動卡片的 auto grid track 被英文活動名稱撐到 438px；補上 grid-cols-1 的 minmax(0,1fr)，保持 390px 畫面寬度。正式發布前重新部署並核對中英文手機布局。
