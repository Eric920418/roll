import { prisma } from "@/lib/prisma";
import FeedbackInbox, {
  type FeedbackItem,
} from "@/components/admin/FeedbackInbox";
import { PENDING_STATUSES } from "@/lib/dashboard/feedback";

export const dynamic = "force-dynamic"; // 後台一律即時資料

export default async function AdminFeedbackPage() {
  const rows = await prisma.feedbackReport.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      // 分流靠上下文：誰回報的、什麼方案。付費會員回報的故障
      // 與免費帳號的體驗建議，優先級本來就不同。
      user: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
          plan: true,
        },
      },
    },
  });

  const items: FeedbackItem[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    pageUrl: r.pageUrl,
    locale: r.locale,
    userAgent: r.userAgent,
    status: r.status,
    adminReply: r.adminReply,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    userEmail: r.user.email,
    userName:
      [r.user.firstName, r.user.lastName].filter(Boolean).join(" ") || null,
    userPlan: r.user.plan,
  }));

  const pending = items.filter((i) =>
    (PENDING_STATUSES as readonly string[]).includes(i.status),
  ).length;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">問題回報</h1>
      <p className="text-neutral-500 text-sm mb-6">
        會員後台送出的 bug 回報與建議 —— 共 {items.length} 則，{pending} 則待處理
      </p>
      <FeedbackInbox items={items} />
    </div>
  );
}
