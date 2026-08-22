"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FEEDBACK_STATUSES,
  PENDING_STATUSES,
  STATUS_LABELS_ZH,
  STATUS_STYLES_ZH,
  TYPE_LABELS_ZH,
  toFeedbackStatus,
  toFeedbackType,
} from "@/lib/dashboard/feedback";

export type FeedbackItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  pageUrl: string | null;
  locale: string | null;
  userAgent: string | null;
  status: string;
  adminReply: string | null;
  createdAt: string;
  resolvedAt: string | null;
  userEmail: string;
  userName: string | null;
  userPlan: string;
};

type Filter = "pending" | "all" | (typeof FEEDBACK_STATUSES)[number];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "待處理" },
  ...FEEDBACK_STATUSES.map((s) => ({ key: s as Filter, label: STATUS_LABELS_ZH[s] })),
  { key: "all", label: "全部" },
];

export default function FeedbackInbox({ items }: { items: FeedbackItem[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  // 回覆草稿：以 id 為 key，只在使用者展開/編輯時存在（undefined = 未展開）
  const [replies, setReplies] = useState<Record<string, string>>({});

  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "pending") {
      return items.filter((i) =>
        (PENDING_STATUSES as readonly string[]).includes(i.status),
      );
    }
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  async function patch(id: string, payload: Record<string, unknown>) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    if (!confirm("確定刪除這則回報？會員端也會一併消失，且無法復原。")) return;
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "刪除失敗");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setBusy(null);
    }
  }

  function countOf(key: Filter): number {
    if (key === "all") return items.length;
    if (key === "pending") {
      return items.filter((i) =>
        (PENDING_STATUSES as readonly string[]).includes(i.status),
      ).length;
    }
    return items.filter((i) => i.status === key).length;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              filter === f.key
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-xs opacity-60">{countOf(f.key)}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 whitespace-pre-wrap">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text-neutral-400 text-sm">此分類尚無回報</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((it) => {
            const status = toFeedbackStatus(it.status);
            const draft = replies[it.id];
            const isBug = toFeedbackType(it.type) === "bug";
            return (
              <li
                key={it.id}
                className="rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES_ZH[status]}`}
                  >
                    {STATUS_LABELS_ZH[status]}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      isBug
                        ? "bg-red-50 text-red-700"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {TYPE_LABELS_ZH[toFeedbackType(it.type)]}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {new Date(it.createdAt).toLocaleString("zh-TW")}
                  </span>
                  <span className="ml-auto text-xs text-neutral-500">
                    {it.userName ? `${it.userName} · ` : ""}
                    <a
                      href={`mailto:${it.userEmail}`}
                      className="hover:underline"
                    >
                      {it.userEmail}
                    </a>
                    <span className="ml-1.5 rounded bg-neutral-100 px-1.5 py-0.5 uppercase">
                      {it.userPlan}
                    </span>
                  </span>
                </div>

                <p className="font-medium mt-2">{it.title}</p>
                <p className="text-sm text-neutral-700 mt-1 whitespace-pre-wrap break-words">
                  {it.body}
                </p>

                {(it.pageUrl || it.locale || it.userAgent) && (
                  <details className="mt-2">
                    <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-600">
                      重現資訊
                    </summary>
                    <dl className="mt-1.5 text-xs text-neutral-500 space-y-0.5">
                      {it.pageUrl && (
                        <div>
                          <dt className="inline text-neutral-400">頁面：</dt>{" "}
                          <dd className="inline break-all">{it.pageUrl}</dd>
                        </div>
                      )}
                      {it.locale && (
                        <div>
                          <dt className="inline text-neutral-400">語系：</dt>{" "}
                          <dd className="inline">{it.locale}</dd>
                        </div>
                      )}
                      {it.userAgent && (
                        <div>
                          <dt className="inline text-neutral-400">瀏覽器：</dt>{" "}
                          <dd className="inline break-all">{it.userAgent}</dd>
                        </div>
                      )}
                    </dl>
                  </details>
                )}

                {it.adminReply && draft === undefined && (
                  <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                    <p className="text-xs text-indigo-500">
                      已回覆（會員在自己的回報清單看得到）
                    </p>
                    <p className="text-sm text-neutral-800 mt-0.5 whitespace-pre-wrap">
                      {it.adminReply}
                    </p>
                  </div>
                )}

                {draft !== undefined && (
                  <div className="mt-3">
                    <label className="text-xs text-neutral-400">
                      回覆內容 —— 會員在自己的回報清單看得到
                    </label>
                    <textarea
                      value={draft}
                      onChange={(e) =>
                        setReplies((r) => ({ ...r, [it.id]: e.target.value }))
                      }
                      rows={4}
                      maxLength={4000}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <div className="flex items-center gap-3 mt-1.5 text-sm">
                      <button
                        onClick={async () => {
                          await patch(it.id, { adminReply: draft });
                          setReplies((r) => {
                            const next = { ...r };
                            delete next[it.id];
                            return next;
                          });
                        }}
                        disabled={busy === it.id}
                        className="text-indigo-600 hover:underline disabled:opacity-40"
                      >
                        {busy === it.id ? "儲存中…" : "儲存回覆"}
                      </button>
                      <button
                        onClick={() =>
                          setReplies((r) => {
                            const next = { ...r };
                            delete next[it.id];
                            return next;
                          })
                        }
                        className="text-neutral-500 hover:underline"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-neutral-100 text-sm">
                  <label className="flex items-center gap-1.5 text-neutral-500">
                    狀態
                    <select
                      value={status}
                      onChange={(e) => patch(it.id, { status: e.target.value })}
                      disabled={busy === it.id}
                      className="rounded-lg border border-neutral-300 px-2 py-1 text-sm text-neutral-800 disabled:opacity-40"
                    >
                      {FEEDBACK_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS_ZH[s]}
                        </option>
                      ))}
                    </select>
                  </label>

                  {draft === undefined && (
                    <button
                      onClick={() =>
                        setReplies((r) => ({
                          ...r,
                          [it.id]: it.adminReply ?? "",
                        }))
                      }
                      className="text-indigo-600 hover:underline"
                    >
                      {it.adminReply ? "編輯回覆" : "回覆會員"}
                    </button>
                  )}

                  <button
                    onClick={() => remove(it.id)}
                    disabled={busy === it.id}
                    className="ml-auto text-red-600 hover:underline disabled:opacity-40"
                  >
                    刪除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
