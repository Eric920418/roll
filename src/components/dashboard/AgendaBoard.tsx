"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type {
  FocusState,
  Milestone,
  AgendaTasks,
  TaskStatus,
} from "@/lib/dashboard/agenda";

type Props = {
  focus: { state: FocusState; href: string };
  milestones: Milestone[];
  agenda: AgendaTasks;
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  overdue: "bg-red-50 text-red-600 border-red-200",
  dueSoon: "bg-accent/15 text-accent border-accent/30",
  upcoming: "bg-dark/[0.04] text-dark/55 border-dark/10",
  done: "bg-green-50 text-green-700 border-green-200",
};

// 落地待辦：下一步（複用 home.priority 文案）+ 里程碑進度 + 依期限排序的任務清單。
// 勾選複用 /api/tools/checklist，完成後 router.refresh() 由 server 重算期限/排序。
export default function AgendaBoard({ focus, milestones, agenda }: Props) {
  const t = useTranslations("Dashboard.agenda");
  const tP = useTranslations("Dashboard.home.priority");
  const locale = useLocale();
  const router = useRouter();

  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fmt = new Intl.DateTimeFormat(
    locale === "zh-tw" ? "zh-TW" : "en-US",
    { dateStyle: "medium" },
  );

  async function toggle(key: string, nextDone: boolean) {
    setError("");
    setPendingKey(key);
    try {
      const res = await fetch("/api/tools/checklist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: { [key]: nextDone } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setPendingKey(null);
    }
  }

  const hasReminders = agenda.overdueCount + agenda.dueSoonCount > 0;

  return (
    <div className="mt-7 flex flex-col gap-6">
      {/* 提醒橫幅 */}
      <div
        className={`rounded-2xl border p-4 text-sm font-semibold font-[family-name:var(--font-heading)] ${
          agenda.overdueCount > 0
            ? "border-red-200 bg-red-50 text-red-600"
            : hasReminders
              ? "border-accent/30 bg-accent/10 text-dark/80"
              : "border-green-200 bg-green-50 text-green-700"
        }`}
      >
        {hasReminders
          ? t("reminder", { overdue: agenda.overdueCount, soon: agenda.dueSoonCount })
          : t("allClear")}
      </div>

      {/* 下一步（主卡）+ 里程碑 */}
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
            {t("nextTitle")}
          </p>
          <h2 className="mt-2 text-xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
            {tP(`${focus.state}Title`)}
          </h2>
          <p className="mt-1 text-sm text-dark/70">{tP(`${focus.state}Body`)}</p>
          <Link
            href={focus.href}
            className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 font-[family-name:var(--font-heading)]"
          >
            {tP(`${focus.state}Cta`)}
          </Link>
        </section>

        <section className="rounded-2xl border border-dark/10 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-dark/40 font-[family-name:var(--font-heading)]">
            {t("milestonesTitle")}
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {milestones.map((m) => (
              <li key={m.key} className="flex items-center gap-2.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    m.done ? "bg-green-500 text-white" : "border-2 border-dark/15"
                  }`}
                >
                  {m.done && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {m.done ? (
                  <span className="text-sm text-dark/45 line-through">
                    {t(`milestones.${m.key}`)}
                  </span>
                ) : (
                  <Link
                    href={m.href}
                    className="text-sm font-semibold text-dark/80 hover:text-primary font-[family-name:var(--font-heading)]"
                  >
                    {t(`milestones.${m.key}`)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 落地任務 */}
      <section>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
            {t("tasksTitle")}
          </p>
          <span className="text-sm text-dark/55">
            {t("progress", { done: agenda.doneCount, total: agenda.total })}
          </span>
        </div>

        {error && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        )}

        <ul className="mt-3 flex flex-col gap-2">
          {agenda.tasks.map((task) => (
            <li
              key={task.key}
              className="flex items-start gap-3 rounded-2xl border border-dark/10 bg-white p-4"
            >
              <button
                type="button"
                onClick={() => toggle(task.key, !task.done)}
                disabled={pendingKey === task.key}
                aria-label={task.text}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
                  task.done
                    ? "border-primary bg-primary text-white"
                    : "border-dark/20 hover:border-primary"
                }`}
              >
                {task.done && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    task.done ? "text-dark/40 line-through" : "text-dark/85"
                  } font-[family-name:var(--font-body)]`}
                >
                  {task.text}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-dark/45">{task.groupTitle}</span>
                  <span className="text-dark/20">·</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[task.status]}`}
                  >
                    {t(`statusLabels.${task.status}`)}
                  </span>
                  {!task.done && (
                    <span className="text-xs text-dark/45">
                      {t("due", { date: fmt.format(new Date(task.dueAt)) })}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
