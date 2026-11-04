import { requireAdminPage } from "@/lib/auth/guard";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";

export const dynamic = "force-dynamic";
export default async function AnalyticsPage() {
  await requireAdminPage();
  return <AnalyticsDashboard />;
}
