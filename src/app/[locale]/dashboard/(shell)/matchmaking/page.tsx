import { requireUserPage } from "@/lib/auth/guard";
import { setRequestLocale } from "next-intl/server";
import MatchmakingWorkspace from "@/components/dashboard/matchmaking/MatchmakingWorkspace";
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await params; const session = await requireUserPage(locale); setRequestLocale(locale);
  return <MatchmakingWorkspace key={session!.uid} userId={session!.uid} initialTab={(await searchParams).tab} />;
}
