import { z } from "zod";

// 會員後台 CRM / Pipeline / Notes 的請求驗證（zod v4）。
// create = 建立必填；update = 全部可選（PATCH 只帶要改的欄位）。
// 錯誤訊息由 zodMessage() 組成單一字串，route 端以 fail(msg, 400) 全文回前端。

export function zodMessage(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.map(String).join(".") || "欄位"}：${i.message}`)
    .join("；");
}

const optStr = z.string().trim().optional();

// ── CRM Contact ──
export const CONTACT_STATUSES = ["lead", "active", "closed"] as const;

export const contactCreateSchema = z.object({
  name: z.string().trim().min(1, "必填"),
  company: optStr,
  email: optStr,
  phone: optStr,
  status: z.enum(CONTACT_STATUSES).optional(),
  notes: optStr,
});

export const contactUpdateSchema = z.object({
  name: z.string().trim().min(1, "必填").optional(),
  company: optStr,
  email: optStr,
  phone: optStr,
  status: z.enum(CONTACT_STATUSES).optional(),
  notes: optStr,
});

// ── Sales Pipeline Deal ──
export const DEAL_STAGES = [
  "lead",
  "contacted",
  "proposal",
  "won",
  "lost",
] as const;

const optValue = z.coerce.number().int().nonnegative().optional();

export const dealCreateSchema = z.object({
  title: z.string().trim().min(1, "必填"),
  stage: z.enum(DEAL_STAGES).optional(),
  value: optValue,
  contactId: optStr,
  notes: optStr,
});

export const dealUpdateSchema = z.object({
  title: z.string().trim().min(1, "必填").optional(),
  stage: z.enum(DEAL_STAGES).optional(),
  value: optValue,
  contactId: optStr,
  notes: optStr,
});

// ── Meeting Note ──
export const noteCreateSchema = z.object({
  title: z.string().trim().min(1, "必填"),
  body: optStr,
  meetingAt: optStr, // ISO 字串或空；route 端轉 Date|null
});

export const noteUpdateSchema = z.object({
  title: z.string().trim().min(1, "必填").optional(),
  body: optStr,
  meetingAt: optStr,
});

// ── 落地待辦自訂任務 ──
export const landingTaskCreateSchema = z.object({
  title: z.string().trim().min(1, "必填").max(200, "最多 200 字"),
  dueAt: optStr, // "YYYY-MM-DD" 或空；route 端轉 Date|null
});

export const landingTaskUpdateSchema = z.object({
  title: z.string().trim().min(1, "必填").max(200, "最多 200 字").optional(),
  dueAt: optStr,
  done: z.boolean().optional(),
});

// 空字串 → null（存 DB）；undefined 維持 undefined（PATCH 不動此欄）
export function nullifyEmpty(v: string | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  return v === "" ? null : v;
}

// "" 或無效日期 → null；否則回 Date
export function parseDate(v: string | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * <input type="date"> 的 "YYYY-MM-DD" → 該日 23:59:59.999Z。
 * 直接 new Date("YYYY-MM-DD") 會取 UTC 00:00，在 UTC+8 會提早近一天判定逾期，故存日終。
 */
export function parseDueDate(v: string | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (m) {
    return new Date(
      Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999),
    );
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
