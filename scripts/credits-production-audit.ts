import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, writeFile, mkdir, appendFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { join } from "node:path";
import { collectAuditSnapshot } from "./credits-audit-snapshot";
import { auditMembers } from "./credits-audit-members";
import { auditCsv, auditHtml } from "./credits-audit-report";
type EnvRow = { id: string; key: string; value?: string; target?: string[]; updatedAt?: number; createdAt?: number };
function vercel<T>(path: string): T { return JSON.parse(execFileSync("pnpm", ["exec", "vercel", "api", path, "--method", "GET"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 })); }
export async function productionAuditTarget() {
  const project = JSON.parse(await readFile(".vercel/project.json", "utf8")) as { projectId: string; orgId: string };
  const base = `/projects/${encodeURIComponent(project.projectId)}`, team = `teamId=${encodeURIComponent(project.orgId)}`;
  const live = vercel<{ targets?: { production?: { id: string; createdAt: number; readyState: string; meta?: { githubCommitSha?: string } } } }>(`/v9${base}?${team}`).targets?.production;
  if (!live || live.readyState !== "READY") throw new Error("Cannot identify the current READY production deployment");
  const rows = vercel<{ envs: EnvRow[] }>(`/v10${base}/env?${team}&decrypt=false`).envs;
  const selected = rows.filter(r => r.target?.includes("production") && ["DATABASE_URL", "MEMBER_NETWORK_ENABLED", "BILLING_REQUIRE_EXPLICIT_ENTITLEMENT", "ROLL_UNIFIED_CREDITS_LOCAL"].includes(r.key));
  const values = new Map<string, string>();
  for (const row of selected) {
    if ((row.updatedAt ?? row.createdAt ?? 0) > live.createdAt) throw new Error(`Production variable ${row.key} changed after deployment; verify the live environment before auditing`);
    const env = vercel<EnvRow>(`/v1${base}/env/${encodeURIComponent(row.id)}?${team}`);
    if (typeof env.value !== "string") throw new Error(`Production variable ${row.key} is not readable`);
    values.set(row.key, env.value);
  }
  const connectionString = values.get("DATABASE_URL");
  if (!connectionString) throw new Error("Production DATABASE_URL is missing");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname.length < 2) throw new Error("Production target is not a remote PostgreSQL database");
  if (values.get("ROLL_UNIFIED_CREDITS_LOCAL") === "true") throw new Error("Production unexpectedly enables the local Credits mode; stop and inspect configuration");
  let repositoryTargetMatches: boolean | null = null;
  try { repositoryTargetMatches = parseEnv(await readFile(".env", "utf8")).DATABASE_URL === connectionString; } catch { /* Production configuration itself is the authority. */ }
  return { connectionString, flags: { MEMBER_NETWORK_ENABLED: values.get("MEMBER_NETWORK_ENABLED") ?? "false", BILLING_REQUIRE_EXPLICIT_ENTITLEMENT: values.get("BILLING_REQUIRE_EXPLICIT_ENTITLEMENT") ?? "false" }, provenance: { projectId: project.projectId, teamId: project.orgId, deploymentId: live.id, commit: live.meta?.githubCommitSha ?? null, deploymentCreatedAt: new Date(live.createdAt).toISOString(), productionVariableId: selected.find(r => r.key === "DATABASE_URL")!.id, repositoryTargetMatches, source: "Vercel production configuration", relevantVariableMetadata: selected.map(r => ({ key: r.key, id: r.id, updatedAt: r.updatedAt ?? r.createdAt ?? null })) } };
}
async function main() {
  if (process.argv.slice(2).join(" ") !== "--production-readonly") throw new Error("Usage: pnpm exec tsx scripts/credits-production-audit.ts --production-readonly (no --apply)");
  const target = await productionAuditTarget();
  const label = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  const directory = await mkdtemp(`/tmp/nova-credits-production-audit-${label}-`);
  if (!target.provenance.commit || !/^[a-f0-9]{40}$/.test(target.provenance.commit)) throw new Error("Production Git commit is not available for entitlement comparison");
  const baselineRoot = join(directory, "deployed-source"); await mkdir(baselineRoot, { mode: 0o700 });
  const source = execFileSync("git", ["archive", target.provenance.commit, "src/lib"], { maxBuffer: 16000000 });
  execFileSync("tar", ["-x", "-C", baselineRoot], { input: source });
  const allowanceFile = join(baselineRoot, "src/lib/ai/allowance.ts");
  if (!/function allowanceCycleFor\b/.test(await readFile(allowanceFile, "utf8"))) throw new Error("The deployed AI cycle calculator cannot be compared safely");
  // Expose the unchanged private calculator only inside this local archived source copy.
  await appendFile(allowanceFile, "\nexports.allowanceCycleFor = allowanceCycleFor;\n");
  const { result, proof } = await collectAuditSnapshot(target.connectionString, data => auditMembers(data, target.flags, baselineRoot));
  const stillLive = vercel<{ targets?: { production?: { id: string } } }>(`/v9/projects/${encodeURIComponent(target.provenance.projectId)}?teamId=${encodeURIComponent(target.provenance.teamId)}`).targets?.production;
  if (stillLive?.id !== target.provenance.deploymentId) throw new Error("Production deployment changed during audit; rerun against the current deployed rules");
  const report = { dryRun: true, target: "production", provenance: target.provenance, runtimeFlags: target.flags, proof, ...result };
  await writeFile(join(directory, "audit.json"), JSON.stringify(report, null, 2), { mode: 0o600, flag: "wx" });
  await writeFile(join(directory, "audit.csv"), auditCsv(result), { mode: 0o600, flag: "wx" });
  await writeFile(join(directory, "audit.html"), auditHtml(result), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ directory, asOf: result.asOf, totals: result.totals, readOnly: proof.readOnly, transactionWrites: proof.transactionWrites, rolledBack: proof.rolledBack }));
}
if (process.argv[1]?.endsWith("credits-production-audit.ts")) main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[database URL redacted]") : String(error)); process.exitCode = 1; });
