"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import PlaybookArticle from "./PlaybookArticle";

type Seg = { key: string; heading: string; body: string };
type Filter = "all" | "unread" | "read";

// 分段閱讀器：每段一張卡（標題 + markdown 內文 + 標為已讀 toggle）+ 頂部進度與「全部/未讀/已讀」filter。
export default function PlaybookReader({
  slug,
  segments,
  initialReads,
}: {
  slug: string;
  segments: Seg[];
  initialReads: Record<string, boolean>;
}) {
  const t = useTranslations("Dashboard.playbooks.reader");
  const [reads, setReads] = useState<Record<string, boolean>>(initialReads);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const doneCount = segments.filter((s) => reads[s.key]).length;

  async function toggle(key: string) {
    const next = !reads[key];
    setReads((r) => ({ ...r, [key]: next })); // 樂觀更新
    setBusy(key);
    try {
      const res = await fetch("/api/playbooks/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, segmentKey: key, read: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setReads((r) => ({ ...r, [key]: !next })); // 失敗還原
    } finally {
      setBusy(null);
    }
  }

  const shown = segments.filter((s) =>
    filter === "all" ? true : filter === "read" ? reads[s.key] : !reads[s.key],
  );

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-dark/70 font-[family-name:var(--font-heading)]">
          {t("progress", { done: doneCount, total: segments.length })}
        </p>
        <div className="flex gap-1">
          {(["all", "unread", "read"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors font-[family-name:var(--font-heading)] ${
                filter === f
                  ? "bg-primary text-white"
                  : "text-dark/60 hover:bg-dark/[0.04]"
              }`}
            >
              {t(`filter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {shown.map((s) => {
          const isRead = !!reads[s.key];
          return (
            <section
              key={s.key}
              className={`rounded-2xl border p-6 transition-colors ${
                isRead ? "border-primary/25 bg-primary/[0.02]" : "border-dark/10 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
                  {s.heading}
                </h2>
                <button
                  type="button"
                  onClick={() => toggle(s.key)}
                  disabled={busy === s.key}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 font-[family-name:var(--font-heading)] ${
                    isRead
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "border border-dark/15 text-dark/60 hover:bg-dark/[0.04]"
                  }`}
                >
                  {isRead ? `✓ ${t("read")}` : t("markRead")}
                </button>
              </div>
              <PlaybookArticle markdown={s.body} />
            </section>
          );
        })}
        {shown.length === 0 && (
          <p className="rounded-2xl border border-dark/10 bg-white p-6 text-sm text-dark/50">
            {t("emptyFilter")}
          </p>
        )}
      </div>
    </div>
  );
}
