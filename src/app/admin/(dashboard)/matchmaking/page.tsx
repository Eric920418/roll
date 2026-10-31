import { requireAdminPage } from "@/lib/auth/guard";
import MatchmakingReview from "@/components/admin/MatchmakingReview";
import ProspectingMonitor from "@/components/admin/ProspectingMonitor";
export default async function Page() { await requireAdminPage(); return <><ProspectingMonitor /><MatchmakingReview /></>; }
