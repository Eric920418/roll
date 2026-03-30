# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
pnpm install      # 安裝依賴
pnpm dev           # 開發伺服器 http://localhost:3000
pnpm build         # 生產建置
pnpm lint          # ESLint 檢查
```

## Architecture

ROLL ON. 企業官網 — 協助外商進入台灣與亞洲市場的顧問公司單頁式官網。

**Tech stack:** Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + Motion (framer-motion) + GSAP ScrollTrigger + next-intl i18n

### i18n 路由

- 雙語：`zh-tw`（預設）、`en`，配置在 `src/i18n/routing.ts`，使用 `localePrefix: "as-needed"`（預設語系不帶前綴）
- Middleware (`src/middleware.ts`) 處理 locale 偵測與重導
- 翻譯檔在 `messages/zh-tw.json` 和 `messages/en.json`
- next-intl 插件在 `next.config.ts` 載入，指向 `src/i18n/request.ts`

### 頁面結構

- `src/app/layout.tsx` — 最外層 root layout（僅 metadata）
- `src/app/[locale]/layout.tsx` — 實際 HTML 骨架，載入字型（Space Grotesk / Inter / Noto Sans TC）、`NextIntlClientProvider`
- `src/app/[locale]/page.tsx` — 單頁首頁，依序組合所有 section components
- `params` 在 Next.js 16 中是 `Promise<{ locale: string }>`，必須 `await`

### 動畫

- GSAP + ScrollTrigger：透過 `src/lib/gsap-register.ts`（`"use client"`）統一註冊，所有使用 GSAP 的元件從此檔 import
- Motion (framer-motion)：用於非滾動驅動的進場動畫

### 部署

Vercel，Region `hkg1`（香港），設定在 `vercel.json`。
