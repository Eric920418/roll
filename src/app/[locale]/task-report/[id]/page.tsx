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
  return <main className="mx-auto max-w-3xl space-y-8 px-5 py-12 print:m-0 print:max-w-none print:p-0"><style>{"@media print { [data-custom-cursor] { display:none!important; } @page { margin:18mm; } }"}</style><header className="space-y-4 border-b pb-6"><p className="text-xs font-semibold tracking-widest">NOVA AI · {data.code}</p><h1 className="text-3xl font-bold">{words(STEPS.find(s => s.id === data.step)!.title, locale)}</h1><p>{data.goal}</p><p className="text-sm text-dark/60">{data.completedAt ? (zh ? "已完成成果快照 · " : "Completed result snapshot · ") + data.completedAt.slice(0, 10) : (zh ? "草稿，尚未確認完成" : "Draft, not yet completed")}</p><PrintButton zh={zh} /></header>{data.sections.map((s, i) => <section key={s.id} className="break-inside-avoid space-y-3"><h2 className="text-xl font-bold">{words(CHAPTERS[data.step]![i], locale)}</h2><p className="whitespace-pre-wrap break-words text-base leading-8">{s.body || (zh ? "待補充" : "To complete")}</p></section>)}<footer className="border-t pt-5 text-sm text-dark/60">{zh ? "由 NOVA AI 依會員已保存與確認的成果整理。" : "Prepared by NOVA AI from the member's saved and confirmed results."}</footer></main>;
}
