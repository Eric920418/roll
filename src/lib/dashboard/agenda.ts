import type { Account } from "@/lib/auth/account";
import type { ChecklistGroupView } from "@/lib/tools/checklist";
import { getEffectivePlan } from "@/lib/billing/gate";
import { destinationFor } from "@/lib/auth/onboarding";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

// 落地待辦的計算層（純函式）。系統依會員進度自動推「下一步 + 任務期限」，不需新資料表。

// ── 里程碑 / 當前重點（與 Overview PriorityBanner 共用同一進度判斷）──

export type FocusState = "onboarding" | "quiz" | "upgrade" | "ready";
export type MilestoneKey = "onboarding" | "quiz" | "upgrade";
export type Milestone = { key: MilestoneKey; done: boolean; href: string };

/** 三個落地里程碑 + 完成狀態 + 對應連結。 */
export function computeMilestones(account: Account, locale: Locale): Milestone[] {
  const isPaying = getEffectivePlan(account) !== "free";
  return [
    {
      key: "onboarding",
      done: account.completed || account.onboardingStep >= 4,
      href: destinationFor(
        { completed: account.completed, onboardingStep: account.onboardingStep },
        locale,
      ),
    },
    { key: "quiz", done: account.quizCompleted, href: pathForLocale("/quiz", locale) },
    {
      key: "upgrade",
      done: isPaying,
      href: pathForLocale("/dashboard/billing", locale),
    },
  ];
}

/** 當前重點 = 第一個未完成里程碑；全完成則 "ready"。供 PriorityBanner 與 Agenda 共用。 */
export function computeFocus(
  account: Account,
  locale: Locale,
): { state: FocusState; href: string } {
  const next = computeMilestones(account, locale).find((m) => !m.done);
  if (next) return { state: next.key, href: next.href };
  return { state: "ready", href: pathForLocale("/dashboard/companies", locale) };
}

// ── 落地任務（Tools 落地清單 + 系統推算期限）──

// 各落地群組的建議完成天數（自落地起點 anchor 起算）。
const SUGGESTED_DAYS: Record<string, number> = {
  "market-entry": 30,
  legal: 45,
  fundraising: 60,
  marketing: 45,
  "sales-channel": 60,
  "investor-access": 75,
};
const DEFAULT_DAYS = 45;
const DUE_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TaskStatus = "done" | "overdue" | "dueSoon" | "upcoming";

export type AgendaTask = {
  key: string; // checklist item key（勾選狀態沿用 User.checklistState）
  need: string;
  groupTitle: string;
  text: string;
  done: boolean;
  dueAt: string; // ISO 字串（傳給 client 格式化）
  status: TaskStatus;
};

export type AgendaTasks = {
  tasks: AgendaTask[];
  overdueCount: number;
  dueSoonCount: number;
  doneCount: number;
  total: number;
};

/**
 * 把 buildChecklist 的項目算出建議期限與狀態。
 * anchor＝落地起點（會員註冊日）；now＝當下。未完成依 dueAt 升序（逾期在前），已完成置底。
 */
export function computeTasks(
  groups: ChecklistGroupView[],
  checklistState: Record<string, boolean>,
  anchor: Date,
  now: Date,
): AgendaTasks {
  const soonThreshold = now.getTime() + DUE_SOON_DAYS * DAY_MS;

  const tasks: AgendaTask[] = groups.flatMap((g) => {
    const days = SUGGESTED_DAYS[g.need] ?? DEFAULT_DAYS;
    const due = new Date(anchor.getTime() + days * DAY_MS);
    return g.items.map((it) => {
      const done = Boolean(checklistState[it.key]);
      let status: TaskStatus;
      if (done) status = "done";
      else if (due.getTime() < now.getTime()) status = "overdue";
      else if (due.getTime() <= soonThreshold) status = "dueSoon";
      else status = "upcoming";
      return {
        key: it.key,
        need: g.need,
        groupTitle: g.title,
        text: it.text,
        done,
        dueAt: due.toISOString(),
        status,
      };
    });
  });

  // 未完成優先，未完成內依 dueAt 升序；已完成置底
  const rank: Record<TaskStatus, number> = { overdue: 0, dueSoon: 1, upcoming: 2, done: 3 };
  tasks.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return a.dueAt.localeCompare(b.dueAt);
  });

  return {
    tasks,
    overdueCount: tasks.filter((t) => t.status === "overdue").length,
    dueSoonCount: tasks.filter((t) => t.status === "dueSoon").length,
    doneCount: tasks.filter((t) => t.done).length,
    total: tasks.length,
  };
}
