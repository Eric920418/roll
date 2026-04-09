# ROLL ON. 企業官網

協助外商進入台灣與亞洲市場的顧問公司官網。

## 技術棧

- **Next.js 16** (App Router)
- **Tailwind CSS v4**
- **Motion** (framer-motion) - 頁面動畫
- **GSAP + ScrollTrigger** - 滾動驅動動畫
- **next-intl** - 中英雙語 i18n
- **pnpm** - 套件管理

## 開發

```bash
pnpm install
pnpm dev
```

開啟 [http://localhost:3000](http://localhost:3000)

## 專案結構

```
src/
├── app/[locale]/        # i18n 路由 (zh-tw / en)
├── components/
│   ├── layout/          # Navbar, Footer
│   ├── sections/        # Hero, RollMap, TaiwanMap, AboutUs, Services, Work, Clients, GoldenTicket
│   └── ui/              # ScrollReveal, CounterAnimation, LanguageSwitch
├── i18n/                # next-intl 設定
├── lib/                 # GSAP 註冊
└── messages/            # 翻譯檔 (zh-tw.json, en.json)
```

## 首頁 Sections

1. **Hero** - 深酒紅背景 + ROLL ON. 大標題
2. **ROLL MAP** - 全球數據展示 + 計數動畫 + 排名列表
3. **Taiwan Map** - GSAP ScrollTrigger 地圖縮放 + 橋樑動畫
4. **About Us** - 核心價值文字逐段出現
5. **Services** - 6 項服務 + Investor Access
6. **R work** - 作品案例卡片
7. **R Clients** - 客戶 logo
8. **Golden Ticket** - YouTube 頻道預覽卡（頭像 / 訂閱鈕 / 3 個 Shorts 縮圖 + 雙語字幕）+ 簽名
9. **Footer** - 聯絡表單

## 部署

部署至 Vercel，Region: `hkg1`（香港，最近台灣的節點）。

```bash
pnpm build
```
