import path from "node:path";
import bcrypt from "bcryptjs";

// 先載入 .env，再「動態 import」prisma。
// 為什麼：src/lib/prisma.ts 在 import 當下就讀 process.env.DATABASE_URL 建立連線；
// ESM 的 static import 會被提升到本檔任何語句之前執行，所以必須先把 .env 載進來，
// 之後才 await import prisma，否則連線字串是空的、會退回 localhost。
// （db:seed 不受影響，因為它經 prisma CLI → prisma.config.ts 先載好 env 才開子程序。）
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* CI / 已注入環境變數時忽略 */
}

// ── 可用環境變數覆蓋 ──
//   SUPER_EMAIL     登入帳號（預設 super@rollgrp.com）
//   SUPER_PASSWORD  登入密碼（預設 RollOn2026!Super，至少 8 碼）
//   SUPER_PLAN      pro（預設）｜ enterprise（永不過期、不需訂閱期）
const email = (process.env.SUPER_EMAIL ?? "super@rollgrp.com").trim().toLowerCase();
const password = process.env.SUPER_PASSWORD ?? "RollOn2026!Super";
const plan = (process.env.SUPER_PLAN ?? "pro").trim();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("找不到 DATABASE_URL（請確認專案根目錄有 .env 且含 DATABASE_URL）");
  }
  if (password.length < 8) {
    throw new Error("SUPER_PASSWORD 至少需 8 碼");
  }
  if (!["pro", "business", "enterprise"].includes(plan)) {
    throw new Error(`SUPER_PLAN 需為 pro / business / enterprise，收到：${plan}`);
  }

  // env 已就緒，才載入會在 import 時建立連線的 prisma
  const { prisma } = await import("../src/lib/prisma");

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    // enterprise 由站方直接信任、不看訂閱期；pro/business 需 ACTIVE + 未過期的 currentPeriodEnd
    //（見 src/lib/billing/gate.ts 的 getEffectivePlan 寬限期邏輯）。
    const paid = plan !== "enterprise";
    const farFuture = new Date("2099-12-31T00:00:00Z");

    // 完整通關狀態：completed=true → 登入後 destinationFor() 直接進 /dashboard
    const shared = {
      plan,
      subscriptionStatus: paid ? "ACTIVE" : null,
      currentPeriodEnd: paid ? farFuture : null,
      planUpdatedAt: new Date(),
      completed: true,
      quizCompleted: true,
      onboardingStep: 4,
    };

    const user = await prisma.user.upsert({
      where: { email },
      // 重複執行也會把既有帳號拉回超級帳號狀態（含重設密碼）
      update: { passwordHash, ...shared },
      create: {
        email,
        passwordHash,
        firstName: "Super",
        lastName: "Admin",
        ...shared,
      },
      select: { id: true, email: true, plan: true, subscriptionStatus: true, currentPeriodEnd: true },
    });

    console.log("✓ 超級帳號已就緒");
    console.log("  email   :", user.email);
    console.log("  password:", password);
    console.log("  plan    :", user.plan, user.subscriptionStatus ? `(${user.subscriptionStatus} 至 ${user.currentPeriodEnd?.toISOString().slice(0, 10)})` : "");
    console.log("  登入網址 : https://www.rollgrp.com/login");
    console.log("  登入後直接進 : https://www.rollgrp.com/dashboard");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
