import type { Locale } from "@/i18n/routing";
import { z } from "zod";

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
        en: "Request a warm intro through the ROLL ON. contact channel",
        "zh-tw": "透過 ROLL ON. 聯絡管道申請投資人引薦",
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
] as const;

export type ChecklistGroupView = {
  need: string;
  title: string;
  items: { key: string; text: string }[];
};

/** 所有合法 checklist item key（`need-i`）；供 PATCH 白名單過濾，擋任意鍵灌入撐大 JSON。 */
export const ALL_CHECKLIST_KEYS: ReadonlySet<string> = new Set(
  ORDER.flatMap((need) =>
    (TEMPLATES[need]?.items ?? []).map((_, i) => `${need}-${i + 1}`),
  ),
);

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

// ── 可編輯 Milestones 看板 ────────────────────────────────────────────────

export const MILESTONE_GROUP_KEYS = [...ORDER, "weekly", "monthly"] as const;
export type MilestoneGroupKey = (typeof MILESTONE_GROUP_KEYS)[number];
export type MilestoneCadence = "project" | "weekly" | "monthly";

const milestoneItemSchema = z.object({
  id: z.string().min(1).max(100),
  groupKey: z.enum(MILESTONE_GROUP_KEYS),
  title: z.string().trim().min(1).max(200),
  done: z.boolean(),
});

export const milestoneConfigSchema = z.object({
  groupTitles: z.record(z.string(), z.string().trim().min(1).max(80)).default({}),
  items: z.array(milestoneItemSchema).max(100).default([]),
  // 系統項目走覆寫層而非改寫模板：改名記在 systemTitles、刪除只記 key，
  // 勾選狀態仍留在 checklistState，因此 key 永遠穩定、也隨時可還原預設。
  systemTitles: z.record(z.string(), z.string().trim().min(1).max(200)).default({}),
  hiddenSystemKeys: z.array(z.string().min(1).max(100)).max(200).default([]),
});

export type MilestoneConfig = z.infer<typeof milestoneConfigSchema>;

export const milestoneMutationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("renameGroup"),
    groupKey: z.enum(MILESTONE_GROUP_KEYS),
    title: z.string().trim().min(1, "名稱必填").max(80, "名稱最多 80 字"),
  }),
  z.object({
    type: z.literal("addItem"),
    groupKey: z.enum(MILESTONE_GROUP_KEYS),
    title: z.string().trim().min(1, "內容必填").max(200, "內容最多 200 字"),
  }),
  z.object({
    type: z.literal("updateItem"),
    itemId: z.string().min(1).max(100),
    title: z.string().trim().min(1, "內容必填").max(200, "內容最多 200 字").optional(),
    done: z.boolean().optional(),
  }).refine((value) => value.title !== undefined || value.done !== undefined, {
    message: "至少要更新一個欄位",
  }),
  z.object({
    type: z.literal("deleteItem"),
    itemId: z.string().min(1).max(100),
  }),
  z.object({
    type: z.literal("updateSystemItem"),
    itemKey: z.string().min(1).max(100),
    title: z.string().trim().min(1, "內容必填").max(200, "內容最多 200 字"),
  }),
  z.object({
    type: z.literal("deleteSystemItem"),
    itemKey: z.string().min(1).max(100),
  }),
  z.object({
    type: z.literal("restoreSystemItems"),
    groupKey: z.enum(MILESTONE_GROUP_KEYS),
  }),
]);

export type MilestoneMutation = z.infer<typeof milestoneMutationSchema>;

export type MilestoneItemView = {
  key: string;
  text: string;
  done: boolean;
  source: "system" | "custom";
  /** 系統項目的模板原文；供前端「還原預設」就地還原，不必重新抓資料 */
  defaultText?: string;
  /** 系統項目被使用者刪除（軟刪）；前端不渲染，但保留以便還原 */
  hidden?: boolean;
};

export type MilestoneGroupView = {
  key: MilestoneGroupKey;
  title: string;
  cadence: MilestoneCadence;
  items: MilestoneItemView[];
};

const RECURRING_TITLES: Record<"weekly" | "monthly", Dual> = {
  weekly: { en: "Weekly", "zh-tw": "每週" },
  monthly: { en: "Monthly", "zh-tw": "每月" },
};

export function readMilestoneConfig(value: unknown): MilestoneConfig {
  const parsed = milestoneConfigSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : { groupTitles: {}, items: [], systemTitles: {}, hiddenSystemKeys: [] };
}

function defaultMilestoneGroupTitle(key: MilestoneGroupKey, locale: Locale): string {
  if (key === "weekly" || key === "monthly") {
    return RECURRING_TITLES[key][locale] ?? RECURRING_TITLES[key].en;
  }
  return TEMPLATES[key].title[locale] ?? TEMPLATES[key].title.en;
}

/**
 * 保留既有 needs/checklistState 作為系統項目的來源，只把使用者新增與改名疊上去。
 * 因此舊會員的完成狀態不需搬移，也不會被 Milestones 編輯覆蓋。
 */
