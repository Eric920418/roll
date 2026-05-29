import { redirect } from "next/navigation";
import Sidebar from "@/components/admin/Sidebar";
import { getAdminSession } from "@/lib/auth/guard";

// 受保護的後台區（middleware 已擋，這裡再確認一次並取得 session）
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 p-6 md:p-8">{children}</main>
    </div>
  );
}
