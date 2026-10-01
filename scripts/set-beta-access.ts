import path from "node:path";

async function main() {
  const action = process.argv[2];
  if (action !== "enable" && action !== "disable") {
    throw new Error("用法：pnpm exec tsx scripts/set-beta-access.ts enable|disable");
  }
  try {
    process.loadEnvFile(path.join(process.cwd(), ".env"));
  } catch {
    // 已注入 DATABASE_URL 的部署環境不需要 .env。
  }
  if (!process.env.DATABASE_URL) throw new Error("缺少 DATABASE_URL，未修改任何設定。");
  const { prisma } = await import("../src/lib/prisma");
  try {
    const enabled = action === "enable";
    const saved = await prisma.setting.upsert({
      where: { key: "billing.betaAccess" },
      create: { key: "billing.betaAccess", value: { enabled } },
      update: { value: { enabled } },
    });
    console.log(JSON.stringify({ key: saved.key, value: saved.value, updatedAt: saved.updatedAt }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
