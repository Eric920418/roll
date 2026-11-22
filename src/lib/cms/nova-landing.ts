import type { Locale } from "@/i18n/routing";
import { validRollonAsset } from "./rollon-v10";

type FieldType = "text" | "textarea" | "date" | "image" | "url";
type Field = { name: string; label: string; type: FieldType; defaultValue: string };
type Group = { label: string; fields: Field[] };

function field(name: string, label: string, type: FieldType, defaultValue = ""): Field {
  return { name, label, type, defaultValue };
}

function bilingual(name: string, label: string, zh: string, en: string, type: "text" | "textarea" = "text") {
  return [
    field(`${name}.zh-tw`, `${label}（繁中）`, type, zh),
    field(`${name}.en`, `${label}（英文）`, type, en),
  ];
}

export const novaNetworkRoles = [
  { id: "founders", mark: "↗", zh: "創辦人", en: "Founders", zhBody: "交換經驗與客戶洞察", enBody: "Share experience and customer insight" },
  { id: "mentors", mark: "✳", zh: "認證導師", en: "Certified mentors", zhBody: "一起討論眼前最重要的問題", enBody: "Work through the question that matters now" },
  { id: "investors", mark: "↔", zh: "投資人", en: "Investors", zhBody: "以可核對成果開始認識", enBody: "Start with evidence you can verify" },
  { id: "partners", mark: "＋", zh: "合作夥伴", en: "Partners", zhBody: "找到需求互補的合作機會", enBody: "Find complementary needs" },
  { id: "buyers", mark: "→", zh: "買家", en: "Buyers", zhBody: "從真實需求開始對話", enBody: "Start a conversation around real needs" },
] as const;

export const novaCommunityCards = ["roundtable", "updateTwo", "updateThree"] as const;

export const novaLandingSections = {
  network: {
    label: "新創生態系",
    groups: [
      { label: "區塊標題與按鈕", fields: [
        ...bilingual("eyebrow", "小標", "新創生態系", "Value Network"),
        ...bilingual("title", "標題", "讓對的人，找到你。", "Let the right people find you."),
        ...bilingual("cta", "探索按鈕", "探索新創生態系", "Explore Value Network"),
        ...bilingual("cardCta", "卡片入口文字（五張共用）", "登入探索", "Log in to explore"),
      ] },
      ...novaNetworkRoles.map(role => ({ label: role.zh, fields: [
        ...bilingual(`${role.id}.title`, "卡片名稱", role.zh, role.en),
        ...bilingual(`${role.id}.body`, "卡片說明", role.zhBody, role.enBody, "textarea"),
        field(`${role.id}.image`, "卡片圖片（清空使用原符號）", "image"),
      ] })),
    ],
  },
  community: {
    label: "創辦人社群",
    groups: [
      { label: "區塊標題與按鈕", fields: [
        ...bilingual("eyebrow", "小標", "創辦人社群", "FOUNDER COMMUNITY"),
        ...bilingual("title", "標題", "來自社群的最新動態。", "Live from the community."),
        ...bilingual("cta", "按鈕文字", "LinkedIn", "LinkedIn"),
        field("link", "按鈕連結（留白使用全站 LinkedIn）", "url"),
      ] },
      ...novaCommunityCards.map((id, index) => {
        const roundtable = id === "roundtable";
        return { label: `社群卡片 ${index + 1}`, fields: [
          ...bilingual(`${id}.eyebrow`, "分類", roundtable ? "圓桌會議" : "NOVA AI · 社群動態", roundtable ? "ROUNDTABLE" : "NOVA AI · COMMUNITY"),
          ...bilingual(`${id}.title`, "標題", roundtable ? "把想法帶進對話。" : "即將推出", roundtable ? "Bring your idea to the table." : "Coming soon"),
          field(`${id}.date`, "日期", "date", roundtable ? "2026-11-16" : ""),
          ...bilingual(`${id}.body`, "內文", roundtable ? "與 Taiwan Startup Hub、方舟計劃（Ark Project）合辦。\n\n時間、地點與參加方式將另行公布。" : "", roundtable ? "Co-hosted with Taiwan Startup Hub and Ark Project.\n\nTime, location and participation details will be announced." : "", "textarea"),
          field(`${id}.link`, "卡片連結（選填，點標題開啟）", "url"),
          field(`${id}.image`, "卡片圖片（選填）", "image"),
        ] };
      }),
    ],
  },
} satisfies Record<string, { label: string; groups: Group[] }>;

export type NovaLandingSection = keyof typeof novaLandingSections;
export const novaLandingSettingPrefix = "novaLanding.";
export const novaLandingSettingKey = (section: NovaLandingSection) => `${novaLandingSettingPrefix}${section}`;
export function isNovaLandingSection(section: string): section is NovaLandingSection {
  return Object.hasOwn(novaLandingSections, section);
}

export function novaLandingHttps(value: string): string | null {
  try {
    if (!/^https:\/\//i.test(value)) return null;
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function validField({ type }: Field, value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (type === "image") return validRollonAsset(value, "");
  if (type === "url") return value === "" || (value.length <= 2000 && novaLandingHttps(value) !== null);
  if (type === "date") {
    if (value === "") return true;
    const date = new Date(`${value}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  return type === "textarea" ? value.length <= 2500 : value.trim() !== "" && value.length <= 180;
}

export function validateNovaLanding(section: NovaLandingSection, value: Record<string, unknown>) {
  const fields = new Map(novaLandingSections[section].groups.flatMap(group => group.fields.map(field => [field.name, { ...field, label: `${group.label} — ${field.label}` }] as const)));
  return Object.entries(value).flatMap(([name, input]) => {
    const field = fields.get(name);
    if (!field) return [`未知欄位：${name}`];
    if (validField(field, input)) return [];
    const instructions = {
      text: "請輸入 1 至 180 字元",
      textarea: "請輸入 2,500 字元以內",
      date: "請選擇有效日期",
      image: "請上傳圖片或清空欄位",
      url: "請輸入有效的 HTTPS 網址或清空欄位",
    };
    return [`${field.label}：${instructions[field.type]}`];
  });
}

export function resolveNovaLanding(section: NovaLandingSection, values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(novaLandingSections[section].groups.flatMap(({ fields }) => fields.map(field => {
    const value = values[field.name];
    return [field.name, validField(field, value) ? value.trim() : field.defaultValue];
  })));
}

export function novaCommunityDate(value: string, locale: Locale) {
  const [year, month, day] = value.split("-");
  if (locale === "zh-tw") return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
  const monthLabel = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`)).toUpperCase();
  return `${monthLabel} ${Number(day)} · ${year}`;
}
