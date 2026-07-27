import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { toPlanKey, type PlanKey } from "@/lib/billing/plans";

// 會員 Data Access Layer（DAL）。
// dashboard server component 與 billing API 一律透過此處取目前帳號，
// 回傳「安全 DTO」（不含 passwordHash）。用 React cache() 包裝：同一次 render
// 多個元件呼叫只查一次 DB。

export interface Account {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  image: string | null;
  onboardingStep: number;
  completed: boolean;
  quizCompleted: boolean;
  /** 是否設有密碼（Google-only 用戶為 false）；不外洩 hash */
  hasPassword: boolean;
  /** Tools 落地清單勾選狀態 { itemKey: true } */
  checklistState: Record<string, boolean>;
  /** Playbook 段落已讀狀態 { "<slug>:<segmentKey>": true } */
  playbookReads: Record<string, boolean>;
  /** 帳上儲存的方案（未套寬限期）；要判權限請用 gate.ts 的 getEffectivePlan */
  plan: PlanKey;
  subscriptionStatus: string | null;
  paypalSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  /** plan/status 最後異動時間 — SUSPENDED 寬限期的起算點（見 gate.ts） */
  planUpdatedAt: Date | null;
  profile: {
    companyName: string | null;
    industry: string | null;
    companySize: string | null;
    website: string | null;
    country: string | null;
    targetMarkets: string[];
    needs: string[];
    timeline: string | null;
    budgetRange: string | null;
    notes: string | null;
  } | null;
}

/**
 * 取目前登入會員的安全 DTO。
 * 未登入、或 session 指向的 User 已不存在（被刪）一律回 null。
 */
export const getCurrentAccount = cache(async (): Promise<Account | null> => {
  const session = await getUserSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    include: { profile: true },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    image: user.image,
    onboardingStep: user.onboardingStep,
    completed: user.completed,
    quizCompleted: user.quizCompleted,
    hasPassword: Boolean(user.passwordHash),
    checklistState:
      (user.checklistState as Record<string, boolean> | null) ?? {},
    playbookReads:
      (user.playbookReads as Record<string, boolean> | null) ?? {},
    plan: toPlanKey(user.plan),
    subscriptionStatus: user.subscriptionStatus,
    paypalSubscriptionId: user.paypalSubscriptionId,
    currentPeriodEnd: user.currentPeriodEnd,
    planUpdatedAt: user.planUpdatedAt,
    profile: user.profile
      ? {
          companyName: user.profile.companyName,
          industry: user.profile.industry,
          companySize: user.profile.companySize,
          website: user.profile.website,
          country: user.profile.country,
          targetMarkets: user.profile.targetMarkets,
          needs: user.profile.needs,
          timeline: user.profile.timeline,
          budgetRange: user.profile.budgetRange,
          notes: user.profile.notes,
        }
      : null,
  };
});
