import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { convertLegacy, legacySnapshotSchema } from "../src/lib/credits/conversion";
import { localCreditsEnabled } from "../src/lib/credits/local";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === "--fixture") {
    const input = z.object({ asOf: z.string().datetime(), cases: z.array(legacySnapshotSchema) }).strict().parse(JSON.parse(await readFile(args[1], "utf8")));
    const reports = input.cases.map(item => { const result = convertLegacy(item, new Date(input.asOf)); return { userId: result.userId, rows: result.rows, before: result.before, after: result.after }; });
    console.log(JSON.stringify({ dryRun: true, source: "fixture", asOf: input.asOf, reports }, null, 2));
    return;
  }
  if (args.length !== 1 || args[0] !== "--local-db") throw new Error("Usage: pnpm exec tsx scripts/credits-trial.ts --fixture <json> | --local-db (read only; no --apply)");
  if (!localCreditsEnabled()) throw new Error("Local Credits flags are required before opening the database");
  const require = createRequire(import.meta.url), loader = require("node:module"), original = loader._resolveFilename;
  loader._resolveFilename = function(name: string, ...rest: unknown[]) { return name === "server-only" ? require.resolve("next/dist/compiled/server-only/empty") : original.call(this, name, ...rest); };
  const { prisma } = await import("../src/lib/prisma"), { trialConversion } = await import("../src/lib/credits/legacy");
  try {
    const reports = await prisma.$transaction(async raw => {
      const tx = raw as unknown as import("@prisma/client").Prisma.TransactionClient;
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const { ledgerInstalled } = await import("../src/lib/credits/authority"), { accountFor } = await import("../src/lib/credits/storage");
      const installed = await ledgerInstalled(tx);
      const rows = [];
      for (const user of await tx.user.findMany({ select: { id: true } })) {
        if ((installed && ["active", "compatible"].includes((await accountFor(tx, user.id))?.status ?? "")) || await tx.setting.findUnique({ where: { key: `localCredits.v1:${user.id}` } })) { rows.push({ userId: user.id, status: "already_converted", note: "Original balances are historical; do not import twice" }); continue; }
        try { const report = await trialConversion(tx, user.id); rows.push({ userId: report.userId, rows: report.rows, before: report.before, after: report.after, status: "ready" }); }
        catch (error) { rows.push({ userId: user.id, status: "blocked", error: error instanceof Error ? error.message : String(error) }); }
      }
      return rows;
    }, { isolationLevel: "RepeatableRead", timeout: 120000 });
    console.log(JSON.stringify({ dryRun: true, source: "isolated_local_database", reports }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[database URL redacted]") : String(error)); process.exitCode = 1; });
