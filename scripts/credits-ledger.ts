import { createRequire } from "node:module";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
const manifestSchema = z.array(z.object({ userId: z.string().min(1), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).refine(rows => new Set(rows.map(r => r.userId)).size === rows.length, "Duplicate members");
export function isolatedTarget(env: Record<string, string | undefined>) {
  const target = new URL(env.DATABASE_URL ?? "");
  if (env.ROLL_LOCAL_POSTGRES !== "true" || env.VERCEL || env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !/^\/roll_rewards_qa[a-zA-Z0-9_]*$/.test(target.pathname) || target.search || target.hash) throw new Error("Only an explicit loopback roll_rewards_qa database is allowed; production execution is disabled");
  return target;
}
async function main() {
  isolatedTarget(process.env);
  const args = process.argv.slice(2), action = args.shift();
  if (!["install", "prepare", "activate", "rollback", "verify"].includes(action ?? "")) throw new Error("Usage: credits-ledger.ts install|prepare|activate|rollback|verify [--commit --request KEY --actor NAME --reason TEXT] [--manifest JSON] [--out JSON]. Default: rollback simulation; isolated QA only.");
  const options: Record<string, string> = {}; let commit = false;
  while (args.length) { const key = args.shift()!; if (key === "--commit") { commit = true; continue; } if (!["--request", "--actor", "--reason", "--manifest", "--out"].includes(key) || !args.length || options[key]) throw new Error(`Unknown/duplicate argument: ${key}`); options[key] = args.shift()!; }
  const op = { key: options["--request"] ?? "dry-run", actor: options["--actor"] ?? "local-rehearsal", reason: options["--reason"] ?? "隔離試算 / Isolated simulation" };
  if (commit && action !== "verify" && (!options["--request"] || !options["--actor"] || !options["--reason"])) throw new Error("Committed operations require --request, --actor and --reason");
  const require = createRequire(import.meta.url), loader = require("node:module"), original = loader._resolveFilename;
  loader._resolveFilename = function(name: string, ...rest: unknown[]) { return name === "server-only" ? require.resolve("next/dist/compiled/server-only/empty") : original.call(this, name, ...rest); };
  const pg = createRequire(require.resolve("@prisma/adapter-pg"))("pg"), client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "nova_credits_isolated_rehearsal" });
  if (action === "install") {
    await client.connect();
    try {
      await client.query("BEGIN"); await client.query("SET LOCAL lock_timeout='5s'");
      const installed = (await client.query('SELECT to_regclass(\'public."CreditControl"\') IS NOT NULL AS installed')).rows[0].installed;
      if (installed) throw new Error("Ledger already installed; schema is immutable. Verify it, do not reinstall or drop tables.");
      const fingerprint = `SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS hash FROM `;
      const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
      const before = []; for (const r of tables) before.push((await client.query(fingerprint + '"' + r.tablename.replaceAll('"', '""') + '" t')).rows[0].hash);
      const sql = await readFile(resolve("prisma/credits.sql"), "utf8"); await client.query(sql);
      for (let i = 0; i < tables.length; i++) if ((await client.query(fingerprint + '"' + tables[i].tablename.replaceAll('"', '""') + '" t')).rows[0].hash !== before[i]) throw new Error(`Original data changed: ${tables[i].tablename}`);
      await client.query(commit ? "COMMIT" : "ROLLBACK");
      console.log(JSON.stringify({ action, committed: commit, schemaSha256: createHash("sha256").update(sql).digest("hex"), originalTablesUnchanged: tables.length }));
    } finally { await client.query("ROLLBACK").catch(() => undefined); await client.end(); }
    return;
  }
  const { prisma } = await import("../src/lib/prisma"), cutover = await import("../src/lib/credits/cutover");
  const { verifyLedger } = await import("../src/lib/credits/verify");
  let result: unknown;
  const simulated = new Error("ROLLBACK_SIMULATION");
  try {
    await prisma.$transaction(async raw => {
      const tx = raw as unknown as import("@prisma/client").Prisma.TransactionClient;
      await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
      if (action === "verify") { await tx.$executeRaw`SET TRANSACTION READ ONLY`; result = await verifyLedger(tx); }
      else if (action === "prepare") {
        const rows = [];
        for (const u of await tx.user.findMany({ select: { id: true }, orderBy: { id: "asc" } })) { const p = await cutover.prepareMember(tx, u.id, { ...op, key: `${op.key}:${u.id}` }); rows.push({ userId: u.id, sourceHash: p.sourceHash, after: p.after }); }
        result = rows;
      } else if (action === "activate") {
        if (!options["--manifest"]) throw new Error("activate requires --manifest with reviewed userId/sourceHash pairs");
        const manifest = manifestSchema.parse(JSON.parse(await readFile(options["--manifest"], "utf8")));
        result = await cutover.activateAll(tx, manifest, op);
      } else result = await cutover.rollbackAll(tx, op);
      await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
      if (!commit || action === "verify") throw simulated;
    }, { isolationLevel: "Serializable", timeout: 120000 });
  } catch (error) { if (error !== simulated) throw error; }
  finally { await prisma.$disconnect(); }
  if (options["--out"]) {
    const output = action === "prepare" ? (result as { userId: string; sourceHash: string }[]).map(r => ({ userId: r.userId, sourceHash: r.sourceHash })) : result;
    await writeFile(options["--out"], JSON.stringify(output, null, 2), { mode: 0o600, flag: "wx" }); await chmod(options["--out"], 0o600);
  }
  console.log(JSON.stringify({ action, committed: commit && action !== "verify", result }, null, 2));
}
if (process.argv[1]?.endsWith("credits-ledger.ts")) main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[database URL redacted]") : String(error)); process.exitCode = 1; });
