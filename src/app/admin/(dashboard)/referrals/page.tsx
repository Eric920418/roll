import { requireAdminPage } from "@/lib/auth/guard";
import ReferralReview from "@/components/admin/ReferralReview";
export default async function Page() { await requireAdminPage(); return <ReferralReview />; }
