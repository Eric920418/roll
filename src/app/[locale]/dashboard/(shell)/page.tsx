import Link from "next/link";
import { planText } from "@/lib/action-plan/display";
import { setRequestLocale } from "next-intl/server";
import { requireUserPage } from "@/lib/auth/guard";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import { personalizationResponses } from "@/lib/action-plan/personalization";
import { getDiscoverySnapshot } from "@/lib/discovery/service";
import { isDiscoveryMember } from "@/lib/discovery/policy";
import { homeNextStep } from "@/lib/dashboard/home";
import { actionProgress } from "@/lib/dashboard/next-steps";
import { getEvents } from "@/lib/cms/content";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import EvidencePanel from "@/components/dashboard/evidence/EvidencePanel";
import PlanRefresh from "@/components/dashboard/PlanRefresh";
import FounderRecommendations from "@/components/dashboard/home/FounderRecommendations";
import RoundtablesPanel from "@/components/dashboard/matchmaking/RoundtablesPanel";
import UpcomingEventsRail from "@/components/dashboard/home/UpcomingEventsRail";

export default async function DashboardOverview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireUserPage(locale);
  setRequestLocale(locale);
  const l = locale as Locale, zh = l === "zh-tw";
  const account = await getCurrentAccount();
  if (!account) return null;
  const isPaying = getEffectivePlan(account) !== "free";
  const [plan, discovery, events] = await Promise.all([
    isPaying ? getActiveActionPlan(account.id) : null,
    isDiscoveryMember(account) ? getDiscoverySnapshot(account.id) : null,
    getEvents(),
  ]);
  const next = homeNextStep({ plan, isPaying, discovery });
  const milestone = plan?.roadmap?.milestones.find(m => !m.achievedAt);
  const answers = plan?.personalization || discovery?.setup?.personalization;
  const goal = plan?.roadmap?.goal || (answers ? personalizationResponses(answers, l)[4].answer : null);
  const labels = zh ? {
    action: "繼續今日任務", outcome: "確認本階段成果", next: "開啟下一階段", complete: "查看已完成的成果", blocked: "查看前置條件",
    setup: "完成五題，找出下一步", conversation: "記錄客戶對話", prospects: "查看優先聯絡公司", starter: "查看起步建議", upgrade: "查看方案與試用狀態",
  } : {
    action: "Continue today's task", outcome: "Confirm this stage's outcomes", next: "Open the next stage", complete: "Review your results", blocked: "Review prerequisites",
    setup: "Answer five questions", conversation: "Record a customer conversation", prospects: "View priority companies", starter: "View your starting direction", upgrade: "View plans & trial status",
  };
  const descriptions = zh ? {
    action: "", outcome: "任務已完成。確認實際成果後，繼續下一個里程碑。", next: "上一階段已確認，現在可以安排下一階段的行動。", complete: "目前計畫已完成，回顧你的紀錄與成果。", blocked: "目前任務有前置條件，查看行動地圖就能找到解鎖方式。",
    setup: "點選五個答案，讓 NOVA 整理你現在最值得做的一件事。", conversation: "從可能的目標客戶開始，記下真實需求與付費訊號。", prospects: "起步對話已達標，接著找出值得優先聯絡的公司。", starter: "起步方向已整理好，從符合你目前狀況的行動開始。", upgrade: "查看目前可用功能與方案；你已儲存的資料會保留。",
  } : {
    action: "", outcome: "Your tasks are complete. Confirm the actual outcomes to move forward.", next: "The previous stage is confirmed. Plan your next stage now.", complete: "Your current plan is complete. Review your evidence and results.", blocked: "Review the action map to see which prerequisites need attention.",
    setup: "Choose five answers. NOVA will identify one clear action for you.", conversation: "Start with potential customers. Capture their needs and payment signals.", prospects: "Your starting conversations are complete. Find companies worth contacting next.", starter: "Your starting direction is ready. Begin with an action that fits your current situation.", upgrade: "Review your available features and plan. Your saved records are retained.",
  };
  const completedFlow = plan?.workflowVersion === 2 && next.kind === "complete";
  if (completedFlow) labels.complete = zh ? "查看與分享驗證報告" : "View and share validation report";
  if (plan?.workflowVersion === 2 && next.kind === "blocked") {
    labels.blocked = zh ? "補正付款證據" : "Review payment evidence";
    descriptions.blocked = zh ? "先前證據已失效，完成紀錄仍保留。補正後即可繼續或分享報告。" : "Earlier evidence needs attention. Completion history is retained; correct the proof to continue or share.";
  }
  const progress = plan ? actionProgress(plan.actions) : next.kind === "conversation" || next.kind === "prospects" ? Math.min(100, Math.round((discovery?.total || 0) / (discovery?.target || 3) * 100)) : null;
  return <div className="space-y-8 font-[family-name:var(--font-body)]">
    <PlanRefresh userId={account.id} />
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-dark/10 pb-6">
      <div><p className="text-xs font-semibold tracking-[0.18em] text-dark/55">NOVA AI</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{zh ? "把下一步，變成進展。" : "Turn your next step into progress."}</h1>
        <p className="mt-3 text-base text-dark/65">{account.firstName ? `${account.firstName}${zh ? "，" : ", "}` : ""}{zh ? "今天，先專心做好一件事。" : "Focus on one meaningful action today."}</p>
      </div><Link className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4" href={pathForLocale("/dashboard/profile", l)}>{zh ? "公司檔案" : "Company profile"} →</Link>
    </header>
    <section aria-labelledby="home-goal-title" className="grid gap-5 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0"><p id="home-goal-title" className="text-xs font-semibold text-dark/55">{zh ? "我的目標" : "MY GOAL"}</p><p className="mt-2 break-words text-xl font-semibold">{goal || (zh ? "先找出最值得驗證的方向" : "Find the direction worth validating")}</p><p className="mt-2 text-sm text-dark/65">{milestone ? `${zh ? "目前里程碑" : "Current milestone"} ${milestone.position + 1} · ${planText(milestone.title, l)}` : plan?.roadmap ? (zh ? "所有里程碑已完成" : "All milestones completed") : (zh ? "依目前紀錄與方案安排下一步" : "Your next step follows your records and access")}</p></div>
      {progress !== null && <div className="min-w-36"><p className="text-sm text-dark/65">{zh ? "目前計畫進度" : "Current plan progress"}</p><p className="mt-1 text-3xl font-semibold tabular-nums">{progress}%</p><progress className="mt-2 h-1.5 w-full accent-black" max={100} value={progress} aria-label={zh ? "目前計畫進度" : "Current plan progress"} /></div>}
    </section>
    <section aria-labelledby="home-task-title" className="rounded-2xl bg-black p-6 text-white sm:p-9">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold tracking-[0.18em] text-white/60">{zh ? "今日任務 · 目前這一步" : "TODAY'S TASK · YOUR CURRENT STEP"}</p>{milestone?.targetDate && <p className="text-sm text-white/70">{zh ? "截止" : "Due"} {milestone.targetDate}</p>}</div>
      <h2 id="home-task-title" className="mt-5 max-w-4xl break-words text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">{(next.action ? planText(next.action.title, l) : "") || (completedFlow ? (zh ? "已完成驗證" : "Validation complete") : labels[next.kind])}</h2>
      <div className="mt-5 max-w-3xl border-t border-white/20 pt-5"><p className="text-xs font-semibold text-white/60">{next.action ? (zh ? "完成標準" : "COMPLETION CRITERIA") : (zh ? "接下來" : "WHAT'S NEXT")}</p><p className="mt-2 whitespace-pre-wrap text-base leading-7 text-white/85">{(next.action ? planText(next.action.expectedOutcome.text, l) : "") || descriptions[next.kind]}</p>{next.action?.metric?.target != null && <p className="mt-3 text-sm tabular-nums">{zh ? "目前進度" : "Progress"} · {next.action.metric.current ?? 0} / {next.action.metric.target}</p>}{next.kind === "conversation" && <p className="mt-3 text-sm">{zh ? "已記錄" : "Recorded"} {discovery?.total} / {discovery?.target} {zh ? "家公司的有效對話" : "valid company conversations"}</p>}</div>
      <Link href={pathForLocale(next.href, l)} className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">{labels[next.kind]} →</Link>
    </section>
    <EvidencePanel userId={account.id} compact />
    <FounderRecommendations />
    <div className="grid min-w-0 gap-5 lg:grid-cols-[1.4fr_1fr]"><RoundtablesPanel userId={account.id} compact /><section className="flex flex-col justify-between rounded-2xl border border-dark/15 bg-white p-6 sm:p-8"><div><p className="text-xs font-semibold tracking-widest text-dark/55">{zh ? "讓交流帶來行動" : "MAKE CONNECTIONS COUNT"}</p><h2 className="mt-6 text-2xl font-semibold">{zh ? "接續你的對話" : "Keep the conversation going"}</h2><p className="mt-3 text-base leading-7 text-dark/70">{zh ? "查看交流邀請與訊息，和適合的人一起推進下一步。" : "Review invitations and messages, and take the next step with the right people."}</p></div><Link href={pathForLocale("/dashboard/matchmaking?tab=messages", l)} className="mt-6 inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-4">{zh ? "前往訊息" : "Open messages"} →</Link></section></div>
    <details className="rounded-2xl border border-dark/10 bg-white px-5 py-2"><summary className="flex min-h-11 cursor-pointer items-center font-semibold">{zh ? "近期活動" : "Community events"}</summary><div className="pb-3"><UpcomingEventsRail locale={l} events={events.slice(0, 4).map(({ id, date, title, location }) => ({ id, date, title, location }))} /></div></details>
  </div>;
}
