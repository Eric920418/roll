export function localCreditsEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.ROLL_UNIFIED_CREDITS_LOCAL !== "true") return false;
  const url = new URL(env.DATABASE_URL || "postgresql://invalid/invalid");
  if (env.NODE_ENV === "production" || env.VERCEL || env.ROLL_LOCAL_POSTGRES !== "true" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.startsWith("/roll_rewards_qa")) throw new Error("點數本機模式僅允許隔離測試資料庫，禁止正式環境 / Local Credits requires an isolated loopback roll_rewards_qa database; production is prohibited");
  return true;
}
