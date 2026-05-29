"use client";

import { useMemo, useState } from "react";

export type TransItem = { path: string; en: string; zh: string };
export type TransGroup = { namespace: string; items: TransItem[] };

export default function TranslationsEditor({ groups }: { groups: TransGroup[] }) {
  // edits: path -> { en, zh }
  const [edits, setEdits] = useState<Record<string, { en: string; zh: string }>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeNs, setActiveNs] = useState(groups[0]?.namespace ?? "");

  const dirtyCount = Object.keys(edits).length;

  const current = useMemo(
    () => groups.find((g) => g.namespace === activeNs),
    [groups, activeNs],
  );

  function val(item: TransItem, locale: "en" | "zh") {
    const edit = edits[item.path];
    if (edit) return locale === "en" ? edit.en : edit.zh;
    return locale === "en" ? item.en : item.zh;
  }

  function update(item: TransItem, locale: "en" | "zh", value: string) {
    setEdits((prev) => {
      const base = prev[item.path] ?? { en: item.en, zh: item.zh };
      return { ...prev, [item.path]: { ...base, [locale]: value } };
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const entries = Object.entries(edits).map(([path, v]) => ({
        path,
        en: v.en,
        "zh-tw": v.zh,
      }));
      const res = await fetch("/api/admin/translations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `儲存失敗（HTTP ${res.status}）`);
      setMessage(`已儲存 ${entries.length} 筆，前台將即時更新`);
      setEdits({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

  return (
    <div className="flex gap-6">
      {/* namespace 側欄 */}
      <div className="w-44 shrink-0">
        <div className="sticky top-6 flex flex-col gap-0.5">
          {groups.map((g) => (
            <button
              key={g.namespace}
              onClick={() => setActiveNs(g.namespace)}
              className={`rounded-lg px-3 py-2 text-sm text-left transition-colors ${
                activeNs === g.namespace
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {g.namespace}
            </button>
          ))}
        </div>
      </div>

      {/* 編輯區 */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col gap-5">
          {current?.items.map((item) => (
            <div key={item.path} className="flex flex-col gap-1.5">
              <span className="text-xs font-mono text-neutral-400">{item.path}</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-neutral-400">English</span>
                  <textarea
                    rows={2}
                    value={val(item, "en")}
                    onChange={(e) => update(item, "en", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-neutral-400">繁體中文</span>
                  <textarea
                    rows={2}
                    value={val(item, "zh")}
                    onChange={(e) => update(item, "zh", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 固定儲存列 */}
      <div className="fixed bottom-0 left-60 right-0 bg-white/95 backdrop-blur border-t border-neutral-200 px-8 py-3 flex items-center justify-between">
        <div className="text-sm">
          {dirtyCount > 0 ? (
            <span className="text-neutral-700">{dirtyCount} 筆未儲存變更</span>
          ) : (
            <span className="text-neutral-400">無變更</span>
          )}
          {message && <span className="ml-3 text-green-600">{message}</span>}
          {error && <span className="ml-3 text-red-600 whitespace-pre-wrap">{error}</span>}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || dirtyCount === 0}
          className="rounded-lg bg-neutral-900 text-white px-5 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40"
        >
          {saving ? "儲存中…" : "儲存變更"}
        </button>
      </div>
    </div>
  );
}
