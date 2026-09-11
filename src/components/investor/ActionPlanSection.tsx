import { getTranslations } from "next-intl/server";
import { Section } from "./Section";
import { DASHBOARD_PROGRESS_GROUPS } from "@/lib/action-plan/dashboard";
import type { InvestorActionPlanView, InvestorActionView } from "@/lib/investor/portal";
import type { Locale } from "@/i18n/routing";

/**
 * Action Plan。三塊（Next 3 / 進度 / 完整清單）可各自被隱藏。
 *
 * 這裡只拿得到 InvestorActionView 的六個欄位 —— NOVA 的內部評分
 * （impact / difficulty / stageFit / priorityScore）在 portal.ts 就被擋掉了，
 * 不是在這層過濾，所以不會因為改版面而不小心外洩。
 */
export default async function ActionPlanSection({
  locale,
  actionPlan,
}: {
  locale: Locale;
  actionPlan: InvestorActionPlanView;
}) {
  const t = await getTranslations({ locale, namespace: "InvestorView" });
  const tGroup = await getTranslations({
    locale,
    namespace: "Dashboard.home.actionSummary.progress",
  });

  // 先取出來，map 裡才不需要 non-null assertion
  const progress = actionPlan.progress;

  return (
    <Section title={t("actionPlan")}>
      {actionPlan.nextMoves && (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            {t("nextMoves")}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {actionPlan.nextMoves.map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
            {actionPlan.nextMoves.length === 0 && (
              <p className="text-sm text-dark/50">{t("noActions")}</p>
            )}
          </div>
        </>
      )}

      {progress && (
        <div className={actionPlan.nextMoves ? "mt-6" : ""}>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            {t("progress")}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DASHBOARD_PROGRESS_GROUPS.map((group) => {
              const row = progress[group];
              return (
                <div key={group} className="rounded-xl bg-dark/[0.04] p-4">
                  <p className="text-xs text-dark/45">{tGroup(group)}</p>
                  <p className="mt-1 text-2xl font-bold text-dark">
                    {row.percent == null ? "—" : `${row.percent}%`}
                  </p>
                  <p className="mt-1 text-xs text-dark/45">
                    {row.done} / {row.total}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {actionPlan.allActions && (
        <div className={actionPlan.nextMoves || actionPlan.progress ? "mt-6" : ""}>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            {t("allActions", { count: actionPlan.allActions.length })}
          </p>
          <ul className="mt-3 divide-y divide-dark/[0.08]">
            {actionPlan.allActions.map((action) => (
              <li key={action.id} className="flex items-start gap-3 py-3">
                <span
                  aria-hidden
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    action.done ? "bg-primary" : "bg-dark/20"
                  }`}
                />
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${action.done ? "text-dark/45 line-through" : "text-dark"}`}>
                    {action.rank != null && (
                      <span className="mr-2 text-xs font-bold text-primary">#{action.rank}</span>
                    )}
                    {action.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-dark/55">{action.outcomeText}</p>
                </div>
              </li>
            ))}
            {actionPlan.allActions.length === 0 && (
              <li className="py-3 text-sm text-dark/50">{t("noActions")}</li>
            )}
          </ul>
        </div>
      )}
    </Section>
  );
}

function ActionCard({ action }: { action: InvestorActionView }) {
  return (
    <div className="rounded-xl bg-dark/[0.04] p-4">
      <p className="text-xs font-bold text-primary">#{action.rank}</p>
      <p className="mt-2 text-sm font-bold text-dark">{action.title}</p>
      <p className="mt-2 text-xs leading-5 text-dark/55">{action.outcomeText}</p>
    </div>
  );
}
