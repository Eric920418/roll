import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 的 config 不會自動載入 .env，手動載入供 CLI（generate / db push / studio）使用
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env 不存在時忽略（CI 等環境會直接注入環境變數）
}

// Prisma 7：連線 URL 與 seed 設定移至此檔（schema 不再支援 datasource.url）
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
