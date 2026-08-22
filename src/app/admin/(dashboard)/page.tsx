import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PENDING_STATUSES } from "@/lib/dashboard/feedback";

export const dynamic = "force-dynamic"; // 後台一律即時資料

const CARDS: { href: string; label: string; key: string }[] = [
  { href: "/admin/services", label: "服務項目", key: "service" },
  { href: "/admin/events", label: "活動", key: "event" },
  { href: "/admin/clients", label: "客戶", key: "client" },
  { href: "/admin/work", label: "案例", key: "work" },
  { href: "/admin/videos", label: "影片", key: "video" },
  { href: "/admin/insights", label: "深度指南卡", key: "insight" },
];

export default async function DashboardPage() {
  const [
    service,
    event,
    client,
    work,
    video,
    insight,
    unread,
    users,
    pendingFeedback,
  ] = await Promise.all([
    prisma.service.count(),
    prisma.event.count(),
    prisma.client.count(),
    prisma.workCase.count(),
    prisma.video.count(),
    prisma.insightTeaser.count(),
    prisma.contactMessage.count({ where: { isRead: false } }),
    prisma.user.count(),
    prisma.feedbackReport.count({
      where: { status: { in: [...PENDING_STATUSES] } },
    }),
  ]);
  const counts: Record<string, number> = { service, event, client, work, video, insight };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight mb-1">儀表板</h1>
      <p className="text-neutral-500 text-sm mb-6">內容總覽與快速入口</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Link
          href="/admin/messages"
          className="block rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-400 transition-colors"
        >
          <p className="text-sm text-neutral-500">未讀聯絡訊息</p>
          <p className="text-3xl font-bold mt-1">
            {unread}
            {unread > 0 && (
              <span className="ml-2 text-sm font-normal text-red-600">需處理</span>
            )}
          </p>
        </Link>

        <Link
          href="/admin/feedback"
          className="block rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-400 transition-colors"
        >
          <p className="text-sm text-neutral-500">待處理問題回報</p>
          <p className="text-3xl font-bold mt-1">
            {pendingFeedback}
            {pendingFeedback > 0 && (
              <span className="ml-2 text-sm font-normal text-red-600">需處理</span>
            )}
          </p>
        </Link>

        <Link
          href="/admin/users"
          className="block rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-400 transition-colors"
        >
          <p className="text-sm text-neutral-500">註冊帳戶</p>
          <p className="text-3xl font-bold mt-1">{users}</p>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-400 transition-colors"
          >
            <p className="text-sm text-neutral-500">{c.label}</p>
            <p className="text-3xl font-bold mt-1">{counts[c.key]}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
