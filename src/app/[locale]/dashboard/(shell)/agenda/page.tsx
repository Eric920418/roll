import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { requirePlan } from "@/lib/billing/gate";
import { prisma } from "@/lib/prisma";
import { buildChecklist } from "@/lib/tools/checklist";
import {
  computeFocus,
  computeMilestones,
  computeTasks,
} from "@/lib/dashboard/agenda";
import { pathForLocale } from "@/lib/routes";
import AgendaBoard from "@/components/dashboard/AgendaBoard";
import PlanPaywall from "@/components/dashboard/PlanPaywall";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export default async function AgendaPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard.agenda" });

  // layout 已確保登入；null → 方案不足（付費牆）
  const account = await requirePlan("pro");

  if (!account) {
    return (
      <div className="font-[family-name:var(--font-body)]">
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>
        <PlanPaywall locale={l} />
      </div>
    );
  }

  const needs = account.profile?.needs ?? [];
  const groups = buildChecklist(needs, l);

  // 落地起點錨 = 註冊日（account DTO 已帶，不必再查一次 User）
  const anchor = account.createdAt;
  const customTasks = await prisma.landingTask.findMany({
    where: { userId: account.id },
    select: { id: true, title: true, dueAt: true, done: true },
    orderBy: { createdAt: "asc" },
  });

  const focus = computeFocus(account, l);
  const milestones = computeMilestones(account, l);
  const agenda = computeTasks(
    groups,
    account.checklistState,
    anchor,
    new Date(),
    customTasks,
    t("customGroup"),
  );

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      {/*
        任務清單為空時的引導卡（尚未填 needs → 系統無法生成任務）。
        以 slot 傳進 client 元件，讓「新增任務」按鈕在這種情況下依然可用 —
        否則沒填需求的會員會卡在死路：看不到清單，也就加不了自己的任務。
      */}
      <AgendaBoard
        focus={focus}
        milestones={milestones}
        agenda={agenda}
        emptyState={
          <div className="rounded-2xl border border-dashed border-dark/15 bg-white p-7">
            <h2 className="text-xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
              {t("emptyTitle")}
            </h2>
            <p className="mt-2 text-sm text-dark/60">{t("emptyBody")}</p>
            <Link
              href={pathForLocale("/dashboard/account", l)}
              className="mt-5 inline-block rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 font-[family-name:var(--font-heading)]"
            >
              {t("emptyCta")}
            </Link>
          </div>
        }
      />
    </div>
  );
}
