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
pnpm build      # 生產建置（含 prisma generate）
pnpm lint       # ESLint

# 資料庫（Neon Postgres）
pnpm db:push    # 推送 schema 到 Neon（禁用 --accept-data-loss）
pnpm db:seed    # 灌入初始內容（count-guard，不覆蓋既有資料）
pnpm db:super   # 建立/重置後台超級帳號（pro，見下方「超級帳號」）
pnpm db:studio  # Prisma Studio 檢視資料
```

## 後台超級帳號（Super Account）

會員後台入口 `/login`，登入後進 `/dashboard`。要一個「本來就是 pro、直接進後台」的帳號時跑：

```bash
pnpm db:super
# 預設 super@rollgrp.com / RollOn2026!Super，可覆蓋：
SUPER_EMAIL=you@x.com SUPER_PASSWORD='你的密碼' pnpm db:super
SUPER_PLAN=enterprise pnpm db:super   # 永不過期版（不需訂閱期）
```

腳本 `scripts/create-super-user.ts` 以 `upsert` 建號（可重複執行，會重設密碼與方案），設定 `plan=pro`＋`subscriptionStatus=ACTIVE`＋`currentPeriodEnd=2099`（滿足 `getEffectivePlan` 寬限期判定，否則 pro 會被降級為 free），並 `completed=true`／`onboardingStep=4` 讓登入後直達 `/dashboard`。**注意**：pro 靠遠期到期日維持；若要真正永久不過期用 `SUPER_PLAN=enterprise`（`src/lib/billing/gate.ts` 對 enterprise 無條件信任）。

### 環境變數

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

# 公開用戶 Google 登入（缺少時 Email 註冊/登入仍可用，Google 按鈕會在前端顯示設定錯誤）
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"  # 上線改成 https://<網域>/api/auth/google/callback

# 訂閱金流（PayPal）— 缺少時前端訂閱顯示「金流尚未設定」而非崩潰（isPaypalConfigured 把關）
PAYPAL_ENV="sandbox"              # sandbox | live
PAYPAL_CLIENT_ID="..."           # PayPal Developer Dashboard 建立 app 取得
PAYPAL_CLIENT_SECRET="..."
PAYPAL_WEBHOOK_ID="..."           # 註冊 webhook（{網域}/api/billing/webhook）後取得，供簽章驗證
PAYPAL_PLAN_ID_PRO="P-..."        # 由 scripts/paypal-setup.mjs 產生
PAYPAL_PLAN_ID_BUSINESS="P-..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"  # 組 PayPal return/cancel URL；上線填正式網域（不要結尾斜線）

# 會員 AI Copilot（Pro 方案）— 缺少時 /api/copilot 開始串流前回錯誤全文（不崩潰）
ANTHROPIC_API_KEY="sk-ant-..."   # Claude API 金鑰（platform.claude.com）
ANTHROPIC_MODEL="claude-sonnet-5" # 可選，預設 claude-sonnet-5；成本敏感可改 claude-haiku-4-5
```

> `.env*` 已 `.gitignore`。產生密碼 hash：
> `node -e "console.log(require('bcryptjs').hashSync('你的密碼',12))"`
> ⚠️ **bcrypt hash 內的每個 `$` 在 `.env.local` 必須跳脫為 `\$`**，否則 Next 的 env 載入器（dotenv-expand）會把 `$2b`、`$12` 當成變數展開而破壞 hash，導致登入永遠失敗。
> ⚠️ **shell 已匯出的環境變數會壓過 `.env.local`**：Next.js（與 `node --env-file` / `process.loadEnvFile`）遵循「不覆蓋 process.env 既有值」原則。若你的終端機 profile（或 Claude Code CLI）已 export `ANTHROPIC_API_KEY`，本機 `pnpm dev` 會用那把、忽略 `.env.local` 的值，導致 AI 用到錯的 key。本機要驗 copilot 時用 `env -u ANTHROPIC_API_KEY pnpm dev` 起服務。正式站（Vercel）無此問題 —— runtime 只注入專案設定的環境變數。
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

新產品（自助式 SaaS：Free / Pro / Business 訂閱 + 專屬 Dashboard）的獨立行銷著陸頁。視覺沿用全站設計系統（`hero-new` 字體、`#7B1A2C` 暗紅、Motion `[0.22,1,0.36,1]` 進場），結構參考設計草稿 `介紹頁.png`。

