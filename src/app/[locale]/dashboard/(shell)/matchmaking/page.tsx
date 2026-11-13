import { redirect } from "next/navigation";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { requireUserPage } from "@/lib/auth/guard";
import { setRequestLocale } from "next-intl/server";
import MatchmakingWorkspace from "@/components/dashboard/matchmaking/MatchmakingWorkspace";
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; connection?: string; mentor?: string }> }) {
  const { locale } = await params; const session = await requireUserPage(locale); setRequestLocale(locale);
  const { tab, connection, mentor } = await searchParams;
  if (tab === "members" || tab === "sharing") {
    const query = new URLSearchParams({ tab: tab === "sharing" ? "messages" : "recommendations" });
    if (connection) query.set("connection", connection);
    redirect(pathForLocale(`/dashboard/matchmaking?${query}`, locale as Locale));
  }
  if (tab === "prospects") redirect(pathForLocale("/dashboard/agenda#prospects", locale as Locale));
  return <MatchmakingWorkspace key={session!.uid} userId={session!.uid} initialTab={tab} initialMentor={mentor} />;
}
