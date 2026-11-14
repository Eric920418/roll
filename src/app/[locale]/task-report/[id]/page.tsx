import Image from "next/image";
import QRCode from "qrcode";
import { absoluteUrl, pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getUserSession } from "@/lib/auth/guard";
import { reportAccess } from "@/lib/action-plan/flow/service";
import { CHAPTERS, STEPS, words } from "@/lib/action-plan/flow/catalog";
import { PlanWriteError } from "@/lib/action-plan/service";
import { publicErrorMessage, logSecurityError } from "@/lib/security/log";
import PrintButton from "@/components/dashboard/flow/PrintButton";
export const metadata: Metadata = { title: "NOVA · Document", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string; locale: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id, locale } = await params, { token } = await searchParams, session = await getUserSession(), zh = locale === "zh-tw";
  let data: Awaited<ReturnType<typeof reportAccess>> | null = null, message = "";
  try { data = await reportAccess(id, session?.uid, token); }
  catch (error) { message = error instanceof PlanWriteError ? "HTTP " + error.status + "\n" + error.message : publicErrorMessage(logSecurityError("flow.report_page", error)); }
  if (!data) return <main className="mx-auto max-w-xl space-y-5 p-8"><h1 className="text-2xl font-bold">{zh ? "文件無法開啟" : "Document unavailable"}</h1><p role="alert" className="whitespace-pre-wrap break-words">{message}</p></main>;
  const verificationUrl = absoluteUrl("/task-report/" + id, locale as Locale) + (token ? "?token=" + encodeURIComponent(token) : "");
  const headline=data.step==="05-3"?data.sections[0]?.body.split("\n")[0]?.match(/^(?:結論|Conclusion)[:：]\s*(.{1,180})$/i)?.[1]:null;
  const qr = await QRCode.toDataURL(verificationUrl, { width: 220, margin: 4, errorCorrectionLevel: "M" });
  return <main className="relative isolate mx-auto max-w-3xl space-y-8 px-5 py-12 print:m-0 print:max-w-none print:p-0">
    <style>{"@media print { @page { size:A4; margin:18mm; } .report-watermark { position:fixed; } }"}</style>
    <div aria-hidden="true" className="report-watermark pointer-events-none fixed inset-0 -z-10 flex -rotate-35 items-center justify-center text-[110px] font-black opacity-[.03]">NOVA AI</div>
    <header className="space-y-4 border-b border-black pb-6"><p className="text-xs font-semibold tracking-widest">NOVA AI · {data.code}</p><h1 className="text-3xl font-bold">{headline||words(STEPS.find(s => s.id === data.step)!.title, locale)}</h1><p>{data.goal}</p><p className="text-sm text-dark/60">{data.completedAt ? (zh ? "已完成成果快照 · " : "Completed result snapshot · ") + data.completedAt.slice(0, 10) : (zh ? "草稿，尚未確認完成" : "Draft, not yet completed")}</p><p className="text-xs text-dark/60">{zh?"報告產生日期：":"Generated: "}{new Intl.DateTimeFormat(locale,{timeZone:"Asia/Taipei",dateStyle:"medium"}).format(new Date())}</p><p className="text-xs text-dark/60">{zh ? "版本指紋" : "Version fingerprint"} {data.version}</p><PrintButton zh={zh} /></header>
    {data.step === "05-3" && <dl className="grid grid-cols-3 gap-5 border-b pb-6">{[[data.counts.conversations,zh?"已存客戶對話":"Saved conversations"],[data.counts.companies,zh?"不同公司":"Distinct companies"],[data.counts.payments,zh?"已核對付款公司":"Verified paying companies"]].map(([value,label])=><div key={label}><dd className="text-3xl font-bold">{value}</dd><dt className="mt-2 text-xs">{label}</dt></div>)}</dl>}
    {data.sections.map((s, i) => <section key={s.id} className="break-inside-avoid space-y-3"><h2 className="text-xl font-bold">{String(i+1).padStart(2,"0")} · {words(CHAPTERS[data.step]![i], locale)}</h2><p className="whitespace-pre-wrap break-words text-base leading-8">{s.body || (zh ? "待補充" : "To complete")}</p></section>)}
    <aside className="flex break-inside-avoid flex-wrap items-center gap-5 rounded-xl border p-5"><Image unoptimized src={qr} width={132} height={132} alt={zh ? "本報告唯讀驗證入口 QR Code" : "QR code for this report's read-only verification page"} /><div className="min-w-0 flex-1"><h2 className="font-bold">{zh?"核對這份報告":"Verify this report"}</h2><p className="mt-2 text-sm">{data.code} · {data.version}</p><p className="mt-2 text-sm">{token ? (zh?"分享連結至 "+data.shareExpires?.slice(0,10)+" 有效，撤銷或來源變更後停止開放。":"Shared until "+data.shareExpires?.slice(0,10)+"; revoked or changed sources invalidate access.") : (zh?"此版本預設私密；掃描後須以本人帳號登入。需要對外分享時，請先在今日任務建立分享連結，再從該連結列印。":"Private by default; owner login is required. To share externally, create a sharing link in today's tasks and print that version.")}</p><a href={verificationUrl} className="mt-3 inline-flex min-h-11 items-center text-sm underline">{zh?"開啟即時唯讀驗證頁":"Open the live verification page"} ↗</a></div></aside>
    <footer className="border-t pt-5 text-sm text-dark/60">{zh ? "由 NOVA AI 依會員已保存與確認的成果整理。" : "Prepared by NOVA AI from the member's saved and confirmed results."}<a className="mt-3 block min-h-11 py-2 underline print:hidden" href={pathForLocale("/dashboard/agenda",locale as Locale)}>{zh?"回到今日任務":"Back to today's tasks"}</a></footer>
  </main>;
}
