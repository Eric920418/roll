import Link from "next/link";
import ReportRequests from "@/components/admin/ReportRequests";
import { requireAdminPage } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import MessagesInbox, { type Message } from "@/components/admin/MessagesInbox";

export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdminPage();
  const reports = (await searchParams).tab === "reports";
  const rows = reports ? [] : await prisma.contactMessage.findMany({
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
  });
  const messages: Message[] = rows.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    message: m.message,
    locale: m.locale,
    isRead: m.isRead,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">聯絡訊息</h1>
      <nav className="my-6 flex gap-4" aria-label="名單分類"><Link className={`inline-flex min-h-11 items-center border-b-2 ${!reports ? "border-black" : "border-transparent"}`} href="/admin/messages" aria-current={!reports ? "page" : undefined}>聯絡訊息</Link><Link className={`inline-flex min-h-11 items-center border-b-2 ${reports ? "border-black" : "border-transparent"}`} href="/admin/messages?tab=reports" aria-current={reports ? "page" : undefined}>報告下載</Link></nav>
      {reports ? <ReportRequests /> : <MessagesInbox messages={messages} />}
    </div>
  );
}
