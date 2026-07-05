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

  // 落地起點錨 = 註冊日；系統依此推算各任務建議完成日
  const user = await prisma.user.findUnique({
    where: { id: account.id },
    select: { createdAt: true },
  });
  const anchor = user?.createdAt ?? new Date();

  const focus = computeFocus(account, l);
  const milestones = computeMilestones(account, l);
  const agenda = computeTasks(groups, account.checklistState, anchor, new Date());

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      {groups.length === 0 ? (
        // 尚未填 needs → 無法生成任務，引導去帳號頁
        <div className="mt-7 rounded-2xl border border-dark/10 bg-white p-7">
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
      ) : (
        <AgendaBoard focus={focus} milestones={milestones} agenda={agenda} />
      )}
    </div>
  );
}
