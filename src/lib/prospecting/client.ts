import "server-only";
import { z } from "zod";
import { ProspectingError } from "./schema";
const BASE = "https://omrade.app/api/v1/prospecting";
export const configured = () => process.env.OMRADE_ENABLED === "true" && process.env.OMRADE_WORKER_ENABLED !== "false" && Boolean(process.env.OMRADE_API_KEY);
export class OmradeError extends ProspectingError {
  constructor(status: number, code: string, retryAfter = 15, public requestId?: string) {
    const messages: Record<number, string> = {
      400: "搜尋條件不符供應商格式，請檢查條件 / Provider rejected the targeting format",
      401: "公司搜尋連線設定需要管理員處理 / Company search credentials need administrator attention",
      402: "本月共用免費公司額度不足；未啟用付費 / Shared free allowance unavailable; paid usage is disabled",
      403: "公司搜尋金鑰缺少讀寫權限 / Company search key requires read and write permissions",
      404: "供應商資源不存在，請聯絡管理員 / Provider resource unavailable; contact administrator",
      409: "供應商請求內容衝突，原訂單保留，請聯絡管理員 / Provider request conflict; original order retained",
      410: "供應商結果已過期，保留本機紀錄且不重新下單 / Provider result expired; local history retained without reordering",
      429: "公司搜尋服務繁忙，系統會依建議時間重試 / Search service is busy; retry is scheduled",
    };
    super(messages[status] || "公司搜尋服務暫時無法確認，原訂單保留並稍後重試 / Search service unavailable; original order retained for retry", status, code, retryAfter);
  }
}
export const icpResponse = z.object({ icp_id: z.string().uuid(), version: z.number().int().positive() });
export const orderResponse = z.object({
  order_id: z.string().uuid(), icp_id: z.string().uuid(), icp_version: z.number().int().positive(), status: z.enum(["queued", "running", "completed", "failed"]),
  requested_count: z.union([z.literal(5), z.literal(10)]), delivered_count: z.number().int().min(0).max(10), created_at: z.iso.datetime({ offset: true }),
  delivered_at: z.iso.datetime({ offset: true }).nullable(), companies: z.array(z.unknown()).max(10),
  billing: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/), currency: z.literal("USD"), max_charge_cents: z.literal(0), amount_cents: z.number().int().min(0).max(0), free_companies: z.number().int().min(0).max(10), paid_companies: z.literal(0) }),
  failure: z.object({ code: z.string().max(80) }).nullable().optional(),
});
export async function omradeRequest(path: string, body?: unknown, key?: string) {
  if (!process.env.OMRADE_API_KEY) throw new ProspectingError("公司搜尋尚未完成連線設定 / Company search is not configured", 503, "not_configured");
  if (!/^\/(?:icps(?:\/[\da-f-]+(?:\/versions)?)?|orders(?:\/[\da-f-]+)?|usage)$/.test(path)) throw new Error("Invalid provider path");
  if (body !== undefined && !key) throw new Error("Persist an idempotency key before sending");
  const serialized = body === undefined ? undefined : JSON.stringify(body);
  if (serialized && Buffer.byteLength(serialized) > 65536) throw new ProspectingError("搜尋條件過長 / Search criteria too large", 400, "input_too_large");
  let response: Response;
  try {
    response = await fetch(BASE + path, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${process.env.OMRADE_API_KEY}`, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: serialized, redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store" });
  } catch { throw new OmradeError(503, "provider_unconfirmed"); }
  const retry = response.headers.get("retry-after"), seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : 15;
  const retryAfter = Math.max(5, Math.min(3600, Number.isFinite(seconds) ? seconds : 15));
  const rawId = response.headers.get("x-request-id"), requestId = rawId && /^[\w-]{1,150}$/.test(rawId) ? rawId : undefined;
  if (!response.ok) {
    const codes: Record<number, string> = { 400: "provider_input", 401: "provider_credentials", 402: "free_exhausted", 403: "provider_permissions", 404: "provider_missing", 409: "provider_conflict", 410: "provider_expired", 429: "provider_limit" };
    await response.body?.cancel(); throw new OmradeError(response.status, codes[response.status] || "provider_unconfirmed", retryAfter, requestId);
  }
  const reader = response.body?.getReader(); let size = 0; const parts: Uint8Array[] = [];
  if (!reader) throw new OmradeError(503, "provider_invalid_response");
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 1048576) { await reader.cancel(); throw new OmradeError(503, "provider_invalid_response"); } parts.push(value); }
  try { return { data: JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown, retryAfter, requestId }; }
  catch { throw new OmradeError(503, "provider_invalid_response"); }
}
