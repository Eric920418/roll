import fs from "node:fs";
import { createHash } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
const production = process.argv.includes("--production"), apply = process.argv.includes("--apply");
if (production) { try { process.loadEnvFile(".env"); } catch {} }
const connectionString = production ? process.env.DATABASE_URL : process.env.ROLL_REWARDS_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Missing explicit target database");
const url = new URL(connectionString);
const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
if (production ? local : !local || !url.pathname.startsWith("/roll_rewards_qa")) throw new Error("Target database does not match the selected mode");
neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({ adapter: production ? new PrismaNeon({ connectionString }) : new PrismaPg({ connectionString }) });
const names = ["EvidenceWorkspace", "RoundtableMatchRequest", "NewsletterSubscriber", "NewsletterDelivery"];
const additions = { Roundtable: ["frameworkStages", "seriesId"], RoundtableRegistration: ["feedback", "preparation", "revision"] };
const started = Date.now();
const quote = v => '"' + v.replaceAll('"', '""') + '"';
try {
  const report = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    const tables = await tx.$queryRawUnsafe("SELECT table_name::text AS table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name");
    const originalColumns = await tx.$queryRawUnsafe("SELECT table_name::text AS table_name, column_name::text AS column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position");
    const presentColumns = Object.entries(additions).flatMap(([table, columns]) => columns.filter(column => originalColumns.some(c => c.table_name === table && c.column_name === column)));
    const installedColumns = Object.values(additions).flat().length;
    const present = names.filter(n => tables.some(t => t.table_name === n));
    if ((present.length || presentColumns.length) && (present.length !== names.length || presentColumns.length !== installedColumns)) throw new Error("Partial schema detected; inspect before applying");
    const old = tables.map(t => t.table_name).filter(n => !names.includes(n));
    // Brief share locks let before/after fingerprints distinguish migration changes from live writes.
    if (old.length) await tx.$executeRawUnsafe("LOCK TABLE " + old.map(quote).join(", ") + " IN SHARE MODE");
    async function fingerprint() {
      if (!old.length) return {};
      const sql = old.map(table => { const fields = originalColumns.filter(c => c.table_name === table).map(c => "t." + quote(c.column_name)); const projection = "jsonb_build_array(" + fields.join(", ") + ")::text"; return "SELECT '" + table.replaceAll("'", "''") + "'::text AS name, count(*)::int AS count, md5(COALESCE(string_agg(md5(" + projection + "), '' ORDER BY md5(" + projection + ")), '')) AS hash FROM " + quote(table) + " t"; }).join(" UNION ALL ") + " ORDER BY name";
      const rows = await tx.$queryRawUnsafe(sql);
      return Object.fromEntries(rows.map(r => [r.name, { count: r.count, hash: r.hash }]));
    }
    const before = await fingerprint();
    if (present.length === names.length) {
      for (const name of names) {
        const columns = await tx.$queryRawUnsafe("SELECT column_name::text AS column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", name);
        const model = Prisma.dmmf.datamodel.models.find(m => m.name === name);
        if (!model.fields.filter(f => f.kind !== "object").every(f => columns.some(c => c.column_name === f.name))) throw new Error("Installed schema differs; inspect before applying");
      }
    } else if (apply) {
      const sql = fs.readFileSync("prisma/pdf-completion.sql", "utf8").replace(/^--.*$/gm, "");
      for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) {
        if (!/^(CREATE (TABLE|UNIQUE INDEX|INDEX)|ALTER TABLE)/.test(statement)) throw new Error("Unexpected migration statement");
        if (/\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME)\b/i.test(statement.replace(/ON (DELETE|UPDATE) CASCADE/g, ""))) throw new Error("Destructive migration statement rejected");
        await tx.$executeRawUnsafe(statement);
      }
    }
    const after = await fingerprint();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Existing data changed; transaction rolled back");
    return { target: production ? "production" : "isolated QA", applied: apply && !present.length, alreadyInstalled: present.length === names.length && presentColumns.length === installedColumns, addedColumns: additions, existingTables: old.length, existingRows: Object.fromEntries(Object.entries(before).map(([k,v]) => [k,v.count])), fingerprint: createHash("sha256").update(JSON.stringify(before)).digest("hex"), unchanged: true };
  }, { timeout: 60000 });
  console.log(JSON.stringify({ ...report, elapsedMs: Date.now() - started }));
} catch (error) {
  const cause = error.meta?.driverAdapterError?.cause;
  console.error("PDF completion migration aborted; transaction rolled back.", JSON.stringify({ name: error.name, code: error.code || "", sqlState: cause?.originalCode || error.meta?.code, message: String(cause?.originalMessage || error.meta?.message || error.message).replaceAll(connectionString, "[database URL redacted]").replace(/postgres(?:ql)?:\/\/[^\s"\x27]+/g, "[database URL redacted]"), metadataKeys: Object.keys(error.meta || {}) }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