1. **ProductNav** — 著陸頁專屬頂部列（非全站漢堡）：左 Logo → 首頁，右 `Login` / `Sign Up` + 語言切換；捲動加玻璃背景
2. **ProductHero** — 大標題 + 副標（"Thinking about expanding in Taiwan?"）+ `Get Started`（→ `#pricing`）+ 右側 3 張問題式卡片（何時募資 / 是否在地聘僱 / 在地 CEO 如何決策）— 對齊外商決策者真正會問的問題
3. **HowItWorks** — 「如何開始」三步驟（01 註冊 → 02 客製化 Dashboard → 03 媒合夥伴）
4. **Pricing** — 「選擇方案」四卡（Free NT$0 / Pro NT$590 / Business NT$890〔推薦，中間突出〕/ Enterprise 洽詢）。CTA：付費方案 → 註冊（`/signup`，開始漏斗）；Enterprise → `#contact`
5. **ProductCTA** — 底部暗紅大 CTA（`免費開始使用` → `#contact`）
6. **Footer** — 沿用全站 Footer（含 `id="contact"` 聯絡表單，即暫行候補名單，留言進後台收件匣）

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
| `/admin` | 儀表板（各內容筆數、未讀訊息數、註冊帳戶數） |
| `/admin/services`、`/events`、`/clients`、`/work`、`/videos`、`/insights` | 清單型內容 CRUD（共用泛型表單與列表） |
| `/admin/translations` | 文案翻譯編輯器（依 namespace 分組、en/zh-tw 並排，涵蓋 About / ESG / 全站 UI 文字） |
| `/admin/settings` | 頁尾聯絡資訊、社群連結、Golden Ticket 頻道 |
| `/admin/messages` | 聯絡表單收件匣（標記已讀 / 刪除） |
| `/admin/users` | **註冊帳戶（庫戶）唯讀檢視** — 列出 `User` 表所有公開平台註冊用戶，含 **email 個資**、姓名、註冊方式（Google/Email）、email 驗證狀態、訂閱方案、onboarding/測驗狀態、註冊時間；支援 email/姓名搜尋。**個資注意**：依目前設定 email **直接顯示完整明碼**（未遮罩、無存取稽核），故此頁僅在後台 admin session 登入後可見（`proxy.ts` + layout 雙重把關）；Server 端以 Prisma `select` 取欄位、**刻意不撈 `passwordHash`**。刻意**唯讀不提供刪除**（刪 `User` 會 cascade 連帶清除訂閱與測驗紀錄）。若日後需通過個資稽核，可升級為「server 端遮罩 + reveal API 留存取紀錄」。 |

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

- `User`：`email`(unique)、`passwordHash`(Google 用戶為 null)、`googleId`(unique)、姓名/頭像、`onboardingStep`(1/2/3/4)、`completed`；**計費快取**：`plan`(預設 `free`)、`subscriptionStatus`、`paypalSubscriptionId`(unique)、`currentPeriodEnd`、`planUpdatedAt`。
- `OnboardingProfile`(1:1)：Step 2 公司/產業/規模/網站/母國；Step 3 `timeline`（語意已改為**公司成立年限**，slug `lt1y/1-3y/3-5y/gt5y`）、`budgetRange`（前端顯示為 **Seed money**，沿用 US$ 級距）、`needs[]`（服務需求）、`notes`、`targetMarkets[]`。
  - **表單欄位調整（2026-06）**：onboarding Step 3 只收「成立年限 / Seed money / 備註」；`targetMarkets` 已自所有表單移除、`needs` 僅保留在後台帳號頁（`/dashboard/account`，供 Tools 個人化）。兩欄仍存在於 DB schema、API 停止覆寫 → **既有資料零遺失、無 migration**。
- `Subscription`：PayPal 訂閱歷史（`paypalSubscriptionId` unique、`paypalPlanId`、`plan`、`status`、`currentPeriodEnd` 等），對帳/審計用。
- `WebhookEvent`：PayPal webhook 事件審計（event id 當主鍵，天然去重）。

### Google OAuth 設定（前置）

1. Google Cloud Console 建 OAuth Web client，同意畫面 scope `openid email profile`。
2. 授權 redirect URI 加 dev + prod 兩組（須與 `GOOGLE_REDIRECT_URI` 完全一致，路徑為 `/api/auth/google/callback`）。
3. 將 client id/secret + redirect uri 填入 `.env.local`（見上方環境變數）。未設定時 Email 流程仍可用，Google 按鈕會在前端顯示設定錯誤。

