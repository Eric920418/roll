"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Message = {
  id: string;
  name: string;
  email: string;
  message: string;
  locale: string | null;
  isRead: boolean;
  createdAt: string;
};

export default function MessagesInbox({ messages }: { messages: Message[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function setRead(id: string, isRead: boolean) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/contact-messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "更新失敗");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("確定刪除這則訊息？")) return;
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/contact-messages/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "刪除失敗");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 whitespace-pre-wrap">
          {error}
        </p>
      )}
      {messages.length === 0 ? (
        <p className="text-neutral-400 text-sm">尚無訊息</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-xl border p-4 ${
                m.isRead ? "border-neutral-200 bg-white" : "border-amber-300 bg-amber-50"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {m.name}{" "}
                    <a href={`mailto:${m.email}`} className="text-neutral-500 font-normal hover:underline">
                      &lt;{m.email}&gt;
                    </a>
                    {m.locale && (
                      <span className="ml-2 text-xs text-neutral-400">[{m.locale}]</span>
                    )}
                  </p>
                  <p className="text-sm text-neutral-700 mt-1.5 whitespace-pre-wrap break-words">
                    {m.message}
                  </p>
                  <p className="text-xs text-neutral-400 mt-2">
                    {new Date(m.createdAt).toLocaleString("zh-TW")}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0 text-sm">
                  <button
                    onClick={() => setRead(m.id, !m.isRead)}
                    disabled={busy === m.id}
                    className="text-neutral-700 hover:underline disabled:opacity-40"
                  >
                    {m.isRead ? "標記未讀" : "標記已讀"}
                  </button>
                  <button
                    onClick={() => remove(m.id)}
                    disabled={busy === m.id}
                    className="text-red-600 hover:underline disabled:opacity-40"
                  >
                    刪除
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
