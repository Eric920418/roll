import type { Metadata } from "next";
import { confirmation } from "@/lib/action-plan/flow/service";
import { PlanWriteError } from "@/lib/action-plan/service";
import { publicErrorMessage, logSecurityError } from "@/lib/security/log";
import Confirmation from "@/components/dashboard/flow/Confirmation";
export const metadata: Metadata = { title: "NOVA · Customer confirmation", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string; locale: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id, locale } = await params, { token = "" } = await searchParams;
  let data: Awaited<ReturnType<typeof confirmation>> | null = null, message = "";
  try { data = await confirmation(id, token); }
  catch (error) { message = error instanceof PlanWriteError ? "HTTP " + error.status + "\n" + error.message : publicErrorMessage(logSecurityError("flow.confirm_page", error)); }
  if (!data) return <main className="mx-auto max-w-xl space-y-5 p-8"><h1 className="text-2xl font-bold">{locale === "zh-tw" ? "確認連結無法開啟" : "Confirmation link unavailable"}</h1><p role="alert" className="whitespace-pre-wrap break-words">{message}</p></main>;
  return <Confirmation id={id} token={token} statement={data.statement} answered={data.answered} locale={locale} />;

}