> Terms / Privacy 連結目前為 `#` placeholder，待有正式條款頁再接。

### 創辦人決策風格測驗（onboarding 之後）

完成 onboarding（requirements）後 → `/[locale]/quiz`（3 題、每題最多 4 選項）→ `/[locale]/quiz/result`（配對一位創辦人）→「完成」進 `/dashboard`。`User.onboardingStep` 擴成 4=quiz；`completed` 改在**測驗完成**才設 true。`/quiz/*` 由 proxy 以 `user_session` 守衛（同 onboarding）。

- **配對邏輯**（`src/lib/quiz/match.ts`，純函式）：**每個選項自帶決策風格三維向量**（planningDepth/executionStrength/visionClarity，0~100）；作答彙整各選項向量、逐維取平均 → 三維分數 → 配對**向量距離最近**的已發布創辦人。submit 端（`/api/quiz/submit`）**重新從 DB 取題目自算分數**，不信任前端；對舊格式選項（單一 `value` + 題目 `dimension`）保留 fallback，不致算錯或崩潰。
- **資料皆 DB、CMS 可編輯**：`QuizQuestion`（`optionA`–`optionD`，每題最多 4 選項，`optionC/D` 可空＝2 選項題；`dimension` 退化為分類標籤）、`Founder`（連結既有 `content/companies` 的 `companySlug`，結果頁放「看完整公司分析」）、`QuizSubmission`（每次作答存一筆，`choice` 為 A/B/C/D）。雙語文字用 Json `{en,"zh-tw"}`。
- **為何不直接擴充 `content/companies/*.json`**：那是檔案、Vercel FS 唯讀、網頁後台無法寫檔；故創辦人/題目改放 DB 並用 `companySlug` 連結現有公司頁。
- **Seed**（`prisma/seed.ts`，count-guard）：3 題**市場進入風格測驗**（4 選項 A/B/C/D，每選項帶三維向量；4 原型＝分析型/實驗型/ROI 型/夥伴型）+ 5 位台灣創辦人（張忠謀/郭台銘/洪鎮海/高清愿/中華電信），decisionStyle 為 sample，待後台精修。
- **換題／套用到 DB**（2026-06，4 選項制）：schema 新增 `optionC?`/`optionD?` 兩個**可空**欄位（加法式 migration、無資料遺失）。套用順序：`pnpm db:push` → `node scripts/reset-quiz-questions.mjs`（清空舊題）→ `pnpm db:seed`（灌入新 3 題）。或改用後台 `/admin/quiz-questions` 以 JSON 編輯。前端作答 UI（`QuizClient`）已重設計為**字母徽章 A/B/C/D 直式選項列**。

### 後台測驗管理（`/admin`，自動受保護）

- `/admin/quiz-submissions` — 唯讀清單（用戶 / 作答 / 配對創辦人 / 決策分數 / 時間 + 刪除）。
- `/admin/quiz-questions`、`/admin/founders` — 以 JSON 編輯器增刪改（含雙語、timeline、businessDetails 等巢狀結構）；API 在 `/api/admin/{quiz-questions,founders,quiz-submissions}`，皆 `requireAdmin` 把關。

## 會員專屬後台 + 訂閱金流（PayPal）

登入會員的自助 Dashboard，與 onboarding/quiz 共用 `user_session`。proxy 已把 `/dashboard`（及 `/company` 台灣企業智庫）納入保護（`^/(zh-tw/)?(onboarding|quiz|dashboard|company)`）；proxy 只樂觀驗 session，方案 gating 由各頁面 / API 的 DAL 即時查 DB（不在 proxy 查庫）。

### 路由

