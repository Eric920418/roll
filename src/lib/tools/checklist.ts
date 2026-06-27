import type { Locale } from "@/i18n/routing";

// 依用戶 onboarding 選的 needs，生成個人化「台灣/亞洲落地清單」。
// 內容為初始 sample，可後續精修。item.key 必須穩定（持久化勾選狀態）。

type Dual = { en: string; "zh-tw": string };

type Template = { title: Dual; items: Dual[] };

const TEMPLATES: Record<string, Template> = {
  "market-entry": {
    title: { en: "Market entry", "zh-tw": "市場進入" },
    items: [
      {
        en: "Choose your entry vehicle (branch / subsidiary / rep office)",
        "zh-tw": "選擇進入形式（分公司 / 子公司 / 辦事處）",
      },
      {
        en: "File FIA foreign investment approval",
        "zh-tw": "申請 FIA 外國人投資審查",
      },
      {
        en: "Secure a registered office address & business registration",
        "zh-tw": "取得登記營業地址與公司登記",
      },
      {
        en: "Open a corporate bank account",
        "zh-tw": "開立公司銀行帳戶",
      },
    ],
  },
  legal: {
    title: { en: "Legal & compliance", "zh-tw": "法務與合規" },
    items: [
      {
        en: "Register the company entity with MOEA",
        "zh-tw": "向經濟部完成公司設立登記",
      },
      {
        en: "Complete tax registration (business tax / VAT)",
        "zh-tw": "完成稅籍登記（營業稅）",
      },
      {
        en: "Draft compliant employment contracts",
        "zh-tw": "擬定合規的勞動契約",
      },
      {
        en: "Confirm any industry-specific licenses / permits",
        "zh-tw": "確認產業特許 / 許可證",
      },
    ],
  },
  fundraising: {
    title: { en: "Fundraising", "zh-tw": "募資" },
    items: [
      {
        en: "Define raise amount, round type, and use of funds",
        "zh-tw": "確定募資金額、輪次與資金用途",
      },
      {
        en: "Build a Taiwan / Asia-focused pitch deck & data room",
        "zh-tw": "準備聚焦台灣 / 亞洲的 pitch deck 與 data room",
      },
      {
        en: "Map local VCs, angels, and government grants",
        "zh-tw": "盤點在地創投、天使與政府補助",
      },
      {
        en: "Prepare an 18-month financial model & cap table",
        "zh-tw": "備妥 18 個月財務模型與股權結構表",
      },
    ],
  },
  marketing: {
    title: { en: "Marketing", "zh-tw": "行銷" },
    items: [
      {
        en: "Localize brand messaging & website (zh-TW)",
        "zh-tw": "在地化品牌訊息與網站（繁中）",
      },
      {
        en: "Set up local social channels (LINE / IG / FB)",
        "zh-tw": "建立在地社群（LINE / IG / FB）",
      },
      {
        en: "Plan a launch PR & KOL outreach list",
        "zh-tw": "規劃上市 PR 與 KOL 名單",
      },
      {
        en: "Define the first-90-day acquisition funnel & KPIs",
        "zh-tw": "訂定前 90 天獲客漏斗與 KPI",
      },
    ],
  },
  "sales-channel": {
    title: { en: "Sales channel", "zh-tw": "銷售通路" },
    items: [
      {
        en: "Identify target distributors / retailers",
        "zh-tw": "鎖定目標經銷 / 通路夥伴",
      },
      {
        en: "Prepare channel pricing & margin structure",
        "zh-tw": "準備通路定價與毛利結構",
      },
      {
        en: "Draft distribution / agency agreements",
        "zh-tw": "擬定經銷 / 代理合約",
      },
      {
        en: "Plan logistics, import, and after-sales",
        "zh-tw": "規劃物流、進口與售後",
      },
    ],
  },
  "investor-access": {
    title: { en: "Investor access", "zh-tw": "投資人對接" },
    items: [
      {
        en: "Define your ideal investor profile",
        "zh-tw": "定義理想投資人輪廓",
      },
      {
        en: "Get a warm intro via the Asia Founders Club",
        "zh-tw": "透過 Asia Founders Club 取得引薦",
      },
      {
        en: "Prepare a one-pager & follow-up cadence",
        "zh-tw": "備妥 one-pager 與跟進節奏",
      },
      {
        en: "Track conversations in a simple CRM",
        "zh-tw": "用簡單 CRM 追蹤對話",
      },
    ],
  },
};

// 顯示順序（與 onboarding needs 的概念順序一致）
const ORDER = [
  "market-entry",
  "legal",
  "fundraising",
  "marketing",
  "sales-channel",
  "investor-access",
];

export type ChecklistGroupView = {
  need: string;
  title: string;
  items: { key: string; text: string }[];
};

/** 依用戶選的 needs 產生清單；沒選任何 need → 回 []（頁面顯示引導去填資料）。 */
export function buildChecklist(
  needs: string[],
  locale: Locale,
): ChecklistGroupView[] {
  const selected = new Set(needs);
  return ORDER.filter((n) => selected.has(n) && TEMPLATES[n]).map((need) => {
    const tpl = TEMPLATES[need];
    return {
      need,
      title: tpl.title[locale] ?? tpl.title.en,
      items: tpl.items.map((it, i) => ({
        key: `${need}-${i + 1}`,
        text: it[locale] ?? it.en,
      })),
    };
  });
}
