import { prisma } from "@/lib/prisma";
import MessagesInbox, { type Message } from "@/components/admin/MessagesInbox";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const rows = await prisma.contactMessage.findMany({
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
      <p className="text-neutral-500 text-sm mb-6">前台聯絡表單投遞的訊息</p>
      <MessagesInbox messages={messages} />
    </div>
  );
}