| 路徑 | 說明 |
| --- | --- |
| `/[locale]/dashboard` | **總覽（widget 儀表板，2026-07 改版，參考 `IMG_1172` 版面）**：`bg-primary` 漸層「今日重點」橫幅（依帳號狀態算下一步：onboarding→補資料／未測驗→做 quiz／free→升級／已就緒→逛企業）、每日管理提醒（引導/測驗/訂閱三狀態）、關鍵指標 4 格（**皆真實**：企業數 `countCompanies()` / 影片數 `getVideos().length` / 落地清單完成率 / 活動數 `getEvents().length`）、創辦人配對卡（取最新 `QuizSubmission` + 三維向量歐氏距離換算相似度%）、ROLL ON 教學影片卡（`Video` model 第一支）；右欄＝ROLL ON 助理（`CopilotPanel`，真 Claude API 串流對話 + 快捷）、重點機會（精選台灣公司 `getCompanyCards`）、近期活動。**指標/配對皆真實**（無 `IMG_1172` 的 $2.45M pipeline / 投資人數假數據）。 |
| `/[locale]/dashboard/profile` | **公司檔案**（2026-07）：唯讀展示會員 `OnboardingProfile`（公司/需求兩區，slug 經 `Auth.options.*` 轉 label），附「編輯」→ `/dashboard/account`；未填顯示引導卡。 |
| `/[locale]/dashboard/companies` | **台灣企業智庫**（2026-07）：`getCompanyList()`（`content/companies/*.json`，現 51 家）→ `DashboardCompanyList`（前台品牌紅版，含搜尋），每張卡連 `/company/[slug]`。公開目錄列表頁 `/company` 已移除，此後台頁為公司清單的唯一入口。 |
| `/[locale]/dashboard/playbooks`（+`[slug]`） | **知識手冊 Playbooks（2026-07）**：ROLL ON 募資／成長方法論指南，登入即可看。一份＝一個 `content/playbooks/<slug>.json`，由 `pnpm ingest:playbook` 把 `content/playbooks/_inbox/` 的 PDF 經 Claude 轉成雙語結構化 JSON。詳情頁用 `PlaybookArticle`（react-markdown + gfm）渲染 body。**雙用**：同一份內容也餵 Nova AI（`get_playbook` 工具）。 |
| `/[locale]/dashboard/crm\|pipeline\|notes` | **真 CRUD（2026-07，Pro 方案限定）**：各對應新 Prisma 表（`Contact` / `Deal` / `MeetingNote`，`userId` scope + `onDelete: Cascade`）。`requirePlan("pro")`→null 顯示付費牆（`PlanPaywall`），否則查該會員資料傳給 client 元件（`CrmManager` / `PipelineBoard` / `NotesManager`），新增/編輯/刪除後 `router.refresh()`。Pipeline 為 stage 分欄看板（MVP 用下拉改階段，不做拖拉）。Deal 可選連 CRM `Contact`（`SetNull`）。 |
| `/[locale]/dashboard/account` | 帳號 / 個人資料：顯示 + 編輯 `OnboardingProfile`（**不**推進 onboardingStep）+ 變更/設定密碼 + 刪除帳號（危險區，需輸入確認字）。 |
| `/[locale]/dashboard/billing` | 訂閱：目前方案 / 狀態 / 到期、訂閱 Pro/Business、取消、Enterprise 洽詢。 |
| `/[locale]/dashboard/billing/return` | PayPal 核准後返回頁，呼叫 confirm 即時對帳。 |
| `/[locale]/dashboard/tools` | **進入市場落地清單**（真工具）：`requirePlan("pro")`；依 `OnboardingProfile.needs` 由 `src/lib/tools/checklist.ts` 生成分組可勾選清單，勾選存 `User.checklistState`；未填 needs 顯示引導（引導去 `/dashboard/account` 填 needs，onboarding 已不收此題）、方案不足顯示升級牆。 |
| `/api/account/profile` | PATCH 更新 profile（自守衛 `getUserSession`）。 |
| `/api/account/password` | POST 變更/設定密碼（有密碼者需驗舊密碼；Google-only 免舊密碼直接設定）。 |
| `/api/account/delete` | POST 刪帳號（best-effort 取消 PayPal 訂閱 → `prisma.user.delete` cascade → 清 `user_session`）。 |
| `/api/tools/checklist` | PATCH 更新落地清單勾選（`requirePlan("pro")` 守衛，merge 進 `User.checklistState`）。 |
| `/api/{crm\|pipeline\|notes}` + `/[id]` | **會員 CRUD（2026-07）**：POST 建立 / PATCH 更新 / DELETE 刪除。自守衛 `getUserSession`（401）+ `requirePlan("pro")`（403），每筆以 `session.uid` scope（`updateMany`/`deleteMany` count 檢查，或 findFirst 驗擁有權），zod 驗證於 `src/lib/dashboard/schemas.ts`。**不重用** admin generic CRUD（那是 admin-only 且無 userId 過濾）。 |
| `/api/copilot` | **AI Copilot 串流（2026-07）**：POST，`getUserSession`+`requirePlan("pro")`+**每會員每日 50 則 rate limit** 守衛後以 `@anthropic-ai/sdk` `messages.stream` 逐字回傳（`ReadableStream`, `text/plain`）。model 取 `ANTHROPIC_MODEL`（預設 `claude-sonnet-5`），system prompt 帶會員 `profile` 公司資訊、依 locale 回覆。守衛失敗回真狀態碼（含超限 429）；串流開始後的錯誤以文字寫入（前端顯示全文）。成本護欄＝Pro-gate + 輸入長度/則數上限 + rate limit（DB-based，見 `src/lib/rate-limit.ts` / `RateCounter` 表）。需 `ANTHROPIC_API_KEY`（見環境變數）。 |
| `/api/billing/subscribe\|confirm\|cancel` | 建立 / 確認 / 取消訂閱（自守衛）。subscribe 會擋「已有 ACTIVE/APPROVED 訂閱者重複訂閱」（回 409 `alreadySubscribed`），避免重複扣款。 |
| `/api/billing/webhook` | PayPal webhook：不查 session、改以簽章驗證；冪等 + 對帳。 |

