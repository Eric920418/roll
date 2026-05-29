"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "儀表板" },
  { href: "/admin/services", label: "服務項目" },
  { href: "/admin/events", label: "活動" },
  { href: "/admin/clients", label: "客戶 Logo" },
  { href: "/admin/work", label: "案例" },
  { href: "/admin/videos", label: "影片 (Golden Ticket)" },
  { href: "/admin/insights", label: "深度指南卡" },
  { href: "/admin/translations", label: "文案翻譯" },
  { href: "/admin/settings", label: "全站設定" },
  { href: "/admin/messages", label: "聯絡訊息" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 bg-neutral-900 text-neutral-100 min-h-screen flex flex-col sticky top-0">
      <div className="px-5 py-6 border-b border-white/10">
        <p className="font-bold tracking-tight">ROLL ON. CMS</p>
        <p className="text-xs text-white/40 mt-0.5">內容管理後台</p>
      </div>
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-white text-neutral-900 font-medium"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-2 py-3 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="w-full rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white text-left transition-colors"
        >
          登出
        </button>
      </div>
    </aside>
  );
}
