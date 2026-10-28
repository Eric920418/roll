import Link from "next/link";
import { getCurrentAccount } from "@/lib/auth/account";
import { features } from "@/lib/network/access";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import { validationSnapshot } from "@/lib/validation/service";
import { interviewCompanies } from "@/lib/matchmaking/schema";
import { prisma } from "@/lib/prisma";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { PrintPlan } from "@/components/dashboard/network/NetworkPanels";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale, zh = locale === "zh-tw", account = await getCurrentAccount();
  if (!account) return null;
  if (!(await features(account.id)).portal) return <p>{zh ? "商業計畫書匯出需要 NOVA" : "Business plan export requires NOVA"} <Link href={pathForLocale("/dashboard/account", locale)}>{zh ? "查看方案" : "View plans"}</Link></p>;
  const profile = account.profile, plan = await getActiveActionPlan(account.id), journey = await prisma.discoveryJourney.findUnique({ where: { userId: account.id } });
  const selected = plan ? { planId: plan.id } : journey ? { journeyId: journey.id } : null;
  const validation = selected ? await validationSnapshot(account.id, selected) : null;
  const empty = zh ? "尚未提供" : "Not provided";
  return <article className="mx-auto max-w-4xl space-y-8 bg-white p-6 print:p-0"><header><p>NOVA · {zh ? "商業計畫書" : "Business plan"}</p><h1 className="my-4 text-3xl font-bold">{profile?.companyName || empty}</h1><p>{zh ? "依會員已儲存資料整理，非 AI 補寫或市場需求認證。" : "Prepared from saved member records; no AI-written claims or certification of demand."}</p><PrintPlan /></header><section><h2 className="text-xl font-bold">{zh ? "公司與產品" : "Company & product"}</h2><p>{profile?.oneLinePitch || empty}</p><p>{profile?.industry || empty} · {profile?.country || empty}</p></section><section><h2 className="text-xl font-bold">ICP</h2><p className="whitespace-pre-wrap">{profile?.icp || empty}</p></section><section><h2 className="text-xl font-bold">{zh ? "目標與里程碑" : "Goals & milestones"}</h2>{plan?.roadmap && <><p className="my-3">{plan.roadmap.goal} · {plan.roadmap.deadline}</p><ul className="list-inside list-disc">{plan.roadmap.milestones.map(m => <li key={m.id}>{m.title} · {m.targetDate} · {m.status}</li>)}</ul></>}{plan ? <ul className="list-inside list-disc space-y-3">{plan.actions.map(a => <li key={a.id}>{a.title} · {a.done ? (zh ? "已完成" : "Completed") : (zh ? "進行中" : "In progress")}<p className="pl-4 text-sm">{a.expectedOutcome.text}</p></li>)}</ul> : <p>{empty}</p>}</section><section><h2 className="text-xl font-bold">{zh ? "驗證成果" : "Validation evidence"}</h2>{validation ? <><p>{zh ? "已存訪談紀錄" : "Saved interviews"}: {interviewCompanies(validation.rows.map(r => r.insight))}</p><p>{zh ? "已收款公司" : "Paying companies"}: {validation.summary.paid} · {zh ? "已簽付費合約公司" : "Companies with signed paid contracts"}: {validation.summary.signed}</p><p className="text-sm">{zh ? "付款／簽約為會員提交證據，不是平台金流自動驗證；不附原始筆記與私密附件。" : "Payments and contracts are member-submitted evidence, not automatic payment verification. Raw notes and private attachments are excluded."}</p></> : <p>{empty}</p>}</section><p className="text-xs text-dark/60">{zh ? "本次匯出不會自動開放投資人分享。" : "Exporting does not automatically share this document with investors."}</p></article>;
}
