"use client";

import { useMemo, useState } from "react";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  provider: "Google" | "Email";
  emailVerified: boolean;
  plan: string;
  subscriptionStatus: string | null;
  status: string;
  createdAt: string;
};

export default function UsersList({ users }: { users: UserRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    // 後台找特定庫戶：email 與姓名都納入比對（不分大小寫）
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
    );
  }, [users, query]);

  if (users.length === 0) {
    return <p className="text-sm text-neutral-400">尚無註冊用戶</p>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋 email 或姓名…"
          className="w-72 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <span className="text-xs text-neutral-400">
          {filtered.length} / {users.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">用戶</th>
              <th className="px-4 py-2.5 text-left font-medium">Email</th>
              <th className="px-4 py-2.5 text-left font-medium">註冊方式</th>
              <th className="px-4 py-2.5 text-left font-medium">方案</th>
              <th className="px-4 py-2.5 text-left font-medium">狀態</th>
              <th className="px-4 py-2.5 text-left font-medium">註冊時間</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr
                key={u.id}
                className="border-t border-neutral-100 align-top hover:bg-neutral-50"
              >
                <td className="px-4 py-2.5 font-medium">{u.name || "—"}</td>
                <td className="px-4 py-2.5">
                  <span className="select-all">{u.email}</span>
                  {!u.emailVerified && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700">
                      未驗證
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      u.provider === "Google"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {u.provider}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-medium">{u.plan}</span>
                  {u.subscriptionStatus && (
                    <span className="ml-1.5 text-xs text-neutral-400">
                      {u.subscriptionStatus}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-neutral-600">
                  {u.status}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-neutral-500">
                  {new Date(u.createdAt).toLocaleString("zh-TW")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
