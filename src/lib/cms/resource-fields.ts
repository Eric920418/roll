// 客戶端安全的欄位設定（不含 prisma），驅動泛型表單與列表表格

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "url" | "number" | "bool" | "localized" | "image";
  multiline?: boolean; // localized 用
  folder?: string; // image 用
  help?: string;
};

export type ResourceConfig = {
  label: string;
  fields: FieldDef[];
  /** 列表表格顯示的欄位（localized 取 en；image 顯示縮圖） */
  listColumns: { name: string; label: string }[];
};

export const resourceConfigs: Record<string, ResourceConfig> = {
  services: {
    label: "服務項目",
    fields: [
      { name: "slug", label: "Slug（網址）", type: "text", help: "對應 /services/[slug]，僅小寫字母數字與連字號" },
      { name: "icon", label: "圖示", type: "image", folder: "services" },
      { name: "title", label: "標題", type: "localized" },
      { name: "desc", label: "描述", type: "localized" },
      { name: "order", label: "排序", type: "number" },
      { name: "published", label: "顯示於前台", type: "bool" },
    ],
    listColumns: [
      { name: "title", label: "標題" },
      { name: "slug", label: "Slug" },
    ],
  },
  events: {
    label: "活動",
    fields: [
      { name: "date", label: "日期（顯示字串）", type: "localized" },
      { name: "title", label: "標題", type: "localized" },
      { name: "location", label: "地點", type: "localized" },
      { name: "description", label: "描述", type: "localized", multiline: true },
      { name: "image", label: "圖片", type: "image", folder: "events" },
      { name: "order", label: "排序", type: "number" },
      { name: "published", label: "顯示於前台", type: "bool" },
    ],
    listColumns: [
      { name: "title", label: "標題" },
      { name: "date", label: "日期" },
    ],
  },
  clients: {
    label: "客戶 Logo",
    fields: [
      { name: "name", label: "品牌名稱", type: "text" },
      { name: "logo", label: "Logo", type: "image", folder: "clients" },
      { name: "order", label: "排序", type: "number" },
      { name: "published", label: "顯示於前台", type: "bool" },
    ],
    listColumns: [{ name: "name", label: "名稱" }],
  },
  work: {
    label: "案例",
    fields: [
      { name: "group", label: "分組標題", type: "text" },
      { name: "image", label: "圖片", type: "image", folder: "work" },
      { name: "href", label: "連結（LinkedIn）", type: "url" },
      { name: "description", label: "描述", type: "localized", multiline: true },
      { name: "order", label: "排序", type: "number" },
      { name: "published", label: "顯示於前台", type: "bool" },
    ],
    listColumns: [
      { name: "group", label: "分組" },
      { name: "description", label: "描述" },
    ],
  },
  videos: {
    label: "影片 (Golden Ticket)",
    fields: [
      { name: "thumb", label: "縮圖", type: "image", folder: "videos" },
      { name: "href", label: "YouTube 連結", type: "url" },
      { name: "title", label: "標題", type: "localized" },
      { name: "views", label: "觀看數（顯示字串）", type: "text" },
      { name: "order", label: "排序", type: "number" },
      { name: "published", label: "顯示於前台", type: "bool" },
    ],
    listColumns: [{ name: "title", label: "標題" }],
  },
  insights: {
    label: "深度指南卡",
    fields: [
      { name: "slug", label: "Slug（對應 MDX 文章）", type: "text" },
      { name: "title", label: "標題", type: "localized" },
      { name: "blurb", label: "摘要", type: "localized", multiline: true },
      { name: "order", label: "排序", type: "number" },
      { name: "published", label: "顯示於前台", type: "bool" },
    ],
    listColumns: [
      { name: "title", label: "標題" },
      { name: "slug", label: "Slug" },
    ],
  },
};

export function getResourceConfig(key: string): ResourceConfig | null {
  return resourceConfigs[key] ?? null;
}
