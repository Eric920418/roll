import { requireUserPage } from "@/lib/auth/guard";
import { getCurrentAccount } from "@/lib/auth/account";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { getDiscoverySnapshot } from "@/lib/discovery/service";
import { discoveryReportSchema, isDiscoveryMember } from "@/lib/discovery/policy";
import PrintReport from "@/components/dashboard/discovery/PrintReport";

export default async function DiscoveryReportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params, l = locale as Locale, zh = locale === "zh-tw";
  await requireUserPage(locale); setRequestLocale(locale);
  const account = await getCurrentAccount(); if (!isDiscoveryMember(account) || !account) redirect(pathForLocale("/dashboard/agenda", l));
  const snapshot = await getDiscoverySnapshot(account.id), report = discoveryReportSchema.safeParse(snapshot.report).data;
  if (!snapshot.paid || !report || snapshot.total < 10) redirect(`${pathForLocale("/dashboard/agenda", l)}#discovery`);
  const ids = [...new Set(report.topics.flatMap(topic => topic.evidence.map(source => source.recordId)))];
  return <article className="discovery-report mx-auto max-w-4xl space-y-7 rounded-2xl border border-dark/15 bg-white p-6 sm:p-9">
    <style>{`@media print { body * { visibility: hidden; } .discovery-report, .discovery-report * { visibility: visible; } .discovery-report { position: absolute; inset: 0; width: 100%; max-width: none; border: 0; margin: 0; padding: 0; } .discovery-report button { display: none; } } @page { margin: 18mm; }`}</style>
    <header className="space-y-4 border-b border-dark/15 pb-6"><p className="text-sm font-semibold tracking-[0.15em]">NOVA</p><h1 className="text-3xl font-bold">{zh ? "客戶訪談驗證：證據報告" : "Customer interview validation: evidence report"}</h1><p className="text-dark/65">{account.profile?.companyName || (zh ? "我的公司" : "My company")}</p><p className="text-sm">{zh ? "分析樣本" : "Interview sample"} · {report.total} {zh ? "間不同公司" : "distinct companies"} · {new Intl.DateTimeFormat(zh ? "zh-TW" : "en", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(new Date(report.generatedAt))}</p><PrintReport label={zh ? "列印／另存 PDF" : "Print / save as PDF"} /></header>
    <section className="space-y-5"><h2 className="text-xl font-bold">{zh ? "前三大痛點（依可核對證據，最多三項）" : "Leading pain points (up to three supported by evidence)"}</h2>{!report.topics.length && <p>{zh ? "目前紀錄未形成可核對的痛點分群。" : "The saved records do not support a verifiable pain-point grouping."}</p>}{report.topics.map((topic, index) => <section key={topic.label} className="space-y-3 rounded-xl border border-dark/15 p-5"><h3 className="font-bold">{index + 1}. {topic.label}</h3><p className="text-sm">{topic.count}/{report.total} · {topic.percent}%</p>{topic.evidence.map((source, i) => <blockquote key={`${source.recordId}-${i}`} className="border-l-2 border-dark/25 pl-4 text-sm leading-7"><p>{source.quote}</p><footer className="text-xs text-dark/55">{zh ? "訪談來源" : "Interview source"} #{ids.indexOf(source.recordId) + 1}</footer></blockquote>)}</section>)}</section>
    <section className="space-y-3"><h2 className="text-xl font-bold">{zh ? "下一步驗證行動" : "Next validation actions"}</h2><ol className="list-decimal space-y-2 pl-5 text-sm leading-7">{report.nextMoves.map(move => <li key={move}>{move}</li>)}</ol></section>
    <section className="space-y-3 border-t border-dark/15 pt-6 text-sm leading-7 text-dark/65"><h2 className="font-bold text-dark">{zh ? "方法與限制" : "Method and limitations"}</h2><p>{zh ? "以使用者儲存的訪談，依公司名稱正規化去重，同公司採最近保存的一筆。比例分母為全部有效受訪公司；同一家公司可能提到多個痛點，比例總和不必等於 100%。未列入痛點的受訪者仍計入分母。" : "Company names are normalized and deduplicated; the latest saved interview represents each company. Percentages use all valid companies as the denominator. A company may mention multiple pains, so percentages need not sum to 100%. Companies without a grouped pain remain in the denominator."}</p><p>{zh ? "這是小樣本、自行招募與自行記錄的質性證據，並非獨立查核、統計顯著性、PMF 或市場需求已成立的證明。AI 協助分群並核對原文引用，仍需人工審閱；對外分享前請移除不宜公開的引用內容。" : "This is a small, self-recruited and self-reported qualitative sample, not independent assurance, statistical significance, PMF or proof of market demand. AI groups quotes checked against saved text; human review is still needed. Remove confidential quotations before sharing."}</p></section>
  </article>;
}
