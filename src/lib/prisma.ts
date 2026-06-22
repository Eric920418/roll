import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Neon serverless 在 Node.js 環境需要 WebSocket constructor
neonConfig.webSocketConstructor = ws;

// 只重試「讀取」操作 —— 寫入不重試，避免非冪等的重複寫入。
const READ_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow",
  "findMany", "count", "aggregate", "groupBy",
]);

/**
 * 讀取的短暫重試（指數退避 + jitter）。
 * 為什麼存在：build 期間靜態生成上百頁，多個 worker 在 unstable_cache 冷啟時
 * 同時對 Neon 發出大量 WebSocket 查詢，偶發連線抖動會丟出 `prisma:error undefined`
 * 使某頁 prerender 失敗、整個部署掛掉（非程式碼問題，redeploy 即過）。對「讀取」
 * 做少量重試讓這類暫時性錯誤自癒，避免每次新增公司頁時 build 隨機失敗。
 */
async function withReadRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const backoff = 150 * 2 ** i + Math.floor(Math.random() * 120);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  // 以 client extension 集中包裝：所有「讀取」自動重試，寫入維持單次。
  return base.$extends({
    query: {
      $allOperations({ operation, args, query }) {
        return READ_OPS.has(operation)
          ? withReadRetry(() => query(args))
          : query(args);
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

// 全域單例，避免 dev hot-reload 重複建立連線
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
