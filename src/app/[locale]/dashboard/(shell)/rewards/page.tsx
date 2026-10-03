import { setRequestLocale } from "next-intl/server";
import RewardsPage from "@/components/dashboard/rewards/RewardsPage";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; setRequestLocale(locale);
  return <RewardsPage />;
}
