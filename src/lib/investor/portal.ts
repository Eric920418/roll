import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast, toPlanKey } from "@/lib/billing/plans";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import { calculateDashboardProgress } from "@/lib/action-plan/dashboard";

export const portalInclude = {
  kpis: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
  milestones: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
  updates: { orderBy: { publishedAt: "desc" } },
  invitations: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.InvestorPortalInclude;

const ownerBillingSelect = {
  plan: true,
  subscriptionStatus: true,
  paypalSubscriptionId: true,
  currentPeriodEnd: true,
  planUpdatedAt: true,
  trialPlan: true,
  trialStartsAt: true,
  trialEndsAt: true,
} as const;

export function ownerHasInvestorAccess(owner: {
  plan: string;
  subscriptionStatus: string | null;
  paypalSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  planUpdatedAt: Date | null;
  trialPlan: string | null;
  trialStartsAt: Date | null;
  trialEndsAt: Date | null;
}): boolean {
  return planAtLeast(
    getEffectivePlan({
      ...owner,
      plan: toPlanKey(owner.plan),
      trialPlan: owner.trialPlan ? toPlanKey(owner.trialPlan) : null,
    }),
    "business",
  );
}

export async function getOrCreateOwnerPortal(userId: string) {
  return prisma.investorPortal.upsert({
    where: { userId },
    create: { userId },
    update: {},
    include: portalInclude,
  });
}

export async function getOwnerPortal(userId: string) {
  return prisma.investorPortal.findUnique({
    where: { userId },
    include: portalInclude,
  });
}

export function ownerPortalDto(portal: NonNullable<Awaited<ReturnType<typeof getOwnerPortal>>>) {
  return {
    ...portal,
    businessPlanPath: undefined,
    businessPlanAvailable: Boolean(portal.businessPlanPath),
    businessPlanUploadedAt: portal.businessPlanUploadedAt?.toISOString() ?? null,
    kpis: portal.kpis.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    milestones: portal.milestones.map((item) => ({
      ...item,
      targetDate: item.targetDate?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    updates: portal.updates.map((item) => ({
      ...item,
      publishedAt: item.publishedAt.toISOString(),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    invitations: portal.invitations.map((item) => ({
      ...item,
      tokenHash: undefined,
      expiresAt: item.expiresAt.toISOString(),
      acceptedAt: item.acceptedAt?.toISOString() ?? null,
      revokedAt: item.revokedAt?.toISOString() ?? null,
      lastSentAt: item.lastSentAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}

export async function getInvestorView(portalId: string, userId: string) {
  const invitation = await prisma.investorInvitation.findFirst({
    where: { portalId, acceptedByUserId: userId, status: "accepted" },
    include: {
      portal: {
        include: {
          ...portalInclude,
          user: {
            select: {
              ...ownerBillingSelect,
              firstName: true,
              lastName: true,
              profile: true,
            },
          },
        },
      },
    },
  });
  if (!invitation || !ownerHasInvestorAccess(invitation.portal.user)) return null;

  const portal = invitation.portal;
  const actionPlan = portal.shareActionPlan || portal.shareStrategy
    ? await getActiveActionPlan(portal.userId)
    : null;
  return {
    id: portal.id,
    companyName:
      portal.user.profile?.companyName ||
      [portal.user.firstName, portal.user.lastName].filter(Boolean).join(" ") ||
      "Company",
    profile: portal.shareProfile
      ? {
          industry: portal.user.profile?.industry ?? null,
          companySize: portal.user.profile?.companySize ?? null,
          website: portal.user.profile?.website ?? null,
          country: portal.user.profile?.country ?? null,
          targetMarkets: portal.user.profile?.targetMarkets ?? [],
        }
      : null,
    strategy:
      portal.shareStrategy && actionPlan
        ? { diagnosis: actionPlan.diagnosis }
        : null,
    actionPlan:
      portal.shareActionPlan && actionPlan
        ? {
            nextMoves: actionPlan.nextMoves,
            progress: calculateDashboardProgress(actionPlan.actions),
          }
        : null,
    kpis: portal.shareKpis ? portal.kpis : null,
    milestones: portal.shareMilestones ? portal.milestones : null,
    updates: portal.shareUpdates ? portal.updates : null,
    businessPlan:
      portal.shareBusinessPlan && portal.businessPlanPath
        ? {
            filename: portal.businessPlanFilename,
            size: portal.businessPlanSize,
          }
        : null,
  };
}

export async function listInvestorMemberships(userId: string) {
  const invitations = await prisma.investorInvitation.findMany({
    where: { acceptedByUserId: userId, status: "accepted" },
    include: {
      portal: {
        include: {
          user: {
            select: {
              ...ownerBillingSelect,
              firstName: true,
              lastName: true,
              profile: { select: { companyName: true } },
            },
          },
        },
      },
    },
    orderBy: { acceptedAt: "desc" },
  });
  return invitations
    .filter((item) => ownerHasInvestorAccess(item.portal.user))
    .map((item) => ({
      portalId: item.portalId,
      companyName:
        item.portal.user.profile?.companyName ||
        [item.portal.user.firstName, item.portal.user.lastName].filter(Boolean).join(" ") ||
        "Company",
      acceptedAt: item.acceptedAt?.toISOString() ?? null,
    }));
}
