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
  // AI 草稿：每則訊息各自一份可編輯草稿；draftBusy 與 busy 分開，互不阻擋。
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftBusy, setDraftBusy] = useState<string | null>(null);

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

  // AI 產生量身草稿：只產草稿放進可編輯欄，不寄信（寄送維持人工）。
  async function genDraft(id: string) {
    setDraftBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/contact-messages/${id}/draft-reply`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "草稿產生失敗");
      setDrafts((d) => ({ ...d, [id]: json.data.draft as string }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "草稿產生失敗");
    } finally {
      setDraftBusy(null);
    }
  }

  function mailtoHref(email: string, body: string) {
    const subject = encodeURIComponent("Re: ROLL ON");
    return `mailto:${email}?subject=${subject}&body=${encodeURIComponent(body)}`;
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
          {messages.map((m) => {
            const draft = drafts[m.id];
            return (
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
                      onClick={() => genDraft(m.id)}
                      disabled={draftBusy === m.id}
                      className="text-indigo-600 hover:underline disabled:opacity-40"
                    >
                      {draftBusy === m.id
                        ? "產生中…"
                        : draft
                          ? "重新產生草稿"
                          : "AI 產生草稿回覆"}
                    </button>
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

                {draft !== undefined && (
                  <div className="mt-3 border-t border-neutral-200 pt-3">
                    <label className="text-xs text-neutral-400">
                      AI 草稿（可編輯後再寄出，AI 不會自動寄信）
                    </label>
                    <textarea
                      value={draft}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [m.id]: e.target.value }))
                      }
                      rows={8}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <div className="flex items-center gap-3 mt-1.5 text-sm">
                      <a
                        href={mailtoHref(m.email, draft)}
                        className="text-indigo-600 hover:underline"
                      >
                        以 Email 回覆
                      </a>
                      <button
                        onClick={() =>
                          setDrafts((d) => {
                            const next = { ...d };
                            delete next[m.id];
                            return next;
                          })
                        }
                        className="text-neutral-500 hover:underline"
                      >
                        收合
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
