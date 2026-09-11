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
//   SUPER_PLAN      pro（預設試用）｜business（試用）｜enterprise（站方管理）
//   SUPER_TRIAL_DAYS  Pro/Business 試用天數（預設 30）
const email = (process.env.SUPER_EMAIL ?? "super@rollgrp.com").trim().toLowerCase();
const password = process.env.SUPER_PASSWORD ?? "RollOn2026!Super";
const plan = (process.env.SUPER_PLAN ?? "pro").trim();
const trialDays = Number(process.env.SUPER_TRIAL_DAYS ?? "30");

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
  if (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 365) {
    throw new Error("SUPER_TRIAL_DAYS 必須是 1–365 的整數");
  }

  // env 已就緒，才載入會在 import 時建立連線的 prisma
  const { prisma } = await import("../src/lib/prisma");

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    // Pro / Business 一律用可到期 trial，不再偽造 PayPal ACTIVE；Enterprise 才由站方管理。
    const trialStartsAt = new Date();
    const trialEndsAt = new Date(trialStartsAt.getTime() + trialDays * 24 * 60 * 60 * 1000);

    // 完整通關狀態：completed=true → 登入後 destinationFor() 直接進 /dashboard
    const access = plan === "enterprise"
      ? { plan: "enterprise", trialPlan: null, trialStartsAt: null, trialEndsAt: null }
      : { trialPlan: plan, trialStartsAt, trialEndsAt };
    const shared = {
      ...access,
      completed: true,
      quizCompleted: true,
      onboardingStep: 4,
    };

    const user = await prisma.user.upsert({
      where: { email },
      // 重複執行只重設密碼／試用，不覆寫既有 PayPal 付款歷史與狀態。
      update: { passwordHash, ...shared },
      create: {
        email,
        passwordHash,
        firstName: "Super",
        lastName: "Admin",
        plan: plan === "enterprise" ? "enterprise" : "free",
        ...shared,
      },
      select: { id: true, email: true, plan: true, trialPlan: true, trialEndsAt: true },
    });

    console.log("✓ 超級帳號已就緒");
    console.log("  email   :", user.email);
    console.log("  password:", password);
    console.log("  plan    :", user.trialPlan ? `${user.trialPlan} trial（至 ${user.trialEndsAt?.toISOString().slice(0, 10)}）` : user.plan);
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
