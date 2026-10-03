import { getTranslations } from "next-intl/server";
import Link from "next/link";
import ActionTaskRow from "../ActionTaskRow";
import ActionPlanBuilder from "@/components/dashboard/ActionPlanBuilder";
import type { Locale } from "@/i18n/routing";
import {
  calculateDashboardProgress,
  DASHBOARD_PROGRESS_GROUPS,
  nextCompanyStage,
} from "@/lib/action-plan/dashboard";
import { bottleneckLabel } from "@/lib/action-plan/constants";
import type { ActionPlanDto } from "@/lib/action-plan/service";

type Props = {
  locale: Locale;
  plan: ActionPlanDto | null;
  isPaying: boolean;
  agendaHref: string;
  billingHref: string;
};

export default async function ActionPlanOverview({
  locale,
  plan,
  isPaying,
  agendaHref,
  billingHref,
}: Props) {
  const t = await getTranslations({
    locale,
    namespace: "Dashboard.home.actionSummary",
  });
  const progress = calculateDashboardProgress(plan?.actions ?? []);
  const nextStage = plan ? nextCompanyStage(plan.diagnosis.companyStage) : null;
  const currentMilestone = plan?.roadmap?.milestones.find(m => !m.achievedAt);
  const awaitingOutcome = currentMilestone?.status === "awaiting";
  const needsNextStage = currentMilestone?.status === "unplanned";
  const allDone = Boolean(plan && (plan.roadmap ? !currentMilestone : plan.actions.every((action) => action.done)));

  return (
    <div id="action-plan-summary" className="flex scroll-mt-24 flex-col gap-6">
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <section aria-labelledby="company-status-heading" className="min-w-0 rounded-2xl border border-dark/10 bg-white p-5">
          <h2
            id="company-status-heading"
            className="text-lg font-extrabold text-dark font-[family-name:var(--font-heading)]"
          >
            {t("statusEyebrow")}
          </h2>
          <div className="mt-3 divide-y divide-dark/10">
            <StatusCard
              href={agendaHref}
              label={t("stage.label")}
              value={plan?.diagnosis.companyStage ?? t("stage.empty")}
              detail={
                plan
                  ? plan.diagnosis.stageReason
                  : isPaying
                    ? t("stage.emptyPaidDetail")
                    : t("stage.emptyFreeDetail")
              }
              meta={
                plan
                  ? nextStage
                    ? t("stage.next", { stage: nextStage })
                    : t("stage.final")
                  : null
              }
              tone={plan ? "good" : "neutral"}
            />
            <StatusCard
              href={agendaHref}
              label={t("bottleneck.label")}
              value={
                plan
                  ? `${plan.diagnosis.bottleneckGroup} · ${bottleneckLabel(
                      plan.diagnosis.bottleneckGroup,
                      plan.diagnosis.bottleneckCode,
                    )}`
                  : t("bottleneck.empty")
              }
              detail={
                plan
                  ? plan.diagnosis.bottleneckReason
                  : t("bottleneck.emptyDetail")
              }
              tone={plan ? "warn" : "neutral"}
            />

          </div>
        </section>

        <section aria-labelledby="home-progress-heading" className="nova-dashboard-card min-w-0 rounded-2xl border border-dark/10 bg-dark p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent font-[family-name:var(--font-heading)]">
            {t("progress.eyebrow")}
          </p>
          <h2 id="home-progress-heading" className="mt-1 text-lg font-extrabold font-[family-name:var(--font-heading)]">
            {t("progress.title")}
          </h2>
          <div className="mt-5 space-y-4">
            {DASHBOARD_PROGRESS_GROUPS.map((group) => {
              const row = progress[group];
              const value = row.percent;
              return (
                <div key={group}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold">{t(`progress.${group}`)}</span>
                    <span className="text-white/65">
                      {value == null ? "—" : `${value}%`}
                    </span>
                  </div>
                  <div
                    {...(value == null
                      ? { "aria-label": t("progress.emptyAria", { group: t(`progress.${group}`) }) }
                      : {
                          role: "progressbar",
                          "aria-label": t("progress.aria", { group: t(`progress.${group}`) }),
                          "aria-valuemin": 0,
                          "aria-valuemax": 100,
                          "aria-valuenow": value,
                        })}
                    className="mt-2 h-2 overflow-hidden rounded-full bg-white/12"
                  >
                    {value == null ? null : (
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-500"
                        style={{ width: `${value}%` }}
                      />
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-white/40">
                    {row.total > 0
                      ? t("progress.count", { done: row.done, total: row.total })
                      : t("progress.noActions")}
                  </p>
                </div>
              );
            })}
          </div>
          {plan?.actions.filter(a => a.metric?.target != null).map(a => <p key={a.id} className="mt-2 text-xs text-white/70">{a.title}: {a.metric?.current ?? (locale === "zh-tw" ? "尚未回報" : "Not reported")}/{a.metric?.target} {a.metric?.unit}</p>)}
          {awaitingOutcome && <p className="mt-3 text-sm font-bold">{locale === "zh-tw" ? "任務已完成，待確認實際成果" : "Tasks complete; awaiting outcome confirmation"}</p>}
        </section>
      </div>

      <section id="next-three-moves" tabIndex={-1} aria-labelledby="next-moves-heading" className="scroll-mt-6 rounded-2xl border border-primary/20 bg-primary/[0.025] p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
              {t("next.eyebrow")}
            </p>
            <h2
              id="next-moves-heading"
              className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]"
            >
              {t("next.title")}
            </h2>
          </div>
          {plan ? (<><Link href={`${agendaHref}#weekly-check-in`} className="inline-flex min-h-11 items-center text-sm font-bold">Weekly Check-in →</Link>
            <Link
              href={agendaHref}
              className="inline-flex min-h-11 items-center text-sm font-bold text-primary hover:text-primary-dark"
            >
              {t("next.viewAll")} →
            </Link></>
          ) : null}
        </div>

        <div className="mt-4">
          {plan && plan.nextMoves.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {plan.nextMoves.map((action) => (
                <ActionTaskRow key={action.id} action={action} readOnly href={`${agendaHref}#action-${action.id}`} />
              ))}
            </div>
          ) : plan ? (
            <div className="flex min-h-52 flex-col justify-between rounded-2xl border border-dashed border-dark/15 bg-white/55 p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                  {awaitingOutcome ? t("next.outcomeTitle") : needsNextStage ? t("next.nextStageTitle") : allDone ? t("next.completeEyebrow") : t("next.blockedEyebrow")}
                </p>
                <h3 className="mt-2 text-xl font-extrabold text-dark font-[family-name:var(--font-heading)]">
                  {awaitingOutcome ? t("next.outcomeTitle") : needsNextStage ? t("next.nextStageTitle") : allDone ? t("next.completeTitle") : t("next.blockedTitle")}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-dark/60">
                  {awaitingOutcome ? t("next.outcomeBody") : needsNextStage ? t("next.nextStageBody") : allDone
                    ? t("next.completeBody")
                    : t("next.blockedBody", { count: plan.blockers.length })}
                </p>
              </div>
              <Link
                href={agendaHref}
                className="mt-5 inline-flex min-h-11 w-fit items-center rounded-xl bg-dark px-5 py-2.5 text-sm font-bold text-white hover:bg-dark/90"
              >
                {t("next.openPlan")}
              </Link>
            </div>
          ) : (
            <div className="flex min-h-52 flex-col justify-between rounded-2xl border border-dashed border-primary/25 bg-primary/[0.035] p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                  {t("next.emptyEyebrow")}
                </p>
                <h3 className="mt-2 text-xl font-extrabold text-dark font-[family-name:var(--font-heading)]">
                  {t("next.emptyTitle")}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-dark/60">
                  {t("next.emptyBody")}
                </p>
              </div>
              <div className="mt-5">
                {isPaying ? (
                  <ActionPlanBuilder />
                ) : (
                  <Link
                    href={billingHref}
                    className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary/90"
                  >
                    {t("next.upgrade")}
                  </Link>
                )}
              </div>
            </div>
          )}

          {plan && plan.nextMoves.length > 0 && plan.nextMoves.length < 3 ? (
            <div
              role="status"
              className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <p className="font-bold">
                {plan.blockers.length > 0
                  ? t("next.fewerBlocked", { count: plan.blockers.length })
                  : t("next.fewerAvailable", { count: plan.nextMoves.length })}
              </p>
              {plan.blockers.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {plan.blockers.map((blocker) => (
                    <li key={blocker.id}>
                      {blocker.title}: {blocker.missingLink ? t("next.missingDependency") : blocker.dependencies.join(", ")}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function StatusCard({
  href,
  label,
  value,
  detail,
  meta,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  detail: string;
  meta?: string | null;
  tone: "good" | "warn" | "neutral";
}) {
  const dot =
    tone === "good"
      ? "bg-green-500"
      : tone === "warn"
        ? "bg-accent"
        : "bg-dark/20";

  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-col py-4 transition hover:text-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-dark/40 font-[family-name:var(--font-heading)]">
          {label}
        </p>
        <span aria-hidden className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      </div>
      <h3 className="mt-2 break-words [overflow-wrap:anywhere] text-lg font-extrabold leading-6 text-dark transition-colors group-hover:text-primary font-[family-name:var(--font-heading)]">
        {value}
      </h3>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-dark/55" title={detail}>
        {detail}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-[11px] font-bold text-primary">
        {meta ? <span>{meta}</span> : null}
      </div>
    </Link>
  );
}
