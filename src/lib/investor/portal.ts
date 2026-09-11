import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast, toPlanKey } from "@/lib/billing/plans";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import { calculateDashboardProgress, type DashboardProgress } from "@/lib/action-plan/dashboard";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
import { isFieldHidden, toHideableFields } from "@/lib/investor/fields";

export const portalInclude = {
  kpis: {
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { points: { orderBy: [{ order: "asc" }, { period: "asc" }] } },
  },
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
    // ADD COLUMN 出來的 TEXT[] 對既有列是 NULL；一律正規化成陣列，
    // 順便濾掉舊版本寫入、本版已移除的 key，client 端才能安全使用。
    hiddenFields: toHideableFields(portal.hiddenFields),
    businessPlanPath: undefined,
    businessPlanAvailable: Boolean(portal.businessPlanPath),
    businessPlanUploadedAt: portal.businessPlanUploadedAt?.toISOString() ?? null,
    kpis: portal.kpis.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      points: item.points.map((point) => ({
        id: point.id,
        period: point.period,
        value: point.value,
        order: point.order,
      })),
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

// ── 投資人視角 ────────────────────────────────────────────────────────────────
//
// 三層過濾，依序套用：
//   1. portal.share*   — section 級（Business 以上可編輯）
//   2. hiddenFields    — 欄位級（Enterprise 可編輯）
//   3. item.hidden     — 單筆級（Enterprise 可編輯）
//
// 2 和 3 的「套用」刻意不看擁有者當下的方案 —— 見 src/lib/investor/fields.ts 的說明。
// 被隱藏的內容一律不放進回傳物件（key 直接不存在），不留佔位、不進 RSC payload。

/**
 * 投資人能看到的 action 欄位白名單。
 *
 * 刻意不 spread ActionPlanActionDto —— 那裡帶著 NOVA 的內部評分
 * （impact / urgency / difficulty / stageFit / bottleneckFit / priorityScore），
 * 把「AI 判定這家公司此任務難度 5/5、階段契合度 0.3」送到投資人眼前，
 * 對會員是實質傷害。新增欄位時必須是明確的產品決定，不能靠 spread 默默外洩。
 */
export type InvestorActionView = {
  id: string;
  rank: number | null;
  title: string;
  outcomeText: string;
  outcomeCategory: ActionPlanActionDto["expectedOutcome"]["category"];
  done: boolean;
};

function toActionView(action: ActionPlanActionDto): InvestorActionView {
  return {
    id: action.id,
    rank: action.rank,
    title: action.title,
    outcomeText: action.expectedOutcome.text,
    outcomeCategory: action.expectedOutcome.category,
    done: action.done,
  };
}

/** 值為 slug（需經 Auth.options 翻譯）或自由文字，由 UI 層決定；此層保持 locale 無關。 */
export type InvestorProfileView = {
  industry?: string | null;
  companySize?: string | null;
  country?: string | null;
  website?: string | null;
  targetMarkets?: string[];
  companyAge?: string | null;
  seedFunding?: string | null;
  needs?: string[];
  notes?: string | null;
};

export type InvestorStrategyView = {
  stage?: { companyStage: string; stageReason: string };
  bottleneck?: { group: string; code: string; reason: string };
};

export type InvestorActionPlanView = {
  nextMoves?: InvestorActionView[];
  progress?: DashboardProgress;
  allActions?: InvestorActionView[];
};

export type InvestorKpiView = {
  id: string;
  label: string;
  value: string;
  period: string | null;
  unit: string | null;
  points: Array<{ period: string; value: number }>;
};

/** 物件有任何 key 才回傳，否則回 null —— 讓 UI 端整個 section 消失。 */
function orNull<T extends object>(value: T): T | null {
  return Object.keys(value).length > 0 ? value : null;
}

/** 陣列有內容才回傳，否則回 null —— 避免渲染空殼 section。 */
function listOrNull<T>(items: T[]): T[] | null {
  return items.length > 0 ? items : null;
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
  const hidden = toHideableFields(portal.hiddenFields);
  const visible = (key: Parameters<typeof isFieldHidden>[1]) => !isFieldHidden(hidden, key);

  const actionPlan =
    portal.shareActionPlan || portal.shareStrategy
      ? await getActiveActionPlan(portal.userId)
      : null;

  const p = portal.user.profile;

  // 公司檔案：逐欄位挑，被隱藏的 key 完全不建立。
  const profile: InvestorProfileView = {};
  if (portal.shareProfile) {
    if (visible("profile.industry")) profile.industry = p?.industry ?? null;
    if (visible("profile.companySize")) profile.companySize = p?.companySize ?? null;
    if (visible("profile.country")) profile.country = p?.country ?? null;
    if (visible("profile.website")) profile.website = p?.website ?? null;
    if (visible("profile.targetMarkets")) profile.targetMarkets = p?.targetMarkets ?? [];
    // timeline / budgetRange 的欄位語意已改為公司年資／種子資金
    if (visible("profile.companyAge")) profile.companyAge = p?.timeline ?? null;
    if (visible("profile.seedFunding")) profile.seedFunding = p?.budgetRange ?? null;
    if (visible("profile.needs")) profile.needs = p?.needs ?? [];
    if (visible("profile.notes")) profile.notes = p?.notes ?? null;
  }

  const strategy: InvestorStrategyView = {};
  if (portal.shareStrategy && actionPlan) {
    const d = actionPlan.diagnosis;
    if (visible("strategy.stage")) {
      strategy.stage = { companyStage: d.companyStage, stageReason: d.stageReason };
    }
    if (visible("strategy.bottleneck")) {
      strategy.bottleneck = {
        group: d.bottleneckGroup,
        code: d.bottleneckCode,
        reason: d.bottleneckReason,
      };
    }
  }

  const plan: InvestorActionPlanView = {};
  if (portal.shareActionPlan && actionPlan) {
    if (visible("actionPlan.nextMoves")) {
      plan.nextMoves = actionPlan.nextMoves.map(toActionView);
    }
    if (visible("actionPlan.progress")) {
      plan.progress = calculateDashboardProgress(actionPlan.actions);
    }
    if (visible("actionPlan.allActions")) {
      plan.allActions = actionPlan.actions.map(toActionView);
    }
  }

  const kpis: InvestorKpiView[] = portal.shareKpis
    ? portal.kpis
        .filter((item) => !item.hidden)
        .map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value,
          period: item.period,
          unit: item.unit,
          points: item.points.map((point) => ({ period: point.period, value: point.value })),
        }))
    : [];

  const milestones = portal.shareMilestones
    ? portal.milestones
        .filter((item) => !item.hidden)
        .map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status,
          targetDate: item.targetDate,
          notes: item.notes,
        }))
    : [];

  const updates = portal.shareUpdates
    ? portal.updates
        .filter((item) => !item.hidden)
        .map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          publishedAt: item.publishedAt,
        }))
    : [];

  return {
    id: portal.id,
    companyName:
      portal.user.profile?.companyName ||
      [portal.user.firstName, portal.user.lastName].filter(Boolean).join(" ") ||
      "Company",
    profile: orNull(profile),
    strategy: orNull(strategy),
    actionPlan: orNull(plan),
    kpis: listOrNull(kpis),
    milestones: listOrNull(milestones),
    updates: listOrNull(updates),
    businessPlan:
      portal.shareBusinessPlan && portal.businessPlanPath
        ? {
            filename: portal.businessPlanFilename,
            size: portal.businessPlanSize,
          }
        : null,
  };
}

export type InvestorView = NonNullable<Awaited<ReturnType<typeof getInvestorView>>>;

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
