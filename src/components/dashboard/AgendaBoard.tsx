"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type {
  AgendaTask,
  FocusState,
  Milestone,
  AgendaTasks,
  TaskStatus,
} from "@/lib/dashboard/agenda";

type Props = {
  focus: { state: FocusState; href: string };
  milestones: Milestone[];
  agenda: AgendaTasks;
  /** 任務清單為空時顯示的引導卡（由 server 傳入） */
  emptyState?: ReactNode;
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  overdue: "bg-red-50 text-red-600 border-red-200",
  dueSoon: "bg-accent/15 text-accent border-accent/30",
  upcoming: "bg-dark/[0.04] text-dark/55 border-dark/10",
  done: "bg-green-50 text-green-700 border-green-200",
};

// 落地待辦：下一步（複用 home.priority 文案）+ 里程碑進度 + 依期限排序的任務清單。
// 系統任務勾選走 /api/tools/checklist（存 User.checklistState JSON）；
// 自訂任務（＋ 新增的）走 /api/agenda-tasks（LandingTask 表），可改期限、可刪除。
// 兩者完成後都 router.refresh()，由 server 重算期限/狀態/排序。
export default function AgendaBoard({
  focus,
  milestones,
  agenda,
  emptyState,
}: Props) {
  const t = useTranslations("Dashboard.agenda");
  const tP = useTranslations("Dashboard.home.priority");
  const tA = useTranslations("Dashboard.actions");
  const locale = useLocale();
  const router = useRouter();

  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  // 新增任務 composer（點 ＋ 才展開，維持清單本身的視覺密度）
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", dueAt: "" });
  const [creating, setCreating] = useState(false);

  const fmt = new Intl.DateTimeFormat(
    locale === "zh-tw" ? "zh-TW" : "en-US",
    { dateStyle: "medium" },
  );

  async function toggle(task: AgendaTask, nextDone: boolean) {
    setError("");
    setPendingKey(task.key);
    try {
      // 系統任務的完成狀態存在 checklistState JSON；自訂任務有自己的 DB 列
      const [url, init] =
        task.source === "custom"
          ? [
              `/api/agenda-tasks/${task.id}`,
              { method: "PATCH", body: JSON.stringify({ done: nextDone }) },
            ]
          : [
              "/api/tools/checklist",
              {
                method: "PATCH",
                body: JSON.stringify({ state: { [task.key]: nextDone } }),
              },
            ];

      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json" },
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

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/agenda-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      setDraft({ title: "", dueAt: "" });
      setComposerOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setCreating(false);
    }
  }

  async function removeTask(task: AgendaTask) {
    if (!window.confirm(tA("deleteConfirm"))) return;
    setError("");
    setPendingKey(task.key);
    try {
      const res = await fetch(`/api/agenda-tasks/${task.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "delete failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
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
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
            {t("tasksTitle")}
          </p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-dark/55">
              {t("progress", { done: agenda.doneCount, total: agenda.total })}
            </span>
            <button
              type="button"
              onClick={() => {
                setComposerOpen((open) => !open);
                setError("");
              }}
              aria-expanded={composerOpen}
              aria-label={t("addTask")}
              title={t("addTask")}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
                composerOpen
                  ? "border-primary bg-primary text-white"
                  : "border-dark/15 text-dark/60 hover:border-primary hover:text-primary"
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                className={`transition-transform ${composerOpen ? "rotate-45" : ""}`}
              >
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {composerOpen && (
          <form
            onSubmit={createTask}
            className="mt-3 rounded-2xl border border-primary/25 bg-primary/[0.03] p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                autoFocus
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder={t("newTaskPlaceholder")}
                maxLength={200}
                required
                className="min-w-0 flex-1 rounded-xl border border-dark/10 bg-white px-4 py-2.5 text-sm text-dark outline-none transition placeholder:text-dark/35 focus:border-primary focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]"
              />
              <input
                type="date"
                value={draft.dueAt}
                onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })}
                aria-label={t("dueDate")}
                className="rounded-xl border border-dark/10 bg-white px-4 py-2.5 text-sm text-dark outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]"
              />
              <button
                type="submit"
                disabled={creating}
                className="shrink-0 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60 font-[family-name:var(--font-heading)]"
              >
                {creating ? tA("saving") : tA("add")}
              </button>
            </div>
            <p className="mt-2 text-xs text-dark/45">{t("newTaskHint")}</p>
          </form>
        )}

        {error && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        )}

        {agenda.total === 0 && emptyState && (
          <div className="mt-3">{emptyState}</div>
        )}

        <ul className="mt-3 flex flex-col gap-2">
          {agenda.tasks.map((task) => (
            <li
              key={task.key}
              className="flex items-start gap-3 rounded-2xl border border-dark/10 bg-white p-4"
            >
              <button
                type="button"
                onClick={() => toggle(task, !task.done)}
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
                  {!task.done && task.dueAt && (
                    <span className="text-xs text-dark/45">
                      {t("due", { date: fmt.format(new Date(task.dueAt)) })}
                    </span>
                  )}
                  {!task.done && !task.dueAt && (
                    <span className="text-xs text-dark/35">{t("noDueDate")}</span>
                  )}
                </div>
              </div>

              {/* 自訂任務才可刪除；系統模板任務只能勾選 */}
              {task.source === "custom" && (
                <button
                  type="button"
                  onClick={() => removeTask(task)}
                  disabled={pendingKey === task.key}
                  aria-label={tA("delete")}
                  title={tA("delete")}
                  className="shrink-0 rounded-lg border border-transparent p-1.5 text-dark/30 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
