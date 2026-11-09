import fs from "node:fs";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
const production = process.argv.includes("--production"), apply = process.argv.includes("--apply");
// Production targets the project file explicitly, never stale shell credentials.
if (production) { delete process.env.DATABASE_URL; process.loadEnvFile(".env"); }
const connectionString = production ? process.env.DATABASE_URL : process.env.ROLL_REWARDS_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Missing explicit target database");
const url = new URL(connectionString);
const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
if (production ? local : !local || !url.pathname.startsWith("/roll_rewards_qa")) throw new Error("Target database does not match the selected mode");
neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({ adapter: production ? new PrismaNeon({ connectionString }) : new PrismaPg({ connectionString }) });
const started = Date.now();
const quote = v => '"' + v.replaceAll('"', '""') + '"';
try {
  const report = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    const tables = await tx.$queryRawUnsafe("SELECT table_name::text AS table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name");
    const old = tables.map(t => t.table_name);
    if (!old.includes("ActionPlan")) throw new Error("ActionPlan is missing");
    // Brief share locks let before/after fingerprints distinguish migration changes from live writes.
    if (old.length) await tx.$executeRawUnsafe("LOCK TABLE " + old.map(quote).join(", ") + " IN SHARE MODE");
    async function fingerprint() {
      if (!old.length) return {};
      const sql = old.map(table => "SELECT '" + table.replaceAll("'", "''") + "'::text AS name, count(*)::int AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS hash FROM " + quote(table) + " t").join(" UNION ALL ") + " ORDER BY name";
      const rows = await tx.$queryRawUnsafe(sql);
      return Object.fromEntries(rows.map(r => [r.name, { count: r.count, hash: r.hash }]));
    }
    const before = await fingerprint();
    const installed = old.includes('PlanLocalization');
    if (installed) {
      const columns = await tx.$queryRawUnsafe("SELECT column_name::text AS name FROM information_schema.columns WHERE table_schema='public' AND table_name='PlanLocalization' ORDER BY column_name");
      const expected = ['id','userId','planId','locale','sourceHash','strings','leaseToken','leaseUntil'].sort();
      if (JSON.stringify(columns.map(c=>c.name)) !== JSON.stringify(expected)) throw new Error('Existing translation schema differs; inspect before applying');
    } else if (apply) {
      const sql = fs.readFileSync('prisma/plan-localization.sql', 'utf8');
      for (const statement of sql.split(';').map(v => v.trim()).filter(Boolean)) {
        if (!/^CREATE (TABLE|UNIQUE INDEX) "PlanLocalization/.test(statement) || /\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|ALTER)\b/i.test(statement.replace(/ON (DELETE|UPDATE) CASCADE/g, ''))) throw new Error('Unexpected migration statement');
        await tx.$executeRawUnsafe(statement);
      }
    }
    const after = await fingerprint();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Existing data changed; transaction rolled back");
    return { target: production ? "production" : "isolated QA", applied: apply && !installed, alreadyInstalled: Boolean(installed), existingTables: old.length, existingRows: Object.fromEntries(Object.entries(before).map(([k,v]) => [k,v.count])), fingerprint: createHash("sha256").update(JSON.stringify(before)).digest("hex"), unchanged: true };
  }, { timeout: 60000 });
  console.log(JSON.stringify({ ...report, elapsedMs: Date.now() - started }));
} catch (error) {
  const cause = error.meta?.driverAdapterError?.cause;
  console.error("Plan localization migration aborted; transaction rolled back.", JSON.stringify({ name: error.name, code: error.code || "", sqlState: cause?.originalCode || error.meta?.code, message: String(cause?.originalMessage || error.meta?.message || error.message).replaceAll(connectionString, "[database URL redacted]").replace(/postgres(?:ql)?:\/\/[^\s"\x27]+/g, "[database URL redacted]"), metadataKeys: Object.keys(error.meta || {}) }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
