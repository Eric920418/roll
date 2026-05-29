import { z } from "zod";

/** 雙語字串：en 與 zh-tw 皆需提供（允許空字串，前台會 fallback） */
export const localized = z.object({
  en: z.string(),
  "zh-tw": z.string(),
});

const baseList = {
  order: z.coerce.number().int().default(0),
  published: z.boolean().default(true),
};

export const serviceSchema = z.object({
  slug: z
    .string()
    .min(1, "slug 必填")
    .regex(/^[a-z0-9-]+$/, "slug 僅能含小寫字母、數字與連字號"),
  icon: z.string().min(1, "圖示必填"),
  title: localized,
  desc: localized,
  ...baseList,
});

export const eventSchema = z.object({
  date: localized,
  title: localized,
  location: localized,
  description: localized,
  image: z.string().nullable().optional(),
  ...baseList,
});

export const clientSchema = z.object({
  name: z.string().min(1, "名稱必填"),
  logo: z.string().min(1, "Logo 必填"),
  ...baseList,
});

export const workSchema = z.object({
  group: z.string().min(1, "分組必填"),
  image: z.string().min(1, "圖片必填"),
  href: z.string().url("連結需為合法網址"),
  description: localized,
  ...baseList,
});

export const videoSchema = z.object({
  thumb: z.string().min(1, "縮圖必填"),
  href: z.string().url("連結需為合法網址"),
  title: localized,
  views: z.string().default(""),
  ...baseList,
});

export const insightSchema = z.object({
  slug: z
    .string()
    .min(1, "slug 必填")
    .regex(/^[a-z0-9-]+$/, "slug 僅能含小寫字母、數字與連字號"),
  title: localized,
  blurb: localized,
  ...baseList,
});

export const contactSchema = z.object({
  name: z.string().min(1, "請填寫姓名").max(200),
  email: z.string().email("Email 格式不正確"),
  message: z.string().min(1, "請填寫訊息").max(5000),
  locale: z.string().optional(),
  // honeypot：機器人會填，真人不會
  company: z.string().optional(),
});

export type ServiceInput = z.infer<typeof serviceSchema>;
export type EventInput = z.infer<typeof eventSchema>;
export type ClientInput = z.infer<typeof clientSchema>;
export type WorkInput = z.infer<typeof workSchema>;
export type VideoInput = z.infer<typeof videoSchema>;
export type InsightInput = z.infer<typeof insightSchema>;
