// 一次性：清空 QuizQuestion，讓 `pnpm db:seed`（count-guard）重新灌入新的 3 題 × 4 選項。
//
// 背景：seed 用 count-guard（表非空不覆寫），所以「換題」需先清空舊題。
// QuizQuestion 無外鍵被參照（QuizSubmission.answers 只存 questionId 字串、founderId 連到 Founder），
// 故刪除安全、不會 cascade 影響其他表；歷史提交紀錄保留。
//
// 用法（對遠端 Neon 操作，請確認後再執行）：
//   pnpm db:push                          # 先補上 optionC/optionD 兩個可空欄位（加法式、無資料遺失）
//   node scripts/reset-quiz-questions.mjs # 清空舊題
//   pnpm db:seed                          # 灌入 prisma/seed.ts 內的新 3 題（單一資料來源）

import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Prisma 7 + Neon serverless：手動載入 .env、設定 WebSocket、用 Neon adapter 建構（對齊 src/lib/prisma.ts）。
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* 無 .env 檔時忽略（CI 由環境注入） */
}
neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
try {
  const { count } = await prisma.quizQuestion.deleteMany();
  console.log(
    `✓ 已刪除 ${count} 筆 QuizQuestion。請接著執行 pnpm db:seed 灌入新題目（4 選項）。`,
  );
} finally {
  await prisma.$disconnect();
}
