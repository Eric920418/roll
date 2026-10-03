/** Validate configuration before an adapter can silently fall back to localhost. */
export function requireDatabaseUrl(value: string | undefined, environment = process.env.VERCEL_ENV): string {
  const target = environment === "preview" ? "Preview" : environment === "production" ? "Production" : environment === "development" ? "Development" : "目前環境 / current environment";
  const url = value?.trim();
  if (!url) throw new Error(`DATABASE_URL 未設定：請設定 ${target} 的伺服器資料庫連線後重新部署 / DATABASE_URL is missing in ${target}; configure it and redeploy.`);
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error(`DATABASE_URL 格式無效（${target}）/ Invalid DATABASE_URL format (${target}).`); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length < 2) {
    throw new Error(`DATABASE_URL 必須包含 PostgreSQL 主機與資料庫名稱（${target}）/ DATABASE_URL requires a PostgreSQL host and database name (${target}).`);
  }
  return url;
}