export function buildMilestoneBoard(
  needs: string[],
  locale: Locale,
  checklistState: Record<string, boolean>,
  configValue: unknown,
): MilestoneGroupView[] {
  const config = readMilestoneConfig(configValue);
  const selected = new Set(needs);
  const visibleKeys: MilestoneGroupKey[] = [
    ...ORDER.filter((key) => selected.has(key)),
    "weekly",
    "monthly",
  ];

  // 已新增內容的舊群組即使後來從 Account 取消需求，也繼續顯示，避免資料看似消失。
  for (const item of config.items) {
    if (!visibleKeys.includes(item.groupKey)) visibleKeys.push(item.groupKey);
  }

  return visibleKeys.map((key) => {
    const hidden = new Set(config.hiddenSystemKeys);
    const systemItems = key === "weekly" || key === "monthly" || !selected.has(key)
      ? []
      : TEMPLATES[key].items.map((item, index) => {
          const itemKey = `${key}-${index + 1}`;
          const defaultText = item[locale] ?? item.en;
          return {
            key: itemKey,
            text: config.systemTitles[itemKey] || defaultText,
            done: Boolean(checklistState[itemKey]),
            source: "system" as const,
            defaultText,
            hidden: hidden.has(itemKey),
          };
        });

    const customItems = config.items
      .filter((item) => item.groupKey === key)
      .map((item) => ({
        key: item.id,
        text: item.title,
        done: item.done,
        source: "custom" as const,
      }));

    return {
      key,
      title: config.groupTitles[key] || defaultMilestoneGroupTitle(key, locale),
      cadence: key === "weekly" ? "weekly" : key === "monthly" ? "monthly" : "project",
      items: [...systemItems, ...customItems],
    };
  });
}

/** 用模板反推群組的系統 item key；避免用字串 prefix 比對（market-entry / marketing 易誤傷）。 */
function systemKeysForGroup(groupKey: MilestoneGroupKey): Set<string> {
  const tpl = TEMPLATES[groupKey];
  if (!tpl) return new Set();
  return new Set(tpl.items.map((_, index) => `${groupKey}-${index + 1}`));
}

/** 系統 item key 白名單，擋任意鍵灌入撐大 milestoneConfig JSON。 */
function assertSystemKey(itemKey: string): void {
  if (!ALL_CHECKLIST_KEYS.has(itemKey)) throw new Error("找不到這筆系統里程碑");
}

export function applyMilestoneMutation(
  configValue: unknown,
  mutation: MilestoneMutation,
  newItemId?: string,
): MilestoneConfig {
  const config = readMilestoneConfig(configValue);

  if (mutation.type === "renameGroup") {
    return {
      ...config,
      groupTitles: { ...config.groupTitles, [mutation.groupKey]: mutation.title },
    };
  }

  if (mutation.type === "addItem") {
    if (!newItemId) throw new Error("新增項目缺少識別碼");
    if (config.items.length >= 100) throw new Error("自訂里程碑已達上限（100 筆）");
    return {
      ...config,
      items: [
        ...config.items,
        { id: newItemId, groupKey: mutation.groupKey, title: mutation.title, done: false },
      ],
    };
  }

  if (mutation.type === "updateSystemItem") {
    assertSystemKey(mutation.itemKey);
    return {
      ...config,
      systemTitles: { ...config.systemTitles, [mutation.itemKey]: mutation.title },
      // 改名等同「取消刪除」：使用者顯然還要這一筆
      hiddenSystemKeys: config.hiddenSystemKeys.filter((key) => key !== mutation.itemKey),
    };
  }

  if (mutation.type === "deleteSystemItem") {
    assertSystemKey(mutation.itemKey);
    if (config.hiddenSystemKeys.includes(mutation.itemKey)) return config;
    return {
      ...config,
      hiddenSystemKeys: [...config.hiddenSystemKeys, mutation.itemKey],
    };
  }

  if (mutation.type === "restoreSystemItems") {
    const keys = systemKeysForGroup(mutation.groupKey);
    return {
      ...config,
      systemTitles: Object.fromEntries(
        Object.entries(config.systemTitles).filter(([key]) => !keys.has(key)),
      ),
      hiddenSystemKeys: config.hiddenSystemKeys.filter((key) => !keys.has(key)),
    };
  }

  const index = config.items.findIndex((item) => item.id === mutation.itemId);
  if (index < 0) throw new Error("找不到這筆自訂里程碑");

  if (mutation.type === "deleteItem") {
    return { ...config, items: config.items.filter((item) => item.id !== mutation.itemId) };
  }

  return {
    ...config,
    items: config.items.map((item, itemIndex) => itemIndex === index
      ? {
          ...item,
          ...(mutation.title !== undefined && { title: mutation.title }),
          ...(mutation.done !== undefined && { done: mutation.done }),
        }
      : item),
  };
}
