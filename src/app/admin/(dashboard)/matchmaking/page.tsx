import { requireAdminPage } from "@/lib/auth/guard";
import MatchmakingReview from "@/components/admin/MatchmakingReview";
export default async function Page() { await requireAdminPage(); return <MatchmakingReview />; }
