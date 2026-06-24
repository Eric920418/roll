import { prisma } from "@/lib/prisma";
import UsersList, { type UserRow } from "@/components/admin/UsersList";

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
      onboardingStep: true,
      completed: true,
      quizCompleted: true,
      createdAt: true,
    },
  });

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email, // 完整 email（依設定：直接顯示，未遮罩）
    name: [u.firstName, u.lastName].filter(Boolean).join(" "),
    provider: u.googleId ? "Google" : "Email",
    emailVerified: u.emailVerified !== null,
    plan: u.plan,
    subscriptionStatus: u.subscriptionStatus,
    status: userStatusLabel(u),
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">註冊帳戶</h1>
      <p className="mb-6 text-sm text-neutral-500">
        公開平台註冊用戶（庫戶）— 共 {rows.length} 位。含 email 個資，僅後台登入後可見。
      </p>
      <UsersList users={rows} />
    </div>
  );
}
