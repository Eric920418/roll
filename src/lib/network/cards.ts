import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureCard } from "./access";
import { networkEnabled } from "./policy";
export async function syncAutomaticCard(userId: string, db: Prisma.TransactionClient = prisma as unknown as Prisma.TransactionClient) {
  if (!networkEnabled()) return;
  await ensureCard(userId, db);
  const [card, profile] = await Promise.all([db.matchmakingProfile.findUnique({ where: { userId } }), db.onboardingProfile.findUnique({ where: { userId } })]);
  if (card?.sourcePolicy === 2 && !card.hiddenByUserAt) {
    const complete = Boolean(profile?.companyName && profile.industry && profile.country);
    await db.matchmakingProfile.updateMany({ where: { userId, sourcePolicy: 2, hiddenByUserAt: null, visible: !complete }, data: { visible: complete, revision: { increment: 1 }, ...(complete ? { optedInAt: new Date() } : {}) } });
  }
}
