"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AdminRecord = {
  id: string;
  summary: string;
  data: Record<string, unknown>;
};

// 通用「巢狀 JSON 記錄」後台：列出記錄，逐筆以 JSON textarea 編輯 / 新增 / 刪除。
// 用於 founders、quiz-questions（含雙語、timeline、businessDetails 等深層結構）。
export default function JsonRecordsAdmin({
  resource,
  title,
  description,
  records,
  template,
}: {
  resource: string; // /api/admin/<resource>
  title: string;
  description: string;
  records: AdminRecord[];
  template: Record<string, unknown>;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function edit(r: AdminRecord) {
    setOpenId(r.id);
    setDraft(JSON.stringify(r.data, null, 2));
    setError("");
  }
  function startNew() {
    setOpenId("__new__");
    setDraft(JSON.stringify(template, null, 2));
    setError("");
  }

  async function save() {
    setError("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setError("JSON 格式錯誤：" + (e as Error).message);
      return;
    }
    setBusy(true);
    try {
      const isNew = openId === "__new__";
      const res = await fetch(
        isNew ? `/api/admin/${resource}` : `/api/admin/${resource}/${openId}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "儲存失敗");
      setOpenId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("確定刪除這筆記錄？")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/${resource}/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "刪除失敗");
      if (openId === id) setOpenId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "刪除失敗");
    } finally {
      setBusy(false);
    }
  }

  const editor = (
    <div className="mb-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={16}
        spellCheck={false}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-xs outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
        <button
          onClick={() => setOpenId(null)}
          className="px-3 py-2 text-sm text-neutral-700 hover:underline"
        >
          取消
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-neutral-500">{description}</p>
        </div>
        <button
          onClick={startNew}
          className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          新增
        </button>
      </div>

      {error && (
        <p className="mb-4 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {openId === "__new__" && editor}

      <ul className="flex flex-col gap-2">
        {records.length === 0 && (
          <p className="text-sm text-neutral-400">尚無記錄</p>
        )}
        {records.map((r) => (
          <li key={r.id} className="rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between gap-4 p-4">
              <span className="min-w-0 truncate text-sm">{r.summary}</span>
              <div className="flex shrink-0 gap-3 text-sm">
                <button
                  onClick={() => (openId === r.id ? setOpenId(null) : edit(r))}
                  className="text-neutral-700 hover:underline"
                >
                  {openId === r.id ? "收合" : "編輯"}
                </button>
                <button
                  onClick={() => remove(r.id)}
                  disabled={busy}
                  className="text-red-600 hover:underline disabled:opacity-40"
                >
                  刪除
                </button>
              </div>
            </div>
            {openId === r.id && <div className="px-4 pb-4">{editor}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
