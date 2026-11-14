import Link from "next/link";
import { PlanLocalizationProvider, PlanCopyText } from "@/components/dashboard/PlanLocalization";
import { setRequestLocale } from "next-intl/server";
import { requireUserPage } from "@/lib/auth/guard";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import { getDiscoverySnapshot } from "@/lib/discovery/service";
import { isDiscoveryMember } from "@/lib/discovery/policy";
import { actionProgress } from "@/lib/dashboard/next-steps";
import { homeNextStep } from "@/lib/dashboard/home";
import { getEvents } from "@/lib/cms/content";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import EvidencePanel from "@/components/dashboard/evidence/EvidencePanel";
import PlanRefresh from "@/components/dashboard/PlanRefresh";
import FounderRecommendations from "@/components/dashboard/home/FounderRecommendations";
import RoundtablesPanel from "@/components/dashboard/matchmaking/RoundtablesPanel";
import ReferralPanel from "@/components/dashboard/rewards/ReferralPanel";
import ReturnReminder from "@/components/dashboard/home/ReturnReminder";
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
  const showTaskDescription = plan?.workflowVersion !== 2 || !next.action;
  const task = (<section aria-labelledby="home-task-title" className="rounded-2xl bg-black p-4 text-white sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold tracking-[0.18em] text-white/60">{zh ? "今日任務 · 目前這一步" : "TODAY'S TASK · YOUR CURRENT STEP"}</p></div>
      <h2 id="home-task-title" className="mt-2 max-w-4xl break-words text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{next.action ? <PlanCopyText value={next.action.title} /> : (completedFlow ? (zh ? "已完成驗證" : "Validation complete") : labels[next.kind])}</h2>
      <dl className={"mt-3 grid grid-cols-2 gap-3 border-t border-white/20 pt-3 text-xs" + (showTaskDescription ? " sm:grid-cols-[1.5fr_1fr_1fr]" : "")}>{showTaskDescription && <div className="col-span-2 sm:col-span-1"><dt className="text-white/50">{next.action ? (zh ? '完成標準' : 'Completion criteria') : (zh ? '接下來' : 'What’s next')}</dt><dd className="mt-2 whitespace-pre-wrap break-words leading-5">{next.action ? <PlanCopyText value={next.action.expectedOutcome.text} /> : descriptions[next.kind]}</dd></div>}<div><dt className="text-white/50">{zh?'目前進度':'Saved progress'}</dt><dd className="mt-2 font-semibold tabular-nums">{next.action?.metric?.target != null ? `${next.action.metric.current ?? 0} / ${next.action.metric.target}` : next.kind==='conversation' ? `${discovery?.total ?? 0} / ${discovery?.target ?? 0}` : progress !== null ? `${progress}%` : '—'}</dd></div><div><dt className="text-white/50">{zh?'截止日期':'Due date'}</dt><dd className="mt-2 font-semibold">{milestone?.targetDate || plan?.roadmap?.deadline || '—'}</dd></div></dl>
      <Link href={pathForLocale(next.href, l)} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">{labels[next.kind]} →</Link>
    </section>);
  return <PlanLocalizationProvider planId={plan?.id} revision={plan?.revision}><div className="space-y-4 font-[family-name:var(--font-body)]">
    <PlanRefresh userId={account.id} /><h1 className="sr-only">{zh ? "首頁" : "Home"}</h1>
    <EvidencePanel userId={account.id} compact homeTask={task} />
    <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]"><RoundtablesPanel userId={account.id} compact /><FounderRecommendations /></div>
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-3"><UpcomingEventsRail locale={l} events={events.slice(0,1).map(({id,date,title,location})=>({id,date,title,location}))} /><ReturnReminder date={milestone?.targetDate} /><ReferralPanel compact /></div>
    <section className="grid gap-5 rounded-2xl border border-dark/10 bg-white p-5 sm:grid-cols-[1fr_2fr]" aria-label={zh ? "關注 NOVA" : "Follow NOVA"}><div><p className="text-xs text-dark/45">{zh ? "關注 NOVA" : "FOLLOW NOVA"}</p><h2 className="mt-2 text-sm font-semibold">{zh ? "最新活動、案例與創辦人洞察" : "Events, cases and founder insights"}</h2></div><div className="grid gap-x-6 sm:grid-cols-2">{[{label:'LinkedIn',name:'ROLL ON',url:'https://www.linkedin.com/company/rollon/'},{label:'YouTube',name:'Golden Ticket',url:'https://www.youtube.com/@GOLDENTICKET-rollon'},{label:'Instagram',name:'ROLL ON TAIWAN',url:'https://www.instagram.com/rollon.tw/'}].map(item=><a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-0 items-center gap-3 border-t border-dark/10 text-xs"><span className="text-dark/50">{item.label}</span><span className="flex-1 break-words font-semibold">{item.name}</span><span aria-hidden>↗</span></a>)}</div></section>
  </div></PlanLocalizationProvider>;
}
