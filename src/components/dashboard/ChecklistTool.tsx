"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ChecklistGroupView } from "@/lib/tools/checklist";

export default function ChecklistTool({
  groups,
  initialState,
}: {
  groups: ChecklistGroupView[];
  initialState: Record<string, boolean>;
}) {
  const t = useTranslations("Dashboard.tools");
  const [done, setDone] = useState<Record<string, boolean>>(initialState);
  const [error, setError] = useState("");

  const allKeys = groups.flatMap((g) => g.items.map((i) => i.key));
  const total = allKeys.length;
  const completed = allKeys.filter((k) => done[k]).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  async function toggle(key: string) {
    const nextVal = !done[key];
    setDone((prev) => ({ ...prev, [key]: nextVal })); // 樂觀更新
    setError("");
    try {
      const res = await fetch("/api/tools/checklist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: { [key]: nextVal } }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "save failed");
      }
    } catch (e) {
      setDone((prev) => ({ ...prev, [key]: !nextVal })); // rollback
      setError(e instanceof Error ? e.message : "save failed");
    }
  }

  return (
    <div className="mt-7">
      <div className="rounded-2xl border border-dark/10 bg-white p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-dark font-[family-name:var(--font-heading)]">
            {t("progress")}
          </span>
          <span className="font-bold text-primary">
            {completed}/{total}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-primary/10">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {groups.map((g) => (
          <section
            key={g.need}
            className="rounded-2xl border border-dark/10 bg-white p-5"
          >
            <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
              {g.title}
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              {g.items.map((it) => (
                <li key={it.key}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={!!done[it.key]}
                      onChange={() => toggle(it.key)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                    />
                    <span
                      className={`text-sm leading-snug font-[family-name:var(--font-body)] ${
                        done[it.key]
                          ? "text-dark/40 line-through"
                          : "text-dark/80"
                      }`}
                    >
                      {it.text}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
