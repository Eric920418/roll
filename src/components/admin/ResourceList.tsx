"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ResourceConfig } from "@/lib/cms/resource-fields";

type Item = Record<string, unknown> & { id: string; published?: boolean; order?: number };

function display(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.en === "string") return v.en; // localized → en
    return JSON.stringify(value);
  }
  return String(value);
}

export default function ResourceList({
  resource,
  config,
  items,
}: {
  resource: string;
  config: ResourceConfig;
  items: Item[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("確定刪除這筆資料？此動作無法復原。")) return;
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/${resource}/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `刪除失敗（HTTP ${res.status}）`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold tracking-tight">{config.label}</h1>
        <Link
          href={`/admin/${resource}/new`}
          className="rounded-lg bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-800"
        >
          + 新增
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 whitespace-pre-wrap">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5 w-16">排序</th>
              {config.listColumns.map((c) => (
                <th key={c.name} className="text-left font-medium px-4 py-2.5">
                  {c.label}
                </th>
              ))}
              <th className="text-left font-medium px-4 py-2.5 w-20">狀態</th>
              <th className="px-4 py-2.5 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={config.listColumns.length + 3} className="px-4 py-8 text-center text-neutral-400">
                  尚無資料
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-2.5 text-neutral-400">{item.order ?? 0}</td>
                {config.listColumns.map((c) => (
                  <td key={c.name} className="px-4 py-2.5 max-w-xs truncate">
                    {display(item[c.name])}
                  </td>
                ))}
                <td className="px-4 py-2.5">
                  {item.published ? (
                    <span className="text-green-600">顯示</span>
                  ) : (
                    <span className="text-neutral-400">隱藏</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <Link
                    href={`/admin/${resource}/${item.id}`}
                    className="text-neutral-700 hover:underline mr-3"
                  >
                    編輯
                  </Link>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={busy === item.id}
                    className="text-red-600 hover:underline disabled:opacity-40"
                  >
                    {busy === item.id ? "刪除中" : "刪除"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
