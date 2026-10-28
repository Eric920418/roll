import "server-only";
import type { User, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBetaAccess } from "@/lib/auth/account";
import { getPaidPlan, getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast, toPlanKey } from "@/lib/billing/plans";
import { MemberError } from "@/lib/member-http";
import { autoCardData, networkEnabled } from "./policy";
type DB = Prisma.TransactionClient;
export async function networkAccount(userId: string, db: DB = prisma as unknown as DB) {
  const row = await db.user.findUnique({ where: { id: userId }, include: { matchmakingProfile: true, profile: true } });
  if (!row) throw new MemberError("請重新登入 / Please sign in", 401);
  const plan = getEffectivePlan({ ...row, plan: toPlanKey(row.plan), trialPlan: row.trialPlan ? toPlanKey(row.trialPlan) : null, betaAccess: await getBetaAccess() });
  return { ...row, effectivePlan: plan, verifiedInvestor: row.matchmakingProfile?.role === "investor" && row.matchmakingProfile.verified };
}
export function sources(row: Pick<User, "plan" | "paypalSubscriptionId" | "subscriptionStatus" | "currentPeriodEnd" | "planUpdatedAt" | "founderStartedAt" | "founderEndsAt" | "trialPlan" | "trialStartsAt" | "trialEndsAt" | "trialPolicy" | "rollonMember">, now = new Date()) {
  const normalized = { ...row, plan: toPlanKey(row.plan), trialPlan: row.trialPlan ? toPlanKey(row.trialPlan) : null, betaAccess: false };
  const subscriptionActive = getPaidPlan({ ...normalized, rollonMember: false, founderStartedAt: null, founderEndsAt: null }, now) !== "free";
  const trialActive = getEffectivePlan({ ...normalized, plan: "free", rollonMember: false, founderStartedAt: null, founderEndsAt: null }, now) !== "free";
  return [row.paypalSubscriptionId && subscriptionActive ? `subscription:${row.paypalSubscriptionId}:${row.plan}` : "", row.founderStartedAt && row.founderStartedAt <= now && row.founderEndsAt && row.founderEndsAt > now ? `founder:${row.founderStartedAt.toISOString()}` : "", row.trialPlan && row.trialStartsAt && row.trialEndsAt && trialActive && row.trialEndsAt > now && row.trialStartsAt <= now ? `trial:${row.trialPlan}:${row.trialStartsAt.toISOString()}` : "", row.rollonMember ? "rollon-member" : ""].filter(Boolean);
}

export async function features(userId: string, db: DB = prisma as unknown as DB) {
  const account = await networkAccount(userId, db), nova = planAtLeast(account.effectivePlan, "business");
  const legacy = !nova && account.featurePolicy !== 2 && networkEnabled() && account.effectivePlan !== "free" ? await db.legacyFeatureGrant.findMany({ where: { userId, sourceKey: { in: sources(account) } }, select: { feature: true } }) : [];
  return { network: !networkEnabled() || nova || account.verifiedInvestor || legacy.some(v => v.feature === "network"), invite: nova || account.verifiedInvestor, prospects: networkEnabled() ? nova || legacy.some(v => v.feature === "prospects") : planAtLeast(account.effectivePlan, "pro"), portal: nova, verifiedInvestor: account.verifiedInvestor, legacy: legacy.length > 0 };
}
export async function requireNetwork(userId: string, kind: "network" | "invite" = "network", db?: DB) {
  if (!(await features(userId, db))[kind]) throw new MemberError("此功能需要 NOVA 或有效既有權益 / NOVA or an existing eligible entitlement is required", 403);
}
export async function acceptedConnection(a: string, b: string, db: DB = prisma as unknown as DB) {
  return db.networkConnection.findFirst({ where: { status: "accepted", OR: [{ senderId: a, recipientId: b }, { senderId: b, recipientId: a }] } });
}
export async function activeShare(ownerId: string, viewerId: string, section: string, db: DB = prisma as unknown as DB) {
  if (!networkEnabled()) return null;
  const share = await db.networkShare.findUnique({ where: { ownerId_viewerId: { ownerId, viewerId } }, include: { connection: true } });
  if (!share || share.revokedAt || share.connection.status !== "accepted" || !share.sections.includes(section) || !(await features(ownerId, db)).portal || !(await networkAccount(viewerId, db)).verifiedInvestor) return null;
  return share;
}

export async function ensureCard(userId: string, db: DB = prisma as unknown as DB) {
  if (!networkEnabled()) return;
  const profile = await db.onboardingProfile.findUnique({ where: { userId } });
  await db.matchmakingProfile.upsert({ where: { userId }, create: { ...autoCardData, userId, visible: Boolean(profile?.companyName && profile.industry && profile.country), optedInAt: new Date() }, update: {} });
}