UI 元件在 `src/components/dashboard/`（`DashboardSidebar` / `AccountProfileForm` / `AccountSecurityForm` / `AccountDangerZone` / `ChecklistTool` / `BillingPanel` / `BillingReturn` / `DashboardCompanyList` / `PlanPaywall` / `CrmManager` / `PipelineBoard` / `NotesManager`），總覽 widget 在 `src/components/dashboard/home/`（`PriorityBanner` / `MetricsRow` / `AlertsRow` / `FounderMatchCard` / `TutorialVideoCard` / `TopOpportunitiesRail` / `UpcomingEventsRail`，皆 server component；`CopilotPanel` 為 client 串流對話）。CRUD 驗證 schema 在 `src/lib/dashboard/schemas.ts`（zod）。`DashboardSidebar` 的 `NAV` 陣列 + `NavKey` 集中管理側欄（新增頁面在此擴充；`soon:true` 顯示「即將」小標，目前無啟用者）。shell 內容欄寬 `max-w-6xl` 供雙欄總覽。輕量公司清單 getter（`getCompanyList` / `countCompanies` / `getCompanyCards`）在 `src/lib/company/content.ts`。i18n 在 `messages/*.json` 的 `Dashboard`（含 `home`/`profile`/`companies`/`comingSoon` 及 2026-07 新增 `gate`/`actions`/`crm`/`pipeline`/`notes` 與 `home.copilot.*` 對話鍵）/ `Billing` namespace，en 與 zh-tw 鍵完全平行。新依賴 `@anthropic-ai/sdk`；新資料表 `Contact`/`Deal`/`MeetingNote`/`RateCounter`（rate limit 計數）需跑 `pnpm db:push`（加法式）。安全強化（2026-07）：login/signup/改密碼皆套 DB-based rate limit（`src/lib/rate-limit.ts`，無 KV 故用 Neon 原子 UPSERT）+ login 等時比對消除帳號枚舉時序側信道；bcrypt cost 提到 12（`src/lib/auth/password.ts`）；JWT 驗證鎖 `HS256`；`api.ts` 對非預期 500 遮蔽內部細節（業務 4xx 仍全顯，符合「錯誤全顯前端」）；金流取消寬限期修正（`reconcile` 不再用 null 覆寫 `User.currentPeriodEnd`）。**知識手冊 Playbooks（2026-07）**：`content/playbooks/*.json`（loader `src/lib/playbook/content.ts`），來源 PDF 放 `content/playbooks/_inbox/`（gitignored）→ `pnpm ingest:playbook` 用 Claude（強制工具 + 扁平 schema + 串流累加 `input_json_delta`）轉雙語 JSON；**雙用** = 會員頁 `/dashboard/playbooks`（`PlaybookArticle` 渲染）+ Nova AI（`src/lib/ai/knowledge.ts` 的 `buildPlaybookIndex` 進 prompt、`tools.ts` 的 `get_playbook`、`policy.ts` 視為權威方法論）。每日新增＝丟 PDF 再跑一次 ingest，零改程式。

**入口接通**：登入 / onboarding / 測驗完成後由 `destinationFor`（`src/lib/auth/onboarding.ts`，`completed → /dashboard`）導向後台；全站 Navbar 有「會員中心」入口（靜態連結 → `/dashboard`，未登入由 proxy 導 `/login`）。

### 方案與 gating

