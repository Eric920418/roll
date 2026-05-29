import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 的 config 不會自動載入 .env，手動載入供本機 CLI（db push / studio / seed）使用。
// Vercel build 環境會直接注入環境變數，無 .env 檔（try/catch 忽略）。
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* 無 .env 檔時忽略 */
}

// 直接讀 process.env（缺失時回退 placeholder，不 throw）。
// 重要：`prisma generate` 不需連線，只讀 schema；若用會 throw 的 env() helper，
// 在 Vercel postinstall（DATABASE_URL 尚未就緒）會導致 build 失敗。
// 真正的 runtime 連線在 src/lib/prisma.ts 用 process.env.DATABASE_URL（Neon adapter）。
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
