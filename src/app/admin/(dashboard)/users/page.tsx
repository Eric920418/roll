import { requireAdminPage } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import UsersList, { type UserRow } from "@/components/admin/UsersList";
import { getBetaAccess } from "@/lib/auth/account";
import { getEffectivePlan, hasActiveTrial } from "@/lib/billing/gate";
import { toPlanKey } from "@/lib/billing/plans";
import { isDiscoveryMember, discoveryTrialActive } from "@/lib/discovery/policy";

export const dynamic = "force-dynamic"; // 後台一律即時資料

/**
 * 把一位註冊用戶的多個狀態欄位濃縮成一句「一眼看懂」的中文標籤。
 *
 * 這是少數真正需要你產品判斷的地方：User 同時帶 onboardingStep(1~4)、completed、
 * quizCompleted、subscriptionStatus 等狀態，後台該優先呈現哪一個、用什麼措辭，
 * 取決於你最在意哪種「庫戶」。以下是合理預設，你可依實際運營重點調整優先序。
 */
function userStatusLabel(u: {
  completed: boolean;
  onboardingStep: number;
  quizCompleted: boolean;
  subscriptionStatus: string | null;
}): string {
  if (u.subscriptionStatus === "PAST_DUE") return "訂閱逾期";
  if (u.completed) return "已完成全流程";
  if (u.quizCompleted) return "測驗已完成";
  // onboardingStep：1=帳號 2=公司 3=需求 4=測驗
  const stepLabel = ["", "註冊未完成", "填公司資料中", "填需求中", "待完成測驗"][
    u.onboardingStep
  ];
  return stepLabel || `進行中（step ${u.onboardingStep}）`;
}

export default async function UsersPage() {
  await requireAdminPage();
  const betaAccess = await getBetaAccess();
  const now = new Date();
  // 刻意只 select 需要顯示的欄位 —— 不撈 passwordHash（即使已雜湊也不該進前端 payload）
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      googleId: true,
      emailVerified: true,
      plan: true,
      subscriptionStatus: true,
      paypalSubscriptionId: true,
      currentPeriodEnd: true,
      planUpdatedAt: true,
      trialPlan: true,
      trialStartsAt: true,
      trialEndsAt: true,
      trialPolicy: true,
      founderStartedAt: true,
      founderEndsAt: true,
      onboardingStep: true,
      completed: true,
      quizCompleted: true,
      createdAt: true,
    },
  });

  const rows: UserRow[] = users.map((u) => {
    const account = { ...u, plan: toPlanKey(u.plan), trialPlan: u.trialPlan ? toPlanKey(u.trialPlan) : null, betaAccess };
    const grants: string[] = [];
    if (betaAccess && !isDiscoveryMember(account)) grants.push("免費測試授權（非付費訂閱）");
    if (hasActiveTrial(account, now)) grants.push(`${u.trialPlan === "business" ? "Business" : "Pro"} 限時試用`);
    if (u.founderStartedAt && u.founderEndsAt && u.founderStartedAt <= now && u.founderEndsAt > now) grants.push("創始會員年費");
    const subscriptionPlan = getEffectivePlan({ ...account, betaAccess: false, trialPlan: null, founderStartedAt: null, founderEndsAt: null }, now);
    if (subscriptionPlan !== "free") grants.push(u.plan === "enterprise" ? "管理員 Enterprise 授權" : u.paypalSubscriptionId ? "PayPal 訂閱" : "管理員方案授權（無 PayPal 訂閱）");
    if (isDiscoveryMember(account)) {
      if (discoveryTrialActive(account, now)) grants.push("14 天／3 次訪談試用（不含完整 Pro）");
      else if (grants.length === 0) grants.push(!u.trialStartsAt || !u.trialEndsAt ? "訪談試用未啟用／已撤銷" : u.trialStartsAt > now ? "訪談試用尚未開始" : "訪談試用已到期");
    }
    return {
      id: u.id,
      email: u.email, // 完整 email（依設定：直接顯示，未遮罩）
      name: [u.firstName, u.lastName].filter(Boolean).join(" "),
      provider: u.googleId ? "Google" : "Email",
      emailVerified: u.emailVerified !== null,
      plan: u.plan,
      effectivePlan: getEffectivePlan(account, now),
      accessLabel: grants.join("；") || "基本免費功能",
      subscriptionStatus: u.subscriptionStatus,
      hasPaypalSubscription: Boolean(u.paypalSubscriptionId),
      currentPeriodEnd: u.currentPeriodEnd?.toISOString() ?? null,
      trialPlan: u.trialPlan,
      trialStartsAt: u.trialStartsAt?.toISOString() ?? null,
      trialEndsAt: u.trialEndsAt?.toISOString() ?? null,
      status: userStatusLabel(u),
      createdAt: u.createdAt.toISOString(),
    };
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">註冊帳戶</h1>
      <p className="mb-6 text-sm text-neutral-500">
        公開平台註冊用戶（庫戶）— 共 {rows.length} 位。含 email 個資，僅後台登入後可見。
      </p>
      <p className="mb-4 rounded-lg bg-neutral-100 p-3 text-sm text-neutral-600">
        帳戶方案為原始紀錄；目前功能權限依訂閱、試用及授權即時計算，不代表已付費。
        {betaAccess && "目前免費測試授權已開啟，適用舊制會員；新制訪談試用維持原限制。"}
      </p>
      <UsersList users={rows} />
    </div>
  );
}
