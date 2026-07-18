import "server-only";
import { prisma } from "@/lib/prisma";

// DB-based 固定視窗 rate limit。
// 本專案無 KV/Redis（見 README 環境變數段），改用 Neon Postgres 做「跨 serverless 實例」
// 的持久計數。以單一原子 UPSERT 在 DB 端完成「過窗重置 or 視窗內 +1」，不依賴 interactive
// transaction、無 read-then-write 競態（高併發下最多超計數 1，對成本/暴力護欄可接受）。

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
};

// 常用視窗（毫秒）
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** 取 client IP（Vercel/代理後放在 x-forwarded-for 首段）；取不到回 "unknown"。 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * 檢查並累加某 key 在視窗內的呼叫數（此次呼叫本身會計入）。
 *
 * @param key      配額對象，如 `copilot:<userId>`、`login:<ip>:<email>`
 * @param limit    視窗內允許次數
 * @param windowMs 視窗長度（毫秒）
 * @returns ok=false 代表已達上限；retryAfterMs 為建議重試等待毫秒
 *
 * 失敗策略：rate limit 只是「輔助護欄」，主要防線仍是 Pro-gate（copilot）與密碼雜湊（auth）。
 * 若計數 DB 本身出錯（例如尚未 `db:push` 建表、或連線抖動），一律 **fail-open**（放行 + 記 log），
 * 避免限流機制自身故障反而把登入 / copilot 弄掛。
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  try {
    const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
      INSERT INTO "RateCounter" ("key", "windowStart", "count", "updatedAt")
      VALUES (${key}, now(), 1, now())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN now() - "RateCounter"."windowStart" >= make_interval(secs => ${windowMs}::float8 / 1000)
          THEN 1
          ELSE "RateCounter"."count" + 1
        END,
        "windowStart" = CASE
          WHEN now() - "RateCounter"."windowStart" >= make_interval(secs => ${windowMs}::float8 / 1000)
          THEN now()
          ELSE "RateCounter"."windowStart"
        END,
        "updatedAt" = now()
      RETURNING "count", "windowStart";
    `;

    const row = rows[0];
    if (!row) return { ok: true, limit, remaining: limit - 1, retryAfterMs: 0 };

    const count = Number(row.count);
    if (count > limit) {
      const elapsed = Date.now() - new Date(row.windowStart).getTime();
      return { ok: false, limit, remaining: 0, retryAfterMs: Math.max(0, windowMs - elapsed) };
    }
    return { ok: true, limit, remaining: Math.max(0, limit - count), retryAfterMs: 0 };
  } catch (err) {
    console.error("[rate-limit] check failed, failing open:", err);
    return { ok: true, limit, remaining: limit, retryAfterMs: 0 };
  }
}
