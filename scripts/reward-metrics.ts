for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const weeks = await prisma.$queryRaw`
      WITH visits AS (
        SELECT "userId", "dayKey"::date AS day, "createdAt"
        FROM "RewardEntry" WHERE kind = 'visit' AND points > 0
          AND "dayKey"::date >= (now() AT TIME ZONE 'Asia/Taipei')::date - 28
      )
      SELECT to_char(date_trunc('week', v.day), 'YYYY-MM-DD') AS week,
        count(*)::int AS "visitDays", count(DISTINCT v."userId")::int AS visitors,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "RewardEntry" e WHERE e."userId" = v."userId"
            AND e."dayKey"::date = v.day AND e.kind IN ('action','quiz','profile')
            AND e.points > 0 AND e."createdAt" >= v."createdAt"
        ))::int AS "visitsWithUsefulAction",
        count(*) FILTER (WHERE v.day <= (now() AT TIME ZONE 'Asia/Taipei')::date - 1)::int AS "d1Eligible",
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "RewardEntry" e WHERE e."userId" = v."userId" AND e.kind = 'visit' AND e."dayKey"::date = v.day + 1))::int AS "d1Returned",
        count(*) FILTER (WHERE v.day <= (now() AT TIME ZONE 'Asia/Taipei')::date - 7)::int AS "d7Eligible",
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "RewardEntry" e WHERE e."userId" = v."userId" AND e.kind = 'visit' AND e."dayKey"::date = v.day + 7))::int AS "d7Returned"
      FROM visits v GROUP BY date_trunc('week', v.day) ORDER BY week;
    `;
    const deliveries = await prisma.$queryRaw`
      SELECT to_char(date_trunc('week', "scheduledAt" AT TIME ZONE 'Asia/Taipei'),'YYYY-MM-DD') AS week,
        count(*) FILTER (WHERE status = 'accepted')::int AS accepted,
        count(*) FILTER (WHERE status = 'failed')::int AS failed,
        count(*) FILTER (WHERE status IN ('skipped','cancelled','expired'))::int AS skipped,
        count(*) FILTER (WHERE status = 'accepted' AND EXISTS (
          SELECT 1 FROM "RewardEntry" e WHERE e."userId" = "RewardDelivery"."userId"
            AND e."eventKey" = 'unsubscribe:' || "RewardDelivery"."reminderVersion"
            AND e."createdAt" >= "RewardDelivery"."acceptedAt"
        ))::int AS "acceptedRemindersLaterUnsubscribed"
      FROM "RewardDelivery" WHERE "scheduledAt" >= now() - interval '28 days'
      GROUP BY date_trunc('week', "scheduledAt" AT TIME ZONE 'Asia/Taipei') ORDER BY week;
    `;
    const [redemptions, usage] = await Promise.all([
      prisma.rewardRedemption.aggregate({ where: { createdAt: { gte: new Date(Date.now()-28*86400000) } }, _sum: { credits: true, points: true }, _count: true }),
      prisma.aiUsage.count({ where: { source: "reward", status: "succeeded", createdAt: { gte: new Date(Date.now()-28*86400000) } } }),
    ]);
    console.log(JSON.stringify({ timeZone: "Asia/Taipei", windowDays: 28, weeks, deliveries, redemptions, successfulRewardAiCalls: usage, note: "accepted is provider acceptance, not delivery; D1/D7 denominators include only matured visit days" }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error("Reward metrics could not be read:", error instanceof Error ? error.message : "Unknown error"); process.exitCode = 1; });
