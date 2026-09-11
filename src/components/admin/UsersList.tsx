"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  provider: "Google" | "Email";
  emailVerified: boolean;
  plan: string;
  subscriptionStatus: string | null;
  hasPaypalSubscription: boolean;
  currentPeriodEnd: string | null;
  trialPlan: string | null;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  status: string;
  createdAt: string;
};

export default function UsersList({ users }: { users: UserRow[] }) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function updateTrial(
    user: UserRow,
    plan: "pro" | "business",
    startsAt: string,
    endsAt: string,
  ) {
    setBusy(user.id);
    setError("");
    try {
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
        throw new Error("請完整填寫試用開始與結束時間。");
      }
      const res = await fetch(`/api/admin/users/${user.id}/trial`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "試用設定失敗");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function revokeTrial(user: UserRow) {
    setBusy(user.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}/trial`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "撤銷試用失敗");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

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

      {error && (
        <p role="alert" className="mb-4 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">用戶</th>
              <th className="px-4 py-2.5 text-left font-medium">Email</th>
              <th className="px-4 py-2.5 text-left font-medium">註冊方式</th>
              <th className="px-4 py-2.5 text-left font-medium">方案</th>
              <th className="px-4 py-2.5 text-left font-medium">狀態</th>
              <th className="px-4 py-2.5 text-left font-medium">限時試用</th>
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
                  {!u.hasPaypalSubscription && u.subscriptionStatus === "ACTIVE" && !u.trialPlan && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
                      假 ACTIVE，待轉 trial
                    </span>
                  )}
                </td>
                <td className="min-w-72 px-4 py-2.5">
                  <TrialControls
                    user={u}
                    disabled={busy === u.id}
                    onSave={updateTrial}
                    onRevoke={revokeTrial}
                  />
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

function localInputValue(value: string | null, fallback: Date): string {
  const date = value ? new Date(value) : fallback;
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function TrialControls({
  user,
  disabled,
  onSave,
  onRevoke,
}: {
  user: UserRow;
  disabled: boolean;
  onSave: (user: UserRow, plan: "pro" | "business", startsAt: string, endsAt: string) => void;
  onRevoke: (user: UserRow) => void;
}) {
  const now = new Date();
  const plus30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [plan, setPlan] = useState<"pro" | "business">(
    user.trialPlan === "business" ? "business" : "pro",
  );
  const [startsAt, setStartsAt] = useState(localInputValue(user.trialStartsAt, now));
  const [endsAt, setEndsAt] = useState(localInputValue(user.trialEndsAt, plus30));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select value={plan} onChange={(e) => setPlan(e.target.value as "pro" | "business")} className="min-h-11 rounded border border-neutral-300 px-2 text-xs">
          <option value="pro">Pro</option>
          <option value="business">Business</option>
        </select>
        <button type="button" disabled={disabled} onClick={() => onSave(user, plan, startsAt, endsAt)} className="min-h-11 rounded bg-neutral-900 px-3 text-xs font-semibold text-white disabled:opacity-50">
          {disabled ? "處理中…" : user.trialPlan ? "更新" : "設定"}
        </button>
        {user.trialPlan && (
          <button type="button" disabled={disabled} onClick={() => onRevoke(user)} className="min-h-11 rounded border border-red-200 px-3 text-xs font-semibold text-red-700 disabled:opacity-50">
            撤銷
          </button>
        )}
      </div>
      <label className="text-[11px] text-neutral-500">開始<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="ml-2 rounded border border-neutral-300 px-2 py-1" /></label>
      <label className="text-[11px] text-neutral-500">結束<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="ml-2 rounded border border-neutral-300 px-2 py-1" /></label>
    </div>
  );
}
