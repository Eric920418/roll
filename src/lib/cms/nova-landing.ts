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
  { id: "founders", mark: "↗", zh: "創辦人生態圈", en: "Founder ecosystem", zhBody: "新創與中小企業，互相交換資源與客戶洞察。", enBody: "Startups and small businesses exchanging resources and customer insight." },
  { id: "mentors", mark: "✳", zh: "實戰導師", en: "Experienced mentors", zhBody: "有實戰經驗的企業家，帶你的公司走向成功，不是分析師。", enBody: "Entrepreneurs with hands-on experience to help your company succeed." },
  { id: "investors", mark: "↔", zh: "投資人", en: "Investors", zhBody: "投資人設定追蹤條件，你達標時 NOVA 自動通知他。", enBody: "Investors set conditions to follow. NOVA notifies them when you meet those conditions." },
  { id: "partners", mark: "＋", zh: "合作夥伴", en: "Partners", zhBody: "找到同產業的前輩，不再單打獨鬥。", enBody: "Meet experienced peers in your industry and move forward together." },
  { id: "buyers", mark: "→", zh: "探索海外市場", en: "Explore overseas markets", zhBody: "不付顧問費、不租展位，先向當地人了解市場。", enBody: "Understand the market through local people before paying consulting fees or renting a booth." },
] as const;

export const novaCommunityCards = ["roundtable", "updateTwo", "updateThree"] as const;

export const novaLandingSections = {
  network: {
    label: "新創生態系",
    groups: [
      { label: "區塊標題與按鈕", fields: [
        ...bilingual("title", "標題", "讓對的人，找到你。", "Let the right people find you."),
        ...bilingual("cta", "探索按鈕", "探索新創生態系", "Explore Value Network"),
      ] },
      ...novaNetworkRoles.map(role => ({ label: role.zh, fields: [
        ...bilingual(`${role.id}.title`, "卡片名稱", role.zh, role.en),
        ...bilingual(`${role.id}.body`, "卡片說明", role.zhBody, role.enBody, "textarea"),
        ...bilingual(`${role.id}.imageLabel`, "圖片待補說明",
          ({ founders: "照片：創辦人交流", mentors: "照片：導師討論", investors: "照片：投資人會面", partners: "照片：同產業前輩交流", buyers: "照片：海外市場交流" })[role.id],
          ({ founders: "Photo: Founders exchanging ideas", mentors: "Photo: Mentor discussion", investors: "Photo: Investor meeting", partners: "Photo: Industry peers", buyers: "Photo: Overseas market exchange" })[role.id]),
        field(`${role.id}.image`, "卡片圖片（清空顯示設計稿待補位置）", "image"),
      ] })),
    ],
  },
  community: {
    label: "創辦人社群",
    groups: [
      { label: "區塊標題與按鈕", fields: [
        ...bilingual("title", "標題", "來自社群的最新動態。", "Live from the community."),
        ...bilingual("cta", "按鈕文字", "LinkedIn", "LinkedIn"),
        field("link", "按鈕連結（留白使用全站 LinkedIn）", "url"),
      ] },
      ...novaCommunityCards.map((id, index) => {
        const roundtable = id === "roundtable";
        const forum = id === "updateTwo";
        const titles = roundtable
          ? ["把想法帶進對話。", "Bring your idea to the table."]
          : forum ? ["NOVA AI × 政大創業聯會", "NOVA AI × NCCU Entrepreneurship Community"]
          : ["IxDF 設計師 × 創辦人之夜", "IxDF designers × founders night"];
        const labels = roundtable ? ["圓桌會議", "ROUNDTABLE"]
          : forum ? ["體驗 NOVA AI（邀請政治大學學生）", "EXPERIENCE NOVA AI · NCCU STUDENTS"]
          : ["即將推出・社群活動", "COMING SOON · COMMUNITY"];
        const images = roundtable ? ["活動主視覺：AI 你會 build，但你賣得出去嗎？", "Event artwork: You can build AI. Can you sell it?"]
          : forum ? ["照片：Tie-Breaker 創新論壇主視覺", "Photo: Tie-Breaker innovation forum artwork"]
          : ["照片：IxDF × HYPE GVA Taiwan 社群活動", "Photo: IxDF × HYPE GVA Taiwan community event"];
        const bodies = roundtable ? ["與 Taiwan Startup Hub、方舟計劃（Ark Project）合辦。", "Co-hosted with Taiwan Startup Hub and Ark Project."]
          : forum ? ["NOVA AI 在 Tie-Breaker 創新論壇設攤，歡迎來現場聊聊你的創業想法，體驗 NOVA。地點：Taipei Aura 松山南京文教。", "Meet NOVA AI at the Tie-Breaker innovation forum to discuss your startup idea and try NOVA. Venue: Taipei Aura, Songshan Nanjing."]
          : ["與 IxDF、HYPE GVA Taiwan 合辦的社群活動，連結設計師與創辦人。", "A community event with IxDF and HYPE GVA Taiwan, connecting designers and founders."];
        return { label: `社群卡片 ${index + 1}`, fields: [
          ...bilingual(`${id}.eyebrow`, "分類", labels[0], labels[1]),
          ...bilingual(`${id}.title`, "標題", titles[0], titles[1]),
          field(`${id}.date`, "日期", "date", roundtable ? "2026-11-16" : forum ? "2026-11-29" : ""),
          ...bilingual(`${id}.dateLabel`, "日期補充／待定文字", forum ? "Tie-Breaker 創新論壇" : roundtable ? "" : "Coming Soon", forum ? "Tie-Breaker Innovation Forum" : roundtable ? "" : "Coming Soon", "textarea"),
          ...bilingual(`${id}.imageLabel`, "圖片待補說明", images[0], images[1]),
          ...bilingual(`${id}.body`, "內文", bodies[0], bodies[1], "textarea"),
          field(`${id}.link`, "卡片連結（選填，點標題開啟）", "url"),
          field(`${id}.image`, "卡片圖片（選填）", "image", `/nova/community/${roundtable ? "roundtable-event" : forum ? "nccu-campus" : "ixdf-founders-night"}.webp`),
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

function validField({ type, defaultValue }: Field, value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (type === "image") return validRollonAsset(value, defaultValue);
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