- 方案邏輯單一事實來源：`src/lib/billing/plans.ts`（`PLAN_KEYS` / `PLAN_RANK` / `PLAN_CONFIG`，PayPal plan id 走 env 名）。價格顯示只信 i18n、邏輯只信此檔。
- gating：`src/lib/billing/gate.ts` 的 `getEffectivePlan` / `getUserPlan` / `requirePlan`。**寬限期**：付費方案僅在 `currentPeriodEnd > now` 且狀態授予存取（ACTIVE/PAST_DUE/CANCELLED）時有效，否則退回 free — 即使 PayPal 漏送 CANCELLED，到期也會自動降級。
- DAL：`src/lib/auth/account.ts` 的 `getCurrentAccount()`（React `cache()` 包裝、回安全 DTO，不含 passwordHash；含 `hasPassword` 布林與 `checklistState`）。

### PayPal 訂閱流程

1. **一次性設定**：`node --env-file=.env.local scripts/paypal-setup.mjs` 建立 Product + Pro/Business 月費 Plan（TWD），把印出的 `PAYPAL_PLAN_ID_*` 填回 `.env.local`。
2. **訂閱**：billing 頁 → `POST /api/billing/subscribe` 建立 PayPal 訂閱 → 前端 redirect 到核准頁 → 返回 `billing/return` → `POST /api/billing/confirm` 即時對帳。
3. **對帳權威來源**：`/api/billing/webhook`（驗章 → `WebhookEvent` 審計 → `reconcileById` 以 PayPal 為準更新 `User` + `Subscription`）。`reconcile` 為 idempotent，故 webhook 失敗回 500 讓 PayPal 重送是安全的。
4. PayPal 直打 REST（`src/lib/billing/paypal.ts`，**無 SDK 依賴**）；env 未設妥時 `isPaypalConfigured()` 回 false，前端顯示「金流尚未設定」而非崩潰。

> **schema 演進零資料遺失**：計費欄位 / 表全為 nullable 或有 default 的純疊加；用 `prisma db push`，**禁止 `--accept-data-loss`**（若 push 要求該旗標代表改成破壞性了，需退回改正）。
>
> **台灣電子發票（待辦，法遵需求）**：對台灣客戶收費須開立電子發票（綠界 ECPay / ezPay 發票 API），掛在 webhook `PAYMENT.SALE.COMPLETED` 後開立，另需 `Invoice` model 與買受人 / 統編 / 載具欄位。列為後續階段，不阻塞前面金流上線。

### Production 上線（Vercel）

正式站 canonical = **`https://www.rollgrp.com`**（apex `rollgrp.com` 會 307 導向 www）。⚠️ **webhook 與 `NEXT_PUBLIC_APP_URL` 一律用 `www`**——否則 PayPal 的 webhook POST 打到 apex 會被 307 擋下、不送達。

`.env.local` 不進版控，故 PayPal 設定要另外設進 Vercel production：

1. sandbox 憑證填 `.env.local` → `node --env-file=.env.local scripts/paypal-setup.mjs` 拿 `PAYPAL_PLAN_ID_*`。
2. 建 webhook：`node --env-file=.env.local scripts/paypal-create-webhook.mjs https://www.rollgrp.com/api/billing/webhook` → 取得 `PAYPAL_WEBHOOK_ID`（冪等：URL 已存在會查回現有 id）。
3. 設 Vercel production env（7 個）：`PAYPAL_ENV`、`PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET`、`PAYPAL_PLAN_ID_PRO`、`PAYPAL_PLAN_ID_BUSINESS`、`PAYPAL_WEBHOOK_ID`、`NEXT_PUBLIC_APP_URL=https://www.rollgrp.com`。
   模式：`vercel env rm NAME production --yes; printf '%s' "值" | vercel env add NAME production`。
4. `vercel deploy --prod --yes` 重新部署（`NEXT_PUBLIC_APP_URL` 為 build-time，必須先設好）。
5. 煙霧測試：對 `www.rollgrp.com` 建測試帳號 → `POST /api/billing/subscribe` 應回 200 + PayPal approveUrl。

**sandbox → live 切換**：PayPal 開 Live app → 換 `PAYPAL_ENV=live` + live `CLIENT_ID/SECRET` → 重跑 `paypal-setup.mjs`（live plan id）與 `paypal-create-webhook.mjs`（live webhook）→ 更新 Vercel env → redeploy。切換前把舊 sandbox secret 在 PayPal 後台 reset。

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
