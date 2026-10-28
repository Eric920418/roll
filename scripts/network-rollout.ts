import { createRequire } from "node:module";
for (const file of [".env.local", ".env"]) { try { process.loadEnvFile(file); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; } }
// Standalone administrative script imports only server code, never browser code.
const require = createRequire(import.meta.url);
const loader = require("node:module"), resolveModule = loader._resolveFilename;
loader._resolveFilename = function(name: string, ...args: unknown[]) { return name === "server-only" ? require.resolve("next/dist/compiled/server-only/empty") : resolveModule.call(this, name, ...args); };
async function main() {
  const { prisma } = await import("../src/lib/prisma"), { getEffectivePlan } = await import("../src/lib/billing/gate"), { toPlanKey } = await import("../src/lib/billing/plans"), { sources, autoCardData } = await import("../src/lib/network/access").then(async a => ({ ...a, autoCardData: (await import("../src/lib/network/policy")).autoCardData }));
  try {
    const users = await prisma.user.findMany({ include: { matchmakingProfile: true, profile: true } });
    const eligible = users.filter(u => getEffectivePlan({ ...u, plan: toPlanKey(u.plan), trialPlan: u.trialPlan ? toPlanKey(u.trialPlan) : null, betaAccess: false }) !== "free");
    const missing = users.filter(u => !u.matchmakingProfile);
    console.log(JSON.stringify({ apply: process.argv.includes("--apply"), accounts: users.length, eligibleEntitlements: eligible.length, missingCards: missing.length, completeCards: missing.filter(u => u.profile?.companyName && u.profile.industry && u.profile.country).length }));
    if (!process.argv.includes("--apply")) return;
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('member-network-rollout-v2'))::text`;
      const marker = await tx.setting.findUnique({ where: { key: "member_network_v2_snapshot" } });
      if (!marker) {
        for (const user of eligible) for (const sourceKey of sources(user)) for (const feature of ["network", "prospects"]) await tx.legacyFeatureGrant.upsert({ where: { userId_feature_sourceKey: { userId: user.id, feature, sourceKey } }, create: { userId: user.id, feature, sourceKey }, update: {} });
        await tx.setting.create({ data: { key: "member_network_v2_snapshot", value: new Date().toISOString() } });
      }
      for (const user of missing) await tx.matchmakingProfile.upsert({ where: { userId: user.id }, create: { ...autoCardData, userId: user.id, visible: false, optedInAt: new Date() }, update: {} });
      if (process.argv.includes("--publish")) {
        process.env.MEMBER_NETWORK_ENABLED = "true";
        const { syncAutomaticCard } = await import("../src/lib/network/cards");
        for (const user of users) await syncAutomaticCard(user.id, tx as unknown as import("@prisma/client").Prisma.TransactionClient);
      }
    }, { timeout: 120000 });
    console.log(JSON.stringify({ complete: true, existingCardsUnchanged: true }));
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error("Network rollout failed; no credentials or member records printed. Inspect the transaction and schema before retrying."); process.exitCode = 1; });
