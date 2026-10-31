import { requireUserPage } from "@/lib/auth/guard";
import { setRequestLocale } from "next-intl/server";
import MatchmakingPage from "@/components/dashboard/matchmaking/MatchmakingPage";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; await requireUserPage(locale); setRequestLocale(locale); return <MatchmakingPage editOnly />; }
