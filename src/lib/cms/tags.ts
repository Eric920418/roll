// 內容快取標籤（content getter 與 admin API 失效共用）
export const TAGS = {
  services: "services",
  events: "events",
  clients: "clients",
  work: "work",
  videos: "videos",
  insights: "insights",
} as const;

export type ResourceKey = keyof typeof TAGS;

// 設定（Setting 表）共用標籤
export const SETTINGS_TAG = "settings";
